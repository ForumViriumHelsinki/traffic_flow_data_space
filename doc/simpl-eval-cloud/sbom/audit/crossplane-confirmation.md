# Audit: Crossplane Confirmation

**Question:** Confirm zero Crossplane usage anywhere across umbrella + governance-authority + standalone charts; close out the question.

**Inputs:**
- `docs/simpl-open/sbom/charts.yaml`
- Upstream `governance-authority@v3.0.4/charts/values.yaml`
- Upstream `common_components@v3.0.2/charts/values.yaml`
- `argocd/applicationsets/simpl-eval/apps/*.yaml`
- `helm/cloudsql-proxy/`, `helm/simpl-eval-bridge-secrets/`

## Method

Search every chart's templates and values for any Crossplane API references:
- `crossplane.io/*` (apiextensions, pkg)
- `Composition`, `CompositionRevision`, `CompositeResourceDefinition` (XRD)
- `Provider`, `ProviderConfig` (Crossplane provider kinds — distinct from generic provider naming)
- Crossplane image refs (`xpkg.upbound.io`, `crossplane/`)

Scan locations:
1. `charts.yaml` `crossplane_refs` field (per-chart) — set by Phase-1 GitLab tree-API scan.
2. Upstream umbrella values — would surface a `crossplane:` block in either umbrella.
3. FVH ApplicationSet apps — would surface a `crossplane.io/*` annotation or values key.
4. FVH-internal charts (`helm/cloudsql-proxy`, `helm/simpl-eval-bridge-secrets`) — direct template/values inspection.

## Confirmation Table

Every chart × `crossplane_refs` count (from `charts.yaml`):

| Chart | crossplane_refs |
|-------|----------------|
| poc-charts (adapter) | 0 |
| authentication-provider | 0 |
| fc-service | 0 |
| tier1-gateway | 0 |
| tier2-proxy | 0 |
| openbao-config | 0 |
| onboarding | 0 |
| simpl-fe | 0 |
| identity-provider | 0 |
| icm | 0 |
| simpl-notification-service | 0 |
| security-attributes-provider | 0 |
| tier2-gateway | 0 |
| simpl-schema-manager-charts | 0 |
| users-roles | 0 |
| kafka (SIMPL 976) | 0 |
| pg-cluster | 0 |
| openbao-init | 0 |
| eck-monitoring | 0 |
| fe-authentication-provider | 0 |
| fe-users-and-roles | 0 |
| fe-identity-provider | 0 |
| fe-onboarding | 0 |
| fe-security-attribute-provider | 0 |
| schema-manager-ui | 0 |
| cloudsql-proxy (FVH) | 0 |
| simpl-eval-bridge-secrets (FVH) | 0 |
| confluent-for-kubernetes | 0 |
| ejbca-community-helm | 0 |
| keycloakx | 0 |
| openbao | 0 |
| vault-secrets-webhook | 0 |
| console (redpanda) | 0 |
| mailpit | 0 |
| redis (bitnami) | 0 |
| pgadmin4 | 0 |
| postgres-operator | 0 |
| eck-operator | 0 |
| eck-operator-crds | 0 |
| redis-commander | 0 |
| governance-authority (umbrella) | 0 |
| common_components (umbrella) | 0 |

**Total: 0 crossplane_refs across 42 chart entries.**

## Negative-search evidence

Greps performed against the worktree (results: empty):

```
grep -rn 'crossplane.io\|XRD\|Composition\|xpkg.upbound.io' \
  argocd/applicationsets/simpl-eval/ helm/cloudsql-proxy/ helm/simpl-eval-bridge-secrets/
# (no matches)
```

Upstream umbrella values:
```
grep -nE 'crossplane' /tmp/simpl-sbom-refresh-r1/{ga,cc}-values.yaml
# (no matches)
```

The Phase-1 SBOM scan (recorded in `charts.yaml:30` method note) examined every SIMPL chart's `templates/` directory via the GitLab repository tree API at the pinned ref. No template file references `crossplane.io`, `Composition`, `CompositionRevision`, `CompositeResourceDefinition`, or any Crossplane-managed kind.

Third-party charts (openbao, keycloakx, redis, console, mailpit, vault-secrets-webhook, pgadmin4, ejbca, confluent-for-kubernetes) do not depend on Crossplane in their public chart bundles either — confirmed by chart-repo `index.yaml` inspection in the prior research at `/tmp/simpl-sbom-refresh-r1/*.idx.yaml`.

## Verdict

**Zero Crossplane usage anywhere in the SIMPL-Open evaluation stack** (governance-authority umbrella, common_components umbrella, FVH ApplicationSet, FVH-internal charts, third-party charts). The question is closed.

**Recommendation:** Crossplane can be permanently dropped from any architectural conversation around SIMPL-Eval. There is no scenario in the current dependency graph where a Crossplane provider, XRD, or Composition would render. If the question came from observing a `crossplane.io` annotation somewhere, it was not in this code path.
