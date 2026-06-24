# SIMPL-Open Endpoints & Network Exposure

Which simpl-eval URLs are reachable from the public internet, and which are
reachable only over Twingate. Use this when reasoning about attack surface,
onboarding a new app, or deciding where to put an admin tool.

> **Last verified**: 2026-06-12, claim-by-claim against the ApplicationSet
> manifests, `gcp/modules/simpl-eval/` Terraform, and `twingate/resources.tf`.

> **Source of truth.** This table is derived from config, not hand-maintained
> state. If it looks stale, re-derive from:
> - Per-app `ingress.enabled` + `host` in `argocd/applicationsets/simpl-eval/apps/*.yaml`
> - The nginx ingress controller + external-DNS in `argocd/apps/templates/simpl-eval/infrastructure.yaml`
> - The ingress static IP and firewall in `gcp/modules/simpl-eval/main.tf`
> - The public `tfds.io` DNS zone in `gcp/dns.tf`
> - Twingate resources in `twingate/resources.tf`

## How exposure works

**Public path.** A single cluster nginx ingress controller binds a GCP
`google_compute_address` of type **EXTERNAL** (`simpl-eval-ingress-ip`), with a
firewall allowing `tcp/80,443` from `0.0.0.0/0`. `external-dns` (domainFilter
`tfds.io`) publishes records into the **public** `tfds.io` Cloud DNS zone, and
certs are issued by `letsencrypt-prod`. Any app with `ingress.enabled: true` is
therefore a real public HTTPS endpoint, behind only its own application login.

**Twingate path.** The `gke-simpl-eval` remote network has a connector, but only
one resource — the Cloud SQL database — is published through it.

## Internet-accessible URLs (public)

| URL | App | Notes |
|---|---|---|
| `https://simpl.simpl-eval.tfds.io` | frontend | SIMPL web UI |
| `https://governance.simpl-eval.tfds.io` | tier1-gateway | T1 gateway / governance API |
| `https://tls.authority.governance.simpl-eval.tfds.io` | tier2-gateway | T2 TLS authority |
| `https://keycloak.simpl-eval.tfds.io` | keycloak | SSO |
| `https://ejbca.simpl-eval.tfds.io` | ejbca | PKI — mTLS is `optional_no_ca` (client cert optional, **not** enforced) |
| `https://secrets.common.simpl-eval.tfds.io` | openbao | Secrets UI/API |
| `https://redpanda.simpl-eval.tfds.io` | redpanda-console | Kafka console |
| `https://pgadmin.simpl-eval.tfds.io` | pgadmin | DB admin UI |
| `https://mailpit.simpl-eval.tfds.io` | mailpit | Mail catcher UI |

No per-ingress source-IP allowlist (`whitelist-source-range`), basic-auth, or
oauth2-proxy is configured on any of these.

> **Exposure note.** `pgadmin`, `mailpit`, `openbao`, and `redpanda-console` are
> admin/infra tooling exposed to the open internet behind only their own auth.
> Acceptable for an evaluation cluster; before any production use, move them
> behind oauth2-proxy or a `nginx.ingress.kubernetes.io/whitelist-source-range`
> annotation, or to Twingate-only.

## Twingate-only (not internet-exposed)

| Resource | Address | Access |
|---|---|---|
| `<cloud-sql-instance>` | Cloud SQL **private IP**, TCP 5432 | `sysadmins` group only (`ipv4_enabled = false` — no public IP) |

This is the only simpl-eval-specific Twingate resource — a database, not a web
URL. The generic `*.cluster.local` and pod/service-CIDR Twingate resources in
`twingate/resources.tf` belong to `<fleet-cluster>`, not simpl-eval.

## Defined but NOT exposed

Reachable only in-cluster (`ingress.enabled: false`):

- `adapter` — `argocd/applicationsets/simpl-eval/apps/adapter.yaml`
- `xsfc-catalogue` — `argocd/applicationsets/simpl-eval/apps/xsfc-catalogue.yaml`
