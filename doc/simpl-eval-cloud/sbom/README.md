# SIMPL-Open SBOM

A static-data inventory of the SIMPL-Open stack as FVH deploys it, plus topic-scoped audit notes for the patterns that are non-obvious from the manifest alone.

## Baseline

**Candidate baseline (2026-05-26)**: `v3.1.0` candidate — chart pins in [`charts.yaml`](charts.yaml) reflect the v3.1.0 / `authority-iaa v1.2.17` target state per the adopted bypass-the-umbrella strategy (Option 1: bump components only; the published umbrella is not deployed). The 8 IAA components jump 3–4 minor versions (auth-provider 2.8.0 → 2.12.4, etc.); `ejbca` and `redis` are unchanged. The v3.1.0 upstream umbrella switches Keycloak to `bitnami/keycloak 25.2.0`, but FVH continues to override back to `codecentric/keycloakx 7.1.8` per the adopted strategy and the project's dependency-management policy (avoid Bitnami charts and images) — both are recorded in the SBOM entry for `keycloakx`.

The v3.1.0 umbrella is distributed as the published Helm chart `authority` at `code.europa.eu/api/v4/projects/902/packages/helm/stable v3.1.0`, which internally pins 3 subcharts (`authority-iaa 1.2.17`, `authority-gaia-x-edc 1.0.1`, `authority-monitoring 0.0.6`). FVH does NOT deploy the published umbrella; we continue to materialise individual ArgoCD Applications and bump each component to the version that `authority-iaa v1.2.17` would pin (the bypass-the-umbrella rationale).

**Deployed today**: the actual deployed state still tracks `governance-authority v3.0.4` + `common_components v3.0.2` (28 ArgoCD Applications in `argocd/applicationsets/simpl-eval/`). The cutover to the v3.1.0 candidate pins is pending Hetzner validation (tracked internally); the live deployed-version snapshot is tracked internally.

## Manifests

| File | Contents |
|---|---|
| [charts.yaml](charts.yaml) | Per-Application chart inventory: chart name, repo, current pin, latest upstream version, FVH-deployed flag |
| [images.yaml](images.yaml) | Container-image inventory per Application: registry, repo, tag, source-of-truth (chart default vs FVH override) |
| [source.yaml](source.yaml) | Source-code inventory: GitLab project path + tag for each SIMPL component, with provenance notes |

`charts.yaml` is the authoritative starting point. Everything else cross-references it.

## Audit topics

Each `audit/*.md` file is a focused note on one cross-cutting concern that needs more context than the manifest itself carries:

| File | Topic |
|---|---|
| [audit/portability-anchors.md](audit/portability-anchors.md) | What ties this deployment to GCP / our ArgoCD / our secret-management |
| [audit/secrets-coupling.md](audit/secrets-coupling.md) | How secrets flow (External Secrets Operator → bridge-secrets → SIMPL-Open) |
| [audit/upstream-deviation.md](audit/upstream-deviation.md) | Where FVH overrides diverge from the upstream chart defaults and why |
| [audit/monitoring-eck-coupling.md](audit/monitoring-eck-coupling.md) | Status of the SIMPL-monitoring stack (ECK-coupled, disabled by default in FVH) |
| [audit/crossplane-confirmation.md](audit/crossplane-confirmation.md) | Crossplane footprint check |

## Updating the SBOM

`charts.yaml` is hand-maintained — its `latest_version` fields are refreshed by re-running the GitLab and Helm-repo lookups documented in its header comment. Bump the baseline only when an ApplicationSet chart-version PR lands; the candidate-baseline marker in this file flips to `deployed baseline` at that point.
