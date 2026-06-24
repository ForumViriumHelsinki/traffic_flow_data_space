# Audit: Portability Anchors

**Question:** Catalog every hardcoded EC value (production hostnames, URLs, API endpoints, IDs, tenant identifiers, quay.io references, ec.europa.eu domains, etc.) with file:line; classify each as `helm-overridable` / `source-patch-required` / `infra-coupling`.

**Inputs:**
- `argocd/applicationsets/simpl-eval/apps/*.yaml` — what FVH actively overrides
- `docs/simpl-open/sbom/source.yaml` — what the upstream chart values default to
- Upstream chart `values.yaml` defaults (sourced from GitLab API at the pinned chart_version)

## Classification

| Class | Definition |
|-------|------------|
| `helm-overridable` | Default in upstream chart's `values.yaml`. Can be replaced via FVH `valuesObject` or external values file. No source-code change required. |
| `source-patch-required` | Hardcoded in `src/main/resources/application.yml` or compiled-in code. Cannot be overridden via Helm; requires a code patch / fork or a configMap-overlay strategy. |
| `infra-coupling` | Tied to a specific cloud provider, registry, or external service such that overriding is not enough — alternate infrastructure must exist (mirror image, alternate Vault, alternate cert manager, etc.). |

## Tier 1 — `infra-coupling` (highest severity)

These are not pure config — they bind the deployment to specific external infrastructure. Overriding the value alone does not make the system portable; an alternate provider must be stood up.

| Anchor | File:line | Concern |
|--------|-----------|---------|
| OVH cloud project ID `ea5f1127cb1f407899c1e91d490b34e5` | upstream `infrastructure-consumption-monitoring-service@2.3.1/charts/values.yaml` (icm) | ICM hardcodes the EC's specific OVH Cloud project. The ICM service exists to track consumption against this project. For a non-OVH or non-EC tenancy, ICM has no meaningful function — its values cannot be redirected to another OVH project without operational permission, and there is no equivalent abstraction for AWS/Azure/GCP billing. The chart **default** ships this ID; FVH does not currently override it because we do not actively use ICM data. (`source.yaml:285-308`). **Severity: critical for any non-EC deployment.** |
| EC SMTP relay `ssl0.ovh.net` + sender `dev@simpl-europe.eu` | upstream `simpl-notification-service@2.1.1/charts/values.yaml` | Notification chart default. Sending from `dev@simpl-europe.eu` via OVH SMTP requires OVH SMTP credentials in EC's name. FVH overrides via valuesObject for sandbox; portability requires standing up an alternate SMTP relay. (`source.yaml:228-237`) |
| EC private image registry `registry.code.europa.eu/simpl/simpl-open/...` | All 14 SIMPL chart `values.yaml` files (default `image.repository`); 16 references summarised in `images.yaml:457-485` | Every SIMPL business service image (adapter, authentication-provider, identity-provider, onboarding, sap, users-roles, tier1-gateway, tier2-gateway, tier2-proxy, simpl-fe, fc-service, icm, simpl-notification-service, simpl-schema-manager-charts, openbao-config) lives on the EC private GitLab registry and requires authentication. **Helm-overridable to a mirror, but the mirror itself is infrastructure that must exist** — this is why we classify it as infra-coupling rather than pure helm-overridable. FVH does NOT currently mirror to GHCR; we rely on the EC registry being reachable + an `imagePullSecret` we can provision. |
| GCP project `<gcp-project-id>`, region `europe-north1`, Cloud SQL instance `<cloud-sql-instance>` | `argocd/applicationsets/simpl-eval/apps/cloudsql-proxy.yaml:23,28`, `cloudsql-proxy-governance.yaml:23,28`, plus all `appConfig.spring.datasource.url`/`username` blocks (e.g. `authentication-provider.yaml:55-62`, `identity-provider.yaml:60-61`, `onboarding.yaml:36,42`, `sap.yaml:39,45`, `users-roles.yaml:41,47`, `keycloak.yaml:64`) | FVH-specific GCP infrastructure: a single Cloud SQL Postgres instance at `<gcp-project-id>:europe-north1:<cloud-sql-instance>` with IAM-authenticated access via the `<sql-client-sa>` workload identity. Helm-overridable in principle, but porting to another deployment requires a different Cloud SQL instance, a different Workload Identity binding, and a different cloudsql-proxy connection string. **Severity: high for any non-FVH-on-GCP target.** |
| GCP Workload Identity SA `<openbao-sa>` | `argocd/applicationsets/simpl-eval/apps/openbao.yaml:48`, plus inline Terraform-injected GCP project block at `openbao.yaml:66` | OpenBao auto-unseal binds to a GCP KMS key in this specific project. Replacement requires standing up an alternate KMS key, alternate WI, and updating the Terraform-injected config. Documented in the inline comments. |

## Tier 2 — `source-patch-required`

Defaults baked into compiled application code (`src/main/resources/application.yml` or static template files), not chart `values.yaml`. Overriding via Helm is impossible without a per-deployment ConfigMap overlay or upstream patch.

| Anchor | File:line | Concern |
|--------|-----------|---------|
| Hardcoded Keycloak realm `onboarding` | `onboarding/src/main/resources/application.yml` (chart 770, v2.8.1; persists since 2.5.x) | Spring `keycloak.realm` literal — cannot be overridden by env. Renaming the realm to anything else (e.g. `simpl-eval`) requires a code patch and rebuild. (`source.yaml:97-101`). **The single biggest source-patch finding.** |
| EC consumer FE URL in users-roles notification template | `users-roles/src/main/resources/application.yml` — full URL `https://fe.iaa-dsdev-consumer.dev.simpl-europe.eu/users-roles/role-requests-management/review/{roleRequestId}` | The notification body is built from this constant; while it is overridable via Spring env, the **default** is misleading and ties the build to EC infra. (`source.yaml:120-122`) |
| Keycloak master realm + `default-roles-*` role names | `users-roles/src/main/resources/application.yml` | Used in seed/exclusion logic; assumes SIMPL Keycloak realm naming. Helm cannot fix. (`source.yaml:123-126`) |
| `eu.europa.eu` package roots in app code | All Java-based components | Strictly speaking only a logging-namespace concern (`source.yaml:188-190`) — but a non-EC fork would want to rename the package roots for clarity. Listed as low-priority source-patch. |

## Tier 3 — `helm-overridable` (chart default → values override)

Defaults that ship in the chart's `values.yaml` and are correctly overridden in our `valuesObject`. Listed for completeness so a fresh deployment knows what *must* be overridden.

| Anchor | Chart default | FVH override location |
|--------|---------------|----------------------|
| `hashicorp.service: https://secrets.common01.sandbox-cat-dat.simpl-europe.eu` | adapter, fc-service, schema-manager, icm, notification (sources.yaml:204-205, 230, 255, 277, 297) | `apps/adapter.yaml:27`, `apps/notification.yaml:32`, `apps/icm.yaml:32`, `apps/schema-manager.yaml:30`, `apps/xsfc-catalogue.yaml:29` (all redirected to `http://simpl-eval-common-openbao.simpl-eval-common.svc:8200`) |
| `hashicorp.role: sandbox-cat-dat-role`, `secretConfigPath: /v1/sandbox-cat-dat/data/authority01-...` | fc-service, schema-manager, adapter | Overridden to `simpl-eval-governance` / `simpl-eval-common` in `apps/*.yaml` (`apps/adapter.yaml:30-32`, `apps/notification.yaml:37-39`, `apps/icm.yaml:35-37`) |
| `clusterIssuer: dev-prod` | adapter, fc-service, schema-manager | Overridden in valuesObject to `letsencrypt-prod` |
| `ingress.host: <component>.dev.simpl-europe.eu` | adapter (`adapter.dev.simpl-europe.eu`), fc-service (`fc-server.dev.simpl-europe.eu`), schema-manager (`schema-manager.dev.simpl-europe.eu`) | Overridden to `*.simpl-eval.tfds.io` in apps/*.yaml |
| `dataspaceName: "SIMPL"` | simpl-fe (source.yaml:78-80) | Overridable via valuesObject (FVH leaves it as "SIMPL" since the eval is for SIMPL itself) |
| `simpl.participantType: "GOVERNANCE_AUTHORITY"` | identity-provider | Helm-overridable; FVH keeps the default (we *are* a governance authority for the eval) |
| EJBCA chart defaults: `profile="Onboarding TLS Profile"`, `caName="OnBoardingCA"`, `entityName="Onboarding End Entity"` | identity-provider | Helm-overridable; portable to alternate CA via overrides |
| `kafka bootstrap: kafka.be-common.svc.cluster.local:9092` | notification, icm | Overridden to `kafka.simpl-eval-common.svc.cluster.local:9092` (`apps/notification.yaml:34`, `apps/icm.yaml:39`) |
| Bitnami pay-walled `bitnami/keycloak` image | umbrella `governance-authority/charts/values.yaml:keycloak.repo_URL` | FVH replaces with `quay.io/keycloak/keycloak:25.0.6` via `apps/keycloak.yaml:23-25` and codecentric/keycloakx chart selection (different chart family entirely) |
| Bitnami legacy `bitnami/kubectl` (redis chart) | bitnami/redis 19.6.0 default | Overridden to `registry.k8s.io/kubectl:v1.31.4` via `apps/redis.yaml` valuesObject |

## FVH-specific anchors (informational — these are EXPECTED in FVH apps)

These are not portability blockers from the FVH-deployment perspective; they're the FVH replacement values. Listed so a downstream consumer of the FVH ApplicationSet knows what must change.

| Anchor | Locations |
|--------|-----------|
| `*.simpl-eval.tfds.io` ingress hosts | `frontend.yaml:34,40,45,46`, `keycloak.yaml:74,80`, `ejbca.yaml:39,45`, `tier1-gateway.yaml:33,39`, `tier2-gateway.yaml:41,47`, `mailpit.yaml:26`, `redpanda-console.yaml:37,43`, `pgadmin.yaml:34,40`, `openbao.yaml:30,34`, `users-roles.yaml:29-30`, `authentication-provider.yaml:66,69`, `openbao-config.yaml:26` |
| `simpl-eval-governance` / `simpl-eval-common` namespace strings | All apps (`namespace:` field at line 4) plus inline service-FQDN refs scattered through valuesObject |
| `<gcp-project-id>` GCP project | cloudsql-proxy* (line 23, 28), openbao.yaml:48, openbao.yaml:66, all `username: <sql-client-sa>` lines |

## Summary Counts

- **Tier 1 (infra-coupling):** 5 anchor classes — OVH project, EC SMTP relay, EC private registry (16 image refs), GCP/Cloud SQL coupling (~10 refs), GCP KMS WI binding.
- **Tier 2 (source-patch):** 3 anchor classes — onboarding realm, users-roles consumer FE URL, master-realm seed/exclusion.
- **Tier 3 (helm-overridable):** 9 anchor classes — covered by our existing valuesObject overrides.

## Top 3 Portability Blockers

1. **Onboarding realm hardcode** (`source.yaml:97-101`) — single line of Spring config, requires fork to fix.
2. **OVH project ID in ICM** (`source.yaml:301`) — non-OVH deployments cannot meaningfully use ICM.
3. **EC private image registry** (`images.yaml:240-434`) — every SIMPL business service image requires either EC tenancy or a mirror.
