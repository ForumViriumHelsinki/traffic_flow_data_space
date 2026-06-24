# SIMPL-Open GCP Architecture

> **Provenance.** This document started life as the 2025-12-09 GCP deployment
> handoff plan ("Architecture Finalized, Implementation Ready"). The plan's
> Phases 1–4 are long complete; it is now maintained as the **GCP architecture
> reference** for the simpl-eval deployment. The step-by-step implementation
> plan was removed 2026-06 — the implementation *is* the deployment's internal
> Terraform module in FVH's infrastructure repository, which is the source of
> truth for everything below.
>
> **Last verified**: 2026-06-12, claim-by-claim against the module's
> `main.tf`, `cloudsql.tf`, `kms.tf`, `fleet.tf`, `variables.tf`.

## Key Decisions

| Component | Decision | Rationale |
|-----------|----------|-----------|
| **GKE Cluster** | GKE Standard, regional (`europe-north1`), public nodes behind VPC firewalls + Cloud NAT | Node-level control for the evaluation; deliberately not Autopilot |
| **PostgreSQL** | Cloud SQL (managed), private IP only | Reduced ops, automated backups |
| **Kafka** | Self-hosted on GKE (Confluent operator) | Cost control, SIMPL compatibility |
| **Secrets** | OpenBao (self-hosted) with GCP KMS auto-unseal; GSM + External Secrets Operator for infrastructure secrets | SIMPL-Open native; no manual unsealing |
| **DNS** | external-dns + Cloud DNS (`tfds.io` public zone) | Automated record management |
| **GitOps** | External fleet ArgoCD `<fleet-argocd-host>` | Centralized management |
| **Connectivity** | GKE Hub fleet membership + Connect Gateway + Workload Identity | No VPC peering required for cluster management |

> **Plan-vs-built deviation.** The original plan called for *private nodes*
> (with a `master_ipv4_cidr_block` of `172.16.0.0/28`) and the STABLE release
> channel. Neither was built: the module has no `private_cluster_config`, and
> no `release_channel` block (it pins `min_master_version = "1.34"`). Outbound
> traffic does go through Cloud NAT, and the cluster is hardened in ways the
> plan didn't mention — Binary Authorization (`PROJECT_SINGLETON_POLICY_ENFORCE`),
> NetworkPolicy enforcement, and the GCE PD CSI driver are enabled.

## Architecture

![SIMPL-Open GCP architecture](gcp-architecture.svg)

(Source: [gcp-architecture.d2](gcp-architecture.d2). The chart/secret
dependency topology *inside* the cluster is a separate diagram:
[dependency-graph.svg](dependency-graph.svg).)

The shape in words:

- The **fleet ArgoCD** on `<fleet-cluster>` (`<fleet-argocd-host>`) deploys to
  the **`gke-simpl-eval`** cluster through **Connect Gateway**
  (`https://connectgateway.googleapis.com/v1/projects/<project-number>/locations/global/gkeMemberships/simpl-eval`),
  authenticated via Workload Identity — no VPC peering, no kubeconfig secrets.
- The cluster runs three groups of namespaces: `simpl-eval-common` (OpenBao,
  Kafka + Confluent operator, notification, ICM, mailpit, pgAdmin, Redpanda
  console, bridge-secrets, Cloud SQL proxy), `simpl-eval-governance` (Keycloak,
  EJBCA, Redis, all SIMPL governance services, frontend), and platform
  namespaces (ingress-nginx, cert-manager, external-secrets, external-dns,
  Twingate connector).
- **Shared GCP services**: Cloud DNS (`tfds.io` public zone, records published
  by external-dns), Cloud SQL PostgreSQL (private IP via service-networking
  peering), Google Secret Manager (infrastructure secrets, synced in-cluster
  by External Secrets Operator), Cloud KMS (OpenBao auto-unseal).

## What exists (Terraform module inventory)

All in the deployment's internal Terraform module, applied via the
**`infrastructure-gcp`** Terraform Cloud workspace (the module is instantiated
from the `gcp/` root — there is no dedicated workspace).

### Networking & cluster (`main.tf`)

| Resource | Name / value |
|---|---|
| VPC + subnet | `google_compute_network.simpl_eval_vpc`; subnet `10.100.0.0/20`, pods `10.101.0.0/16`, services `10.102.0.0/20` |
| Cloud NAT | `google_compute_router.simpl_eval_router` + `_nat` (outbound) |
| GKE cluster | `google_container_cluster.simpl_eval` — name `gke-simpl-eval`, regional (`location = var.region`), `min_master_version = "1.34"`, Workload Identity, Binary Authorization, NetworkPolicy, GCE PD CSI |
| Node pool | `google_container_node_pool.simpl_eval_nodes` — default **2 × e2-standard-4** (`node_count = 2`, autoscale 1–3), HDD (`pd-standard`, SSD-quota workaround) |
| Ingress IP | `google_compute_address.simpl_eval_ingress` (`simpl-eval-ingress-ip`, EXTERNAL) |
| Firewalls | `simpl_eval_ingress` (tcp/80,443 from `0.0.0.0/0`), `simpl_eval_health_checks` (GCP LB ranges) |
| GCS | `google_storage_bucket.simpl_eval_cache` + `gcs_fuse_sa` service account + Workload Identity binding (RWX volumes via GCS FUSE CSI) |
| external-dns | `google_service_account.external_dns` + `roles/dns.admin` + Workload Identity binding; publishes per-host A records into the public `tfds.io` zone (`gcp/dns.tf`) — no wildcard record |

### Cloud SQL (`cloudsql.tf`, `cloudsql_databases.tf`)

| Aspect | Value |
|---|---|
| Instance | `google_sql_database_instance.simpl_eval` — tier `db-custom-1-3840`, `ZONAL` |
| Networking | **Private IP only** (`ipv4_enabled = false`); service-networking VPC peering (`cloudsql_vpc_connection`) — the *only* VPC peering in the design, and it is Cloud SQL's requirement, not cluster management |
| Auth | IAM database users (`google_sql_user.cloudsql_iam_user`/`_iam_account`) + a standard user with generated password; Cloud SQL client SA with token-creator + Workload Identity bindings |
| Databases | `google_sql_database.simpl_databases` (per-service databases via `for_each`) |
| Secrets | connection string + credentials + init scripts written to GSM (`cloudsql_connection`, `cloudsql_credentials`, `cloudsql_init_scripts`) |
| In-cluster access | pods reach the instance via the FVH `helm/cloudsql-proxy` chart (one proxy per namespace) |

### OpenBao KMS auto-unseal (`kms.tf`)

- Key ring `google_kms_key_ring.openbao` (`<openbao-keyring>`, `europe-north1`)
  with crypto key `openbao_unseal` (symmetric, 90-day rotation).
- GCP service account `<openbao-sa>` (in `<gcp-project-id>`) with
  `cloudkms.cryptoKeyEncrypterDecrypter` + `cloudkms.viewer`, bound to the
  OpenBao K8s SA via Workload Identity.
- One-time initialization after a fresh deploy (recovery shares, **not** unseal
  keys — KMS unseals automatically):

```bash
kubectl --context gke_<gcp-project-id>_europe-north1_gke-simpl-eval \
  exec -n simpl-eval-common simpl-eval-common-openbao-0 -- \
  bao operator init -recovery-shares=5 -recovery-threshold=3 -format=json > openbao-init.json
gcloud secrets create <openbao-recovery-keys-secret> \
  --project=<gcp-project-id> --data-file=openbao-init.json
rm openbao-init.json
```

After initialization the pod auto-unseals on every restart; recovery keys are
needed only for privileged operations (root token generation, seal migration).

### Fleet / ArgoCD connectivity (`fleet.tf`)

- `google_gke_hub_membership.simpl_eval` registers the cluster to the fleet.
- `google_service_account.argocd_fleet` with `roles/gkehub.gatewayEditor` +
  `roles/container.admin`, impersonable by the fleet ArgoCD's `argocd-server`
  and `argocd-application-controller` K8s SAs via Workload Identity.
- The ApplicationSet's `destination.server` is the Connect Gateway URL — the
  deployment flow lives in FVH's internal quick-start guide (not part of this
  export).

### Secrets (`secrets.tf`)

- `google_secret_manager_secret.ejbca_rest_api` — the 4-key JSON consumed by
  the EJBCA REST trust chain (the re-seed procedure is captured in FVH's
  internal EJBCA CA re-seed runbook).

## Cost Estimate (Monthly)

These figures are an illustrative example — approximate EUR/month for an
evaluation-sized deployment.

| Component | Configuration | Estimated cost |
|-----------|---------------|----------------|
| GKE Standard cluster | **2× e2-standard-4** nodes (default; autoscale 1–3) | ~€100 |
| GKE management fee | Fixed | €75 |
| Cloud SQL PostgreSQL | db-custom-1-3840 (ZONAL) | ~€35 |
| Cloud NAT | Outbound traffic | ~€20 |
| Cloud DNS | Zone + queries | ~€5 |
| Load balancer | nginx-ingress | ~€20 |
| Persistent disks | Kafka, OpenBao, EJBCA (pd-standard) | ~€30 |
| **Total (evaluation)** | | **~€285/month** |

The original plan budgeted for 3 nodes (~€335/month); the deployed default is 2.

Optimization levers: preemptible/spot nodes (~60% compute saving — module
variable `use_preemptible_nodes`), autoscaling floor of 1 node, committed-use
discounts. Adjust via Terraform, not ad-hoc `gcloud` resizes.

## Troubleshooting

### ArgoCD can't connect to the cluster

```bash
gcloud container fleet memberships list --project=<gcp-project-id>
kubectl get sa argocd-server -n argocd -o yaml | grep iam.gke.io
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller | grep simpl-eval
```

### external-dns not creating records

```bash
kubectl --context gke_<gcp-project-id>_europe-north1_gke-simpl-eval \
  logs -n external-dns -l app.kubernetes.io/name=external-dns
gcloud projects get-iam-policy <gcp-project-id> \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:*external-dns*"
```

### Pods can't reach Cloud SQL

```bash
gcloud compute networks peerings list --project=<gcp-project-id>
gcloud sql instances describe <cloud-sql-instance> --format="value(ipAddresses)"
# then check the in-namespace cloudsql-proxy Deployment and its logs
```

## References

- FVH's internal Terraform module — the implementation
- FVH's internal quick-start guide — deployment flow and operations (not part of this export)
- [endpoints.md](endpoints.md) — public vs Twingate exposure
- [GKE Connect Gateway documentation](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-cluster-services)
- [SIMPL-Open Installation Guide](https://code.europa.eu/simpl/simpl-open/documentation/installation-guide)

---

**Last updated:** 2026-06-12 (distilled from the 2025-12-09 handoff; full
implementation-plan text preserved in git history)
