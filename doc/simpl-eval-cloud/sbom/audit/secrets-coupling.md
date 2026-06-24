# Audit: Secrets Coupling — Bootstrap Preconditions

**Question:** Map every required pre-existing secret + ExternalSecret + vault annotation across all SIMPL-Eval apps → bootstrap precondition list (what must exist BEFORE first deploy).

**Inputs:**
- `argocd/applicationsets/simpl-eval/apps/*.yaml`
- `argocd/simpl-eval/{gcp-store,ejbca-rest-api-secret,twingate-connector-secret}.yaml`
- `helm/simpl-eval-bridge-secrets/templates/secret.yaml`
- `argocd/secrets/ghcr-cluster-external-secret.yaml`

## Bootstrap Precondition Checklist

The list below is what must exist on the target cluster + GCP Secret Manager + GitHub before the SIMPL-Eval ApplicationSet can sync to a Healthy state. Items are grouped by namespace; cross-cutting infrastructure is at the top.

### Cluster-wide / cross-namespace prerequisites

- [ ] **External Secrets Operator** installed in `external-secrets` namespace (provides `external-secrets.io/v1` CRDs and the controller for ExternalSecret + ClusterSecretStore + ClusterExternalSecret).
- [ ] **GCP service account** `<external-secrets-sa>` with Workload Identity binding to `external-secrets/external-secrets` KSA + `roles/secretmanager.secretAccessor` on Secret Manager.
- [ ] **ClusterSecretStore `gcp-store`** (`argocd/simpl-eval/gcp-store.yaml:8-20`) — points at GCP project `<gcp-project-id>` via Workload Identity.
- [ ] **ClusterExternalSecret `ghcr-login-secret`** (`argocd/secrets/ghcr-cluster-external-secret.yaml`) — synthesises the `ghcr-login-secret` `kubernetes.io/dockerconfigjson` Secret into every namespace labeled `ghcr.forumvirium.fi/pull=enabled`. Required for the ArgoCD CMP sidecar image pull. **The label MUST be set** on `simpl-eval-common`, `simpl-eval-governance`, and `argocd` for the secret to land there. (See internal ArgoCD troubleshooting notes "Repo-Server ImagePullBackOff (GHCR Namespace Label Gap)" for the failure mode.)
- [ ] **Kyverno** present and `add-imagepullsecret` policy active so the pull secret is auto-attached to ServiceAccounts in labeled namespaces (`argocd/kyverno-policies/add-imagepullsecret.yaml`).
- [ ] **cert-manager** installed with `letsencrypt-prod` ClusterIssuer (referenced by every Ingress that terminates TLS — `frontend.yaml:36`, `keycloak.yaml:71`, `ejbca.yaml:42`, etc.).
- [ ] **GCP KMS keyring `<openbao-keyring>`** + crypto key `openbao-unseal` in `<gcp-project-id>/europe-north1` (`openbao.yaml:65-70`) — required for OpenBao auto-unseal.
- [ ] **GCP Service Account** `<openbao-sa>` with `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the keyring + Workload Identity binding to `simpl-eval-common/openbao` KSA.
- [ ] **GCP Cloud SQL instance** `<cloud-sql-instance>` in `<gcp-project-id>:europe-north1` (referenced by `cloudsql-proxy.yaml:23`, `cloudsql-proxy-governance.yaml:23`).
- [ ] **GCP Service Account** `<sql-client-sa>` with Cloud SQL IAM authn role + Workload Identity binding to both `simpl-eval-common/cloudsql-proxy` and `simpl-eval-governance/cloudsql-proxy` KSAs.
- [ ] **GCP Cloud SQL databases** (run `just simpl-eval-grant-iam` to grant): `simpl-eval-governance_authenticationprovider`, `simpl-eval-governance_identityprovider`, `simpl-eval-governance_keycloak`, `simpl-eval-governance_onboarding`, `simpl-eval-governance_securityattributesprovider`, `simpl-eval-governance_usersroles`, plus fc-service / schema-manager / kafka / icm databases as needed.

### GCP Secret Manager preconditions (must exist with values BEFORE first deploy)

- [ ] **`ejbca-rest-api-secret`** — JSON object with keys `client-cert` (base64-encoded PKCS#12), `ca-truststore` (base64-encoded JKS), `client-cert-password`, `truststore-password`. Sourced by `argocd/simpl-eval/ejbca-rest-api-secret.yaml:43-58`. Populated post-EJBCA-bootstrap (extracted from running EJBCA instance — see header comment in `ejbca-rest-api-secret.yaml:1-20`).
- [ ] **`ghcr-login-secret`** (existing in GCP SM, project-wide) — dockerconfigjson value for GHCR pull access; rotation per the project's dependency-management policy.
- [ ] **Twingate connector secret** for the `nimble-otter` connector (`twingate-connector-secret.yaml`).

### Namespace: `simpl-eval-common`

Wave-1 dependencies (must Sync before downstream waves):

- [ ] **`bridge-secrets` Application** (`apps/bridge-secrets.yaml`) — creates 9 generic Opaque Secrets named `<service>.pg-cluster.credentials.postgresql.acid.zalan.do` containing `username`/`password` for: postgres, simpl-eval-governance-fcservice, simpl-eval-governance-authenticationprovider, simpl-eval-governance-ejbca, simpl-eval-governance-identityprovider, simpl-eval-governance-keycloak, simpl-eval-governance-onboarding, simpl-eval-governance-securityattributesprovider, simpl-eval-governance-usersroles. **Single shared password** is currently in `bridge-secrets.yaml:21` (committed plaintext, eval environment). Required by SIMPL charts that look for the Zalando spilo-bridge naming convention; replaces upstream `openbao-init` chart.
- [ ] **OpenBao** standalone instance (`apps/openbao.yaml`) — no upstream secret needed; auto-unseal handled by GCP KMS.
- [ ] **OpenBao admin/root token** — generated at first init; stored in cluster KMS-sealed; not a Kubernetes Secret.

Wave-3 dependencies (after openbao + bridge-secrets are Healthy):

- [ ] **`openbao-config` Application** seeds OpenBao secret engines (`secret/simpl-eval-common`, `secret/simpl-eval-governance`) and creates app roles (`apps/openbao-config.yaml:22-33`). The chart-bundled `agentList.authorities=[simpl-eval-governance]` controls what cross-namespace bridge tokens get generated.

Wave-2 dependency:

- [ ] **`vswh` (vault-secrets-webhook) Application** (`apps/vswh.yaml`) — must be running before any SIMPL pod with `vault.hashicorp.com/*` annotations is scheduled. The webhook injects the vault-agent sidecar at admission time.

### Namespace: `simpl-eval-governance`

- [ ] **`ejbca-rest-api-secret`** — Kubernetes Secret. Provisioned by `argocd/simpl-eval/ejbca-rest-api-secret.yaml` ExternalSecret. Required by `identity-provider` (mounts `client-cert` and `ca-truststore`, references `client-cert-password` + `truststore-password` via `secretKeyRef` at `apps/identity-provider.yaml:39-48`). Bootstrap order: EJBCA must be deployed and operational FIRST → admin extracts the REST-API client cert + CA-truststore → encodes them as base64 strings inside a JSON object → puts that into GCP SM `ejbca-rest-api-secret` → the ExternalSecret refreshes (1h) → identity-provider can start.
- [ ] **`ghcr-login-secret`** (auto-provisioned by ClusterExternalSecret) — required for SIMPL business-service image pulls from `registry.code.europa.eu` IF a per-deployment-pull-secret strategy is added. **CURRENTLY: registry.code.europa.eu is anonymously pullable for the FVH IP range; if EC tightens auth, the bootstrap step grows by 1.**
- [ ] **`<app>.pg-cluster.credentials.postgresql.acid.zalan.do` shared bridge Secret(s)** — provided by `bridge-secrets` app in `simpl-eval-common`. Some SIMPL charts look these up cross-namespace via FQDN-style references; verify per chart.

### Vault annotation contract (cross-cutting)

The following apps include `vault:` blocks in valuesObject that map to `vault.hashicorp.com/*` pod annotations injected at chart render time. Each requires a corresponding role to exist in OpenBao (set up by `openbao-config` Wave 3):

| App | OpenBao role | OpenBao secret path | Source |
|-----|--------------|---------------------|--------|
| adapter | simpl-eval-governance | secret/simpl-eval-governance-adapter-simpl-backend | `apps/adapter.yaml:30-32` |
| authentication-provider | (default chart role) | (chart-default) | `apps/authentication-provider.yaml:64-66` |
| identity-provider | (default) | (chart-default) | `apps/identity-provider.yaml:79-81` |
| onboarding | (default) | (chart-default) | `apps/onboarding.yaml:44-46` |
| sap | (default) | (chart-default) | `apps/sap.yaml:47-49` |
| users-roles | (default) | (chart-default) | `apps/users-roles.yaml:49-51` |
| schema-manager | simpl-eval-governance | secret/simpl-eval-governance-... | `apps/schema-manager.yaml:30-32` |
| xsfc-catalogue (fc-service) | simpl-eval-governance | secret/simpl-eval-governance | `apps/xsfc-catalogue.yaml:29-35` |
| icm | simpl-eval-common | secret/simpl-eval-common | `apps/icm.yaml:30-37` |
| notification | simpl-eval-common | secret/simpl-eval-common | `apps/notification.yaml:30-39` |

If `openbao-config` did not create these roles, the vault-agent sidecar fails to authenticate and the app pod stays in CrashLoopBackOff with a visible vault error.

## Render-time secret references (no preexisting secret needed, but failure mode is silent)

These are inline values that read from a Kubernetes Secret at chart-render time via `secretKeyRef`. The Secret must exist in the namespace at the moment the workload pod starts:

- `identity-provider.yaml:38-48` reads `ejbca-rest-api-secret/client-cert-password` and `ejbca-rest-api-secret/truststore-password` into env vars `EJBCA_KEYSTORE_PASSWORD` / `EJBCA_TRUSTSTORE_PASSWORD`.
- TLS Secrets (`*-tls` per app) — auto-managed by cert-manager; no manual provisioning, but the `letsencrypt-prod` ClusterIssuer must exist.

## Bootstrap Order Summary (top to bottom = sync order)

1. **External Secrets Operator + Kyverno + cert-manager** (cluster-wide platform).
2. **GCP plumbing**: project, KMS keyring + key, Cloud SQL instance + IAM bindings, all Workload Identity bindings.
3. **GCP Secret Manager**: populate `ejbca-rest-api-secret` (JSON with 4 keys) — initially with placeholder values, since the real client-cert is generated by EJBCA later.
4. **simpl-eval-common namespace + simpl-eval-governance namespace** with `ghcr.forumvirium.fi/pull=enabled` label.
5. **ClusterSecretStore `gcp-store`** (`argocd/simpl-eval/gcp-store.yaml`).
6. **ApplicationSet sync waves** (10 waves total, see `applicationset.yaml:25-91`):
   - Wave 1: openbao + bridge-secrets
   - Wave 2: vswh
   - Wave 3: openbao-config
   - Wave 4: cloudsql-proxy + confluent-operator
   - Wave 5: kafka
   - Wave 6: redpanda + notification + mailpit + icm + pgadmin
   - Wave 7: redis (governance)
   - Wave 8: keycloak + ejbca
   - Wave 9: all governance application services
   - Wave 10: gateways + frontend
7. **Post-Wave-8 EJBCA bootstrap**: extract REST-API client cert + CA-truststore from EJBCA → write to GCP SM `ejbca-rest-api-secret` → ExternalSecret refresh (≤ 1h) → identity-provider Pod restarts and starts cleanly. **Without this manual step, identity-provider stays Degraded.**

## Notes

- The `bridge-secrets` chart is FVH's replacement for the upstream `openbao-init` chart, which is incompatible with our Cloud SQL / no-Spilo setup (`charts.yaml:374-377` notes).
- The `Replace=true` sync option on `openbao-config` (`apps/openbao-config.yaml:18-19`) enables ArgoCD to delete+recreate the immutable init-Job on each sync.
- The `authentication-provider` chart renders a separate `create-secret` Job whose API-server-populated fields require ignoreDifferences (`apps/authentication-provider.yaml:26-33`).
