# Audit: Upstream Deviation

**Question:** Diff our `valuesObject` per app vs. upstream defaults (from governance-authority@v3.0.4 app-values/); flag overrides as `cosmetic` / `env-specific` / `fix` / `portability-bug`.

**Inputs:**
- `argocd/applicationsets/simpl-eval/apps/*.yaml` — FVH valuesObject overrides
- Upstream `governance-authority@v3.0.4/app-values/*/values.yaml` (referenced by `valuesRef.targetRevision: v3.0.4` in each app)
- Upstream `common_components@v3.0.2/app-values/*/values.yaml`
- Upstream chart `values.yaml` defaults (per-chart in `source.yaml`)

## Classification

| Class | Definition |
|-------|------------|
| `cosmetic` | Resource sizing, replica counts, log levels — does not change behaviour, only operational footprint. |
| `env-specific` | Replaces an EC sandbox value with our equivalent (FVH cluster hostname / namespace / GCP service account). Required for any deployment that's not the EC sandbox. |
| `fix` | Override that works around an upstream bug or a chart-template mismatch. Should be reported upstream. |
| `portability-bug` | Override that papers over an issue another deployer would also hit — the chart needs a fix to be portable, but our override prevents us from feeling the pain. |

## Per-App Deviation Table

| App | Override summary | Class | Notes |
|-----|-----------------|-------|-------|
| **adapter** | `vault.role: simpl-eval-governance`, `vault.address: http://simpl-eval-common-openbao...:8200`, `vault.secretPath: secret/simpl-eval-governance-adapter-simpl-backend`, `hashicorp.service` redirected to in-cluster OpenBao | env-specific | Replaces upstream EC sandbox `https://secrets.common01.sandbox-cat-dat.simpl-europe.eu` with our in-cluster OpenBao. Same pattern as fc-service / icm / notification / schema-manager. |
| **authentication-provider** | `postgresql.enabled: false`; `db.*` + `appConfig.spring.datasource.*` redirected to Cloud SQL FQDN; `vault.address` to in-cluster OpenBao; `kafkaConfig.simpl.kafka.topic.prefix: iaa.simpl-eval-governance.`; `redis.host` to `redis-master.simpl-eval-governance.svc.cluster.local`; `urlAuthorityT2: tls.authority.governance.simpl-eval.tfds.io`; `simpl.certificate.san: tls.authority.governance.simpl-eval.tfds.io`; `ignoreDifferences` for `authentication-provider-create-secret-*` Job; `valueFiles: $values/app-values/auth-provider/values.yaml` | fix + env-specific | The `kafkaConfig` override (an internal PR) is a documented `fix` — without `simpl.kafka.topic.prefix`, Spring fails at messageListenerContainer because the chart reads the prefix from `kafkaConfig` not `kafka.topicPrefix`. Datasource override is a documented `fix` (an internal PR) because the chart hardcodes datasource defaults and ignores top-level `db.*`. The `create-secret-*` Job ignoreDifferences is a `fix` for an upstream bug where the chart renders the Job without `spec.selector` (API-server populates it). All three should be reported upstream. |
| **bridge-secrets** | (FVH chart, no upstream comparison) | env-specific | Synthesises 9 Zalando-spilo-style Secrets in `simpl-eval-common`. Workaround for `pg-cluster` not deploying. |
| **cloudsql-proxy / cloudsql-proxy-governance** | (FVH chart, no upstream comparison) | env-specific | Pure GCP-coupled infrastructure. |
| **confluent-operator** | `skipCrds=true` + `ServerSideApply=true` (CRDs deployed separately to bypass 256 KiB annotation limit) | fix | Workaround for k8s annotation size limit on the Confluent Operator's combined CRD. Should remain — this is the documented Confluent recommendation. |
| **ejbca** | `ingress.host: ejbca.simpl-eval.tfds.io`, `secretName: ejbca-tls`, `cert-manager.io/cluster-issuer: letsencrypt-prod` | env-specific | Pure ingress / TLS rewiring. |
| **frontend (simpl-fe)** | `ingress.host: simpl.simpl-eval.tfds.io`; runtime env `API_URL: https://governance.simpl-eval.tfds.io`, `KEYCLOAK_URL: https://keycloak.simpl-eval.tfds.io` | env-specific | The runtime env overrides are the entire portability story for the frontend (no rebuild needed because `window.env` is injected at container start by the chart). |
| **icm** | `vault.role: simpl-eval-common`, in-cluster OpenBao address, `kafka.bootstrapServer: kafka.simpl-eval-common.svc.cluster.local:9092` | env-specific | Critical: FVH does NOT override the OVH project ID `ea5f1127cb1f407899c1e91d490b34e5` (a chart default). ICM is **functionally inert** for FVH — we deploy it because it's in the umbrella but it has no role to perform. **Portability-bug for any non-OVH deployment.** |
| **identity-provider** | `postgresql.enabled: false`; `appConfig.spring.datasource.*` to Cloud SQL FQDN; env-vars `EJBCA_KEYSTORE_PASSWORD` / `EJBCA_TRUSTSTORE_PASSWORD` from `secretKeyRef`; `appConfig.spring.ssl.bundle.jks.ejbca.key.alias: identity-provider-client` (chart default is "superadmin"); `ejbca.host: ejbca-community-helm.simpl-eval-governance.svc.cluster.local.`; `vault.address` to in-cluster OpenBao | fix + env-specific | The `appConfig` datasource override is documented in inline comments (internal PRs). The `ssl.bundle.jks.ejbca.key.alias: identity-provider-client` is a fix for a chart-default mismatch — EJBCA generated the keystore with a different alias than the chart defaults. Should be flagged upstream as a chart default that doesn't match the chart's bundled EJBCA scripts. |
| **kafka** | (chart-pinned `1.2.0`); valuesObject minimal — chart renders Confluent CRs that the operator translates | env-specific | The Confluent operator does the heavy lifting; not enough deviation here to flag. |
| **keycloak (codecentric/keycloakx)** | Entire chart family is replaced (vs. upstream `bitnami/keycloak 22.2.5`); `image: quay.io/keycloak/keycloak:25.0.6`; `command: kc.sh start-dev`; `cache.stack: custom`; `KEYCLOAK_ADMIN_PASSWORD: admin`; `KC_DB_URL_PROPERTIES: ?sslmode=disable`; database via Cloud SQL Auth Proxy with IAM authn placeholder | env-specific + fix | The chart switch is `env-specific` (deliberate per the project's dependency-management policy). `cache.stack: custom` is a `fix` for a Keycloak 25 issue where the chart's auto-injected `KC_CACHE=ispn + KC_CACHE_STACK=jdbc-ping` references a JGroups stack that's not bundled in KC 25 (causes ISPN000540). |
| **mailpit** | `ingress.host: mailpit.simpl-eval.tfds.io` | env-specific | Cosmetic ingress. |
| **notification** | `vault.role: simpl-eval-common`, `secretEngine: secret/simpl-eval-common`, in-cluster OpenBao, `kafka.bootstrapServer: kafka.simpl-eval-common.svc.cluster.local:9092` | env-specific | Crucially does NOT override the EC SMTP user/host/sender (`dev@simpl-europe.eu` via `ssl0.ovh.net`). Notification mail won't actually be delivered because we don't have OVH SMTP creds; for the eval, this is OK. **Portability-bug for any deployment that needs working email.** |
| **onboarding** | `postgresql.enabled: false`; `db.*` + `appConfig.spring.datasource.*` to Cloud SQL (note: uses bare `postgresql:5432` in URL, while sap/auth-provider use the trailing-dot FQDN) | env-specific + portability-bug | Inconsistency: onboarding uses `postgresql:5432` while sap/auth-provider/users-roles use `postgresql.simpl-eval-governance.svc.cluster.local.:5432`. The bare hostname relies on namespace-local DNS search and works because both are in the same namespace, but it's stylistically inconsistent and could break under different DNS configurations. **Note:** the upstream `onboarding/application.yml` realm hardcode (`onboarding`) is NOT addressable via valuesObject — see portability-anchors.md Tier 2. |
| **openbao** | Standalone mode (HA disabled), file storage backend, GCP KMS auto-unseal at `<gcp-project-id>/europe-north1/<openbao-keyring>/openbao-unseal`, ingress at `secrets.common.simpl-eval.tfds.io`, ignoreDifferences for `MutatingWebhookConfiguration.caBundle` | env-specific + fix | The MutatingWebhookConfiguration `caBundle` ignoreDifferences is a `fix` for cert-manager-injected caBundle drift (a known pattern, but worth a chart-level documentation). |
| **openbao-config** | `cluster.namespace: simpl-eval-common`, `namespaceTag: common`, `domainSuffix: simpl-eval.tfds.io`, `secrets.secretEngine: secret/simpl-eval-common`, `agentList.authorities: [simpl-eval-governance]`, `extraSyncOptions: [Replace=true]` | env-specific | The `Replace=true` is required for the immutable init-Job. |
| **pgadmin** | ingress overrides only | env-specific | Cosmetic. |
| **redis** | `kubectl.image: registry.k8s.io/kubectl:v1.31.4` (overrides Bitnami legacy `bitnami/kubectl`); ingress overrides | env-specific + fix | The kubectl override is a `fix` for the Bitnami pay-walled / legacy registry per the project's dependency-management policy. |
| **redpanda-console** | ingress + tls overrides | env-specific | Cosmetic. |
| **sap (security-attributes-provider)** | Same pattern as auth-provider: `postgresql.enabled: false`, `db.*` + `appConfig.spring.datasource.*` redirected, `vault.address`, `redis.host` to `redis-master.simpl-eval-governance.svc.cluster.local`; `appConfig.simpl.ephemeral-proof.issuer-url: https://governance.simpl-eval.tfds.io/sapApi/v1`; `valueFiles: $values/app-values/SAP/values.yaml` | fix + env-specific | The datasource override is the same documented chart `fix` (an internal PR). The `ephemeral-proof.issuer-url` override is a **2.12.4 chart `fix`** (internal PR; post-sync validation): the chart default is the unsubstituted SIMPL-pipeline placeholder `[SIMPL_EPHEMERAL_PROOF_ISSUER_URL]` and the v3.0.4 $values set only `expire-after`, so FVH's pipeline-free deploy rendered it null and the 2.12.4 pod crash-looped (`@NotNull URI → APPLICATION FAILED TO START`). See issue 10 below. |
| **schema-manager** | `vault.role: simpl-eval-governance`, in-cluster OpenBao, `secretEngine: secret/simpl-eval-governance`, ingress override | env-specific | Same gaia-x-edc-group pattern as fc-service / adapter. |
| **tier1-gateway** | `ingress.host: governance.simpl-eval.tfds.io`, `keycloakUrl`, `cors.allowOrigin`, plus `appConfig.jwt-configuration.primary.realm: authority` + `applicant.realm: authority`; `valuesRef → governance-authority/v3.0.4/app-values/tier1-gateway/values.yaml` | fix + env-specific | The `jwt-configuration` override is a **2.12.6 chart `fix`** (internal PR; post-sync validation): the realm config moved off the old `appConfig.keycloak.app.realm` path (which the v3.0.4 $values still set, now dead) to `jwt-configuration.primary.realm` (`@NotBlank`), shipped only as a commented `<your-realm-name>` example in the chart. Without it the 2.12.6 pod crash-looped (`APPLICATION FAILED TO START`). See issue 11 below. |
| **tier2-gateway** | `ingress.host: tls.authority.governance.simpl-eval.tfds.io`, separate `valueFiles: [values.yaml, values-routes-authority.yaml]` | env-specific | The two-file values pattern is the upstream pattern. |
| **tier2-proxy** | (no in-line overrides; pure chart pin at 1.2.1) | env-specific | Inherits everything from chart defaults. |
| **users-roles** | Same datasource pattern; `hostT1: keycloak.simpl-eval.tfds.io`, `authorityHostT2: tls.authority.governance.simpl-eval.tfds.io`; `kafkaConfig.simpl.kafka.topic.prefix: iaa.simpl-eval-governance.` (an internal PR fix); top-level `kafka.topicPrefix` retained for any sub-template that still reads it | fix + env-specific | The `kafkaConfig` fix is the same as auth-provider. |
| **vswh (vault-secrets-webhook)** | Override `VAULT_ADDR` to in-cluster OpenBao | env-specific | Documented in app YAML header comment. |
| **xsfc-catalogue (fc-service)** | `vault.role: simpl-eval-governance`, in-cluster OpenBao, `secretEngine: secret/simpl-eval-governance` | env-specific | Same gaia-x-edc-group pattern. |

## Summary

- **Total apps audited:** 28 (27 distinct + cloudsql-proxy x2)
- **Overrides classified as `fix`:** 7 — auth-provider/sap/users-roles/identity-provider datasource (an internal PR), auth-provider/users-roles `kafkaConfig.simpl.kafka.topic.prefix` (an internal PR), identity-provider `ssl.bundle.jks.ejbca.key.alias` (alias mismatch), keycloak `cache.stack: custom` (KC 25 ISPN000540), confluent-operator `skipCrds + ServerSideApply` (256 KiB annotation limit), **tier1-gateway `jwt-configuration.primary/applicant.realm` + sap `ephemeral-proof.issuer-url`** (internal PR — 2.12.x mandatory-config the chart artifacts don't surface; see issues 10–11).

> **Chart-vs-`$values` version skew (root cause of the 2026-06-15 fixes).** FVH pins the IAA *charts* at the `authority-iaa v1.2.23` set (2.12.x) but the `valuesRef` stays at `governance-authority v3.0.4` (the per-component `app-values/` that target the 2.8.0-era schema; v3.1.x removed those per-component files). When a `2.12.x` image changes its Spring config schema, the v3.0.4 `$values` silently keep setting the *old* keys (dead config) while the *new* mandatory keys go unset — surfacing only as a runtime `APPLICATION FAILED TO START`, never in chart-template diffs. The tier1-gateway realm and sap issuer-url fixes are both instances of this. Treat every future IAA chart bump as potentially needing new `appConfig` keys, and validate against live pods (`just simpl-eval-unhealthy`) rather than trusting a byte-identical chart-template diff.
- **Overrides classified as `portability-bug`:** 2 — icm OVH project ID kept as default (chart should make this required, not defaulted), notification SMTP defaults kept as EC's (chart should not default to a specific deployment's email infra).
- **Overrides classified as `env-specific`:** the bulk of overrides — replacing EC sandbox URLs / namespaces / GCP IAM / Cloud SQL / domain. Expected for any non-EC deployment.
- **Overrides classified as `cosmetic`:** resource sizing throughout. Not flagged individually.

## Upstream Issues to File

> **Resolved 2026-06-11 (filing wave 2).** All items below were re-verified against
> upstream HEAD/latest tags before filing; several did not survive verification.
> The authoritative per-item dispositions (filed URL / fixed-upstream / claim-invalid /
> already-reported) live in
> [`portability-audit.md` §"Upstream Issues to File"](../../architecture/portability-audit.md#upstream-issues-to-file-resolved-2026-06-11--see-status-per-item),
> which supersedes this list (items 1–6 below map to its items 1, 2, 3, 4, 5, 6).
> Filing log: (tracked internally).

The following `fix` and `portability-bug` items merit upstream issues (skip if covered by the internal filing log):

1. **simpl.kafka.topic.prefix discoverability** — chart reads from `kafkaConfig.simpl.kafka.topic.prefix` but `values.yaml` advertises `kafka.topicPrefix` as the override key. Affects `auth-provider`, `users-roles` (an internal PR in FVH).
2. **appConfig datasource override pattern** — `db.*` keys are documented but the chart hardcodes `spring.datasource.{url,username,password}` defaults and ignores top-level `db.*`. Affects `identity-provider`, `auth-provider`, `sap`, `users-roles` (internal PRs in FVH).
3. **identity-provider EJBCA keystore alias mismatch** — chart defaults `ssl.bundle.jks.ejbca.key.alias: superadmin` but the chart's bundled EJBCA bootstrap generates the keystore with alias `identity-provider-client`.
4. **authentication-provider create-secret Job spec.selector** — Job is rendered without `spec.selector`, requiring `ignoreDifferences` for the API-server-populated immutable fields.
5. **icm OVH project ID as default** — should be a required value with no default, since it's tenant-specific.
6. **simpl-notification-service SMTP defaults** — should default to a placeholder, not `dev@simpl-europe.eu` via `ssl0.ovh.net`.
