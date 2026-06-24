# SIMPL-Open Technical Deployment Specification

> **Describes target state per ADR-0037** (an internal FVH decision record, accepted 2026-05-26: Option 1 — stay on the v3.0.4 umbrella-bypass and bump components individually; the structural v3.1.0 single-Application restructure (Option 2) remains a deferred follow-up). External Hetzner validation passed, and as of 2026-06-15 the full IAA component set is pinned to **`authority-iaa v1.2.23`** — one patch ahead of the `v1.2.17` set `governance-authority v3.1.0` ships. The `v1.2.17` numbers in the tables below are therefore one IAA patch behind FVH's actual pins (v1.2.23: users-roles 2.12.9, onboarding 2.12.8, tier1-gateway 2.12.6, sap 2.12.4, tier2-gateway 2.11.4, identity-provider 2.11.4, tier2-proxy 1.5.5). Canonical chart-version source of truth is [sbom/charts.yaml](../sbom/charts.yaml).

**Version:** 3.0
**Source:** [SIMPL-Open Installation Guide](https://code.europa.eu/simpl/simpl-open/documentation/installation-guide)
**Date:** 2026-05-26 (version-drift notes added 2026-06-12)

## 1. Component Architecture

SIMPL-Open is a multi-agent stack built on a shared common-components foundation. The version pins below match `governance-authority v3.1.0` → `authority-iaa v1.2.17`. See [sbom/charts.yaml](../sbom/charts.yaml) for the authoritative chart-version manifest.

This is a component *inventory* — the runtime dependency topology lives in [dependency-graph.svg](dependency-graph.svg) (rendered from [dependency-graph.d2](dependency-graph.d2)).

| Group | Component | Version (v3.1.0 target) | Notes |
|---|---|---|---|
| Common (required foundation) | PostgreSQL | – | FVH: Cloud SQL (managed) |
| Common | Keycloak | codecentric/keycloakx 7.1.8 * | |
| Common | Kafka | 1.2.0 | |
| Common | OpenBao | 1.0.0 | Vault fork |
| Common | EJBCA (Keyfactor) | 1.0.7 | Certificate Authority |
| Common | Elastic Stack | 0.1.18 | FVH: disabled — use GCP Logging |
| Common | Notification Service | 2.0.2 | |
| Governance Authority (required for a data space) | xfsc-catalogue (Neo4J + FC-Service) | 1.0.11 | |
| Governance Authority | Catalogue Query Mapper Adapter | 1.0.13 | |
| Governance Authority | EJBCA | 1.0.7 | |
| Governance Authority | Keycloak | codecentric/keycloakx 7.1.8 * | |
| Governance Authority | authentication-provider | 2.12.4 | |
| Governance Authority | users-roles | 2.12.6 | |
| Governance Authority | tier1-gateway | 2.12.4 | |
| Governance Authority | tier2-gateway | 2.11.3 | |
| Governance Authority | tier2-proxy | 1.5.4 | |
| Governance Authority | sap (security-attributes-provider) | 2.12.3 | |
| Governance Authority | onboarding | 2.12.7 | |
| Governance Authority | identity-provider | 2.11.3 | |
| Governance Authority | Redis (bitnami) | 19.6.0 | |
| Governance Authority | Filebeat | 0.1.18 | |
| Data Provider Agent (optional) | — | — | same common base + provider services |
| Data Consumer Agent (optional) | — | — | same common base + consumer services |

\* **Keycloak override**: upstream v3.1.0 ships `bitnami/keycloak 25.2.0`. FVH overrides this back to `codecentric/keycloakx 7.1.8` per ADR-0037 Option 1 — Bitnami's chart family was deliberately phased out after Bitnami moved its charts behind a pay-wall and the legacy free images degraded.

## 2. Hardware Resource Requirements

### 2.1 Experimental (single-user, no HA)

One table covers Common-only and Common + each agent (one node-pool size, additive resource line per agent):

| Profile | Worker nodes | CPU (total) | Memory | Storage (RWO) |
|---|---:|---:|---:|---:|
| Common only | 1 × 4c/16G | 4 | 16 GB | 11 GB |
| Common + Governance Authority | 2 × 4c/16G | 8 | 32 GB | 11 GB |
| Common + Data Provider | 2 × 4c/16G | 8 | 32 GB | 11 GB |
| Common + Data Consumer | 2 × 4c/16G | 8 | 32 GB | 11 GB |

All components run as single instances. Elastic retention capped at 10 GB. Manual testing only.

### 2.2 Production (3-node HA)

| Layer | CPU (3 × N) | Memory | Storage |
|---|---:|---:|---|
| Common Components | 3 × 8c = 24 | 3 × 32G = 96 GB | 300 GB RWO |
| Governance Authority | 3 × 2c = 6 | 3 × 10G = 30 GB | 50 GB RWO |
| Data Provider | 3 × 4c = 12 | 3 × 8G = 24 GB | 35 GB RWO + 2 GB RWX |
| Data Consumer | 3 × 2c = 6 | 3 × 6G = 18 GB | 20 GB RWO + 2 GB RWX |

Cumulative scenarios:

| Scenario | CPU | Memory | Storage |
|---|---:|---:|---|
| Common + Governance | 30 | 126 GB | 350 GB RWO |
| Common + Governance + 1 Provider | 42 | 150 GB | 385 GB RWO + 2 GB RWX |
| Common + Governance + Provider + Consumer | 48 | 168 GB | 405 GB RWO + 4 GB RWX |

## 3. Infrastructure Prerequisites

### 3.1 Kubernetes Platform

- Kubernetes 1.29.x or newer
- Any "vanilla" Kubernetes. GKE Autopilot is *compatible*, but the FVH evaluation cluster is deliberately **GKE Standard** (regional, default 2× e2-standard-4, autoscale 1–3) for node-level control.
- Storage classes:
  - **ReadWriteOnce (RWO)** — standard persistent volumes (GCE Persistent Disk on GKE)
  - **ReadWriteMany (RWX)** — shared volumes (GCS-FUSE CSI on FVH)

### 3.2 Required Tools & Versions

| Tool | Required | FVH (verified 2026-05-26) |
|---|---|---|
| ArgoCD | 2.11.x+ (3.2.x for ADR-0037 Option 2) | v2.14.9 (fleet `<fleet-argocd-host>`; version not re-verified since 2026-05-26) |
| Helm | 3.14.x+ | available |
| Kubernetes | 1.29.x+ | v1.33.5-gke |
| nginx-ingress | 1.10.x+ | v1.12.3 |
| cert-manager | 1.15.x+ | v1.17.0 |
| GCS-FUSE CSI | latest | available (FVH standard for RWX) |

### 3.3 Networking

- **DNS**: subdomain for agent services (e.g. `*.simpl-experimental.tfds.io`); wildcard certificate recommended
- **Load Balancer IPs**: 1 for ingress + 2 per agent for TLS gateways
- **TLS**: Let's Encrypt via cert-manager (supported); self-signed not supported

### 3.4 Resource Presets

SIMPL-Open Helm charts expose a `resourcePreset` value:

```yaml
resourcePreset: "default"   # CPU/memory requests for production
resourcePreset: "low"        # zero requests — experimental only
```

## 4. Deployment Sequence

Resource budgets per phase live in §2; this section covers ordering and chart sources. All four phases deploy as ArgoCD Applications. Sync waves enforce ordering.

| Wave | Phase | ArgoCD source repo | Depends on |
|---:|---|---|---|
| 0 | Common Components | `simpl-open/development/agents/common_components.git` | (none) |
| 1 | Governance Authority | `simpl-open/development/agents/governance-authority.git` | Common |
| 2 | Data Provider (optional) | `simpl-open/development/agents/data-provider.git` | Common + Governance, participant onboarded |
| 2 | Data Consumer (optional) | `simpl-open/development/agents/consumer.git` | Common + Governance, participant onboarded |

**Common (wave 0)** brings up: PostgreSQL, Keycloak, Kafka, OpenBao, EJBCA, optional Elastic Stack.

**Governance Authority (wave 1)** adds: xfsc-catalogue (Neo4J + FC-Service), catalogue query mapper, onboarding, identity-provider, authentication-provider, tier1/2 gateways, security attribute provider, frontend, users-roles.

**Data Provider / Consumer (wave 2)** require certificate onboarding to complete and the participant to be registered in the data space before deployment.

For the FVH-specific ApplicationSet shape and the v3.1.0 component-pin overrides, see the internal FVH decision record (ADR-0037) and the simpl-eval ApplicationSet manifests in FVH's infrastructure repository.

## 5. GKE Resource Mapping

The FVH deployment runs on **GKE Standard** (the node shapes below are real node-pool sizes, not Autopilot auto-provisioning). On Autopilot the same pod requests would auto-provision equivalent capacity. Cost ranges below are coarse.

### 5.1 Experimental — Common + Governance Authority

```yaml
cluster:
  region: europe-north1
  release_channel: REGULAR (1.29+)
  expected_nodes: ~2 × e2-standard-4 (8 vCPU / 32 GB total)
storage_classes:
  - standard-rwo:   pd.csi.storage.gke.io        # 11 GB pd-standard
  - gcsfuse-rwx:    gcsfuse.csi.storage.gke.io   # if needed
namespaces:
  - simpl-experimental-common
  - simpl-experimental-governance
```

Indicative monthly cost (europe-north1): **~€85–125** (compute + storage; LB and egress minimal).

### 5.2 Production — Common + Governance + 1 Provider

```yaml
cluster:
  region: europe-north1
  expected_nodes: ~6–8 × e2-standard-8 (48–64 vCPU / 192–256 GB total)
storage:
  - 385 GB RWO  (pd-ssd recommended for PostgreSQL, Kafka)
  - 2 GB RWX    (gcsfuse)
namespaces:
  - simpl-common
  - simpl-governance
  - simpl-providers
```

Indicative monthly cost: **~€720–970** (compute + SSD storage + 3 LB IPs + egress).

### 5.3 Keycloak override at deployment time

Whichever profile is used, Keycloak must be deployed from `codecentric/keycloakx 7.1.8` (see §1 note). When evaluating ADR-0037 Option 2 (single-Application umbrella), override via `authority_iaa.extraValues.keycloak.{repo_URL,chart_name}`; the per-component ApplicationSet path (Option 1) keeps the existing direct chart pin.

### 5.4 Optimization

- **Experimental**: `resourcePreset: low`, skip Elastic Stack (~30% saving), `pd-standard` storage class.
- **Production**: `resourcePreset: default`, `pd-ssd` for PostgreSQL and Kafka, separate namespaces, Pod Disruption Budgets, GKE monitoring/logging enabled.

## 6. Storage Requirements

| Layer | RWO | RWX |
|---|---|---|
| Common Components | ~300 GB (PostgreSQL 100, Kafka 100, OpenBao 20, Elastic 80) | – |
| Governance Authority | ~50 GB (Neo4J 20, FC-Postgres 10, app 20) | – |
| Data Provider | ~35 GB | 2 GB |
| Data Consumer | ~20 GB | 2 GB |

**RWX via GCS-FUSE (FVH standard)**: mounts a GCS bucket as a filesystem using the GKE-managed `gcsfuse.csi.storage.gke.io` provisioner. Best for read-heavy shared-cache / data-exchange workloads; not suitable for databases or strict POSIX file-locking. Bucket lifecycle policies handle cost management. PVCs use `storageClassName: gcsfuse-rwx`, `accessModes: [ReadWriteMany]`. Configuration examples and provisioner parameters live in upstream GKE docs.

## 7. Deployment Tooling

Per ADR-0037 (decided: Option 1), FVH deploys the stack as ~31 individual ArgoCD Applications generated by an ApplicationSet, not as the upstream umbrella. The materialised ApplicationSet manifests live in FVH's infrastructure repository.

ArgoCD Application sync waves enforce the §4 ordering (wave 0 → 1 → 2). All applications target the `simpl-eval` GKE cluster registered to the FVH fleet ArgoCD at `<fleet-argocd-host>` via GKE Hub + Connect Gateway.

**Secrets** are sourced from Google Secret Manager and delivered to pods via External Secrets Operator. The required secret inventory:

- Common: `postgresql-admin-password`, `keycloak-admin-password`, `kafka-credentials`, `openbao-unseal-keys`, `ejbca-admin-password`
- Governance: `neo4j-password`, `onboarding-api-key`, `identity-provider-secret`
- Data Provider: `provider-certificate`, `provider-private-key`, `data-connector-credentials`

GSM project layout and IAM bindings are documented in the [GCP architecture reference](gcp-architecture.md).

## 8. Next Steps for Deployment

Working commands live in FVH's internal quick-start guide (not part of this export). This section captures the decision flow and a checklist.

### 8.1 Week 1 — Prerequisites

1. **Inspect SIMPL-Open Helm charts** — charts live in GitLab; ArgoCD references them directly via Git source, no local clone needed. For local inspection use `helm template` against the upstream chart repo.
2. **Verify GKE prerequisites** — Kubernetes ≥1.29, ArgoCD ≥2.11 (≥3.2 if pursuing ADR-0037 Option 2), nginx-ingress ≥1.10, cert-manager ≥1.15, GCS-FUSE CSI driver available.
3. **Verify GCS-FUSE storage class** for RWX volumes; the storage class is created during agent deployment with the appropriate GCS bucket reference.
4. **Prepare DNS** — wildcard subdomain pointing at nginx-ingress, cert-manager ClusterIssuer for Let's Encrypt.
5. **Create namespaces** for the experimental scope.

### 8.2 Week 2 — Deploy

1. Review chart `values.yaml`, identify GKE Autopilot overrides, document overrides per component.
2. Create ArgoCD Applications (waves 0, 1, optionally 2) with values overrides.
3. Deploy Common Components (wave 0), wait healthy.
4. Deploy Governance Authority (wave 1), verify SIMPL FE accessible.
5. Validate: health checks, ingress endpoints, certificate issuance, document operational procedures.

### 8.3 Decision Point — End of Week 2

Proceed to production planning iff:

- All components deployed and healthy
- Resource usage within bounds in §2
- Operational complexity manageable for the team
- Concrete use case identified

If any check fails, return to Week 1 and re-scope.

## 9. Operational Considerations

### Monitoring

- **Built-in (Elastic Stack)**: Elasticsearch for logs, Kibana for visualisation, Metricbeat for metrics, Heartbeat for uptime.
- **External (FVH)**: Google Cloud Logging + Monitoring receive container logs and metrics by default on GKE. Alerts route to Google Chat. Optionally integrate Prometheus if Elastic Stack is disabled.

### Backup

| Data | Method | Frequency |
|---|---|---|
| PostgreSQL (or Cloud SQL) | CloudSQL automated backup / `pg_dump` | daily |
| OpenBao secrets | encrypted snapshot to GCS | daily |
| EJBCA certificates + CRLs | Velero or PD snapshot | daily |
| Kafka topics | optional, retention-policy dependent | – |
| Kubernetes resources | Velero | daily |

### Disaster Recovery

- **Experimental**: RPO 24 h / RTO 4 h.
- **Production**: RPO 1 h / RTO 1 h.

DR procedure: restore PVs from snapshots → redeploy ArgoCD Applications → unseal OpenBao (manual key entry) → verify service health → re-issue any expired certificates.

## 10. Operator Skills

A SIMPL-Open operator should be comfortable with: Kubernetes administration, ArgoCD GitOps workflows, Helm chart customization, TLS / PKI (cert-manager + EJBCA), and OpenBao/Vault secrets management. Familiarity with Kafka and the ELK stack helps for log analysis and message-broker troubleshooting.

---

## FVH-internal references

Some material referenced above lives only in FVH's internal infrastructure
repository and is **not** part of this public export; the spec above is
self-contained without it.

- The v3.1.0 adoption decision record (internal ADR-0037)
- The internal quick-start / operations guide
- Live deployment status notes
- The simpl-eval ApplicationSet manifests

---

**Document Status:** Adoption-pending (per ADR-0037)
**Next Review:** After the external Hetzner v3.1.0 validation outcome
**Maintainer:** FVH Infrastructure Team
