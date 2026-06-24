# SIMPL-Open Portability Audit

**Date:** 2026-04-28 (status notes refreshed 2026-06-12 — see inline *Status* markers; the audit's chart-level decisions are unchanged and still in force)
**Scope:** governance-authority@v3.0.4 + common_components@v3.0.2 umbrella charts as deployed via the FVH simpl-eval ApplicationSet.
**Inputs:**
- `docs/simpl-open/sbom/charts.yaml` — 42 chart entries, refreshed for v3.0.x.
- `docs/simpl-open/sbom/images.yaml` — image inventory.
- `docs/simpl-open/sbom/source.yaml` — application-source portability patterns.
- `docs/simpl-open/sbom/audit/{monitoring-eck-coupling,crossplane-confirmation,portability-anchors,secrets-coupling,upstream-deviation}.md` — Phase-2 auditor outputs.
- `docs/simpl-open/architecture/dependency-graph.d2` / `.svg` — runtime + chart dependency topology.

This document answers the original audit questions definitively and supplies a per-chart `remove`/`keep`/`make-optional` decision table for follow-up work.

## Audit Questions: Definitive Answers

### Q1. Can monitoring be permanently dropped?

**Yes. Permanently. With no functional impact on any deployed component.**

Evidence ([sbom/audit/monitoring-eck-coupling.md](../sbom/audit/monitoring-eck-coupling.md)):

- ZERO deployed apps unconditionally reference ECK CRDs (`*.k8s.elastic.co`). Only `eck-monitoring` does, and it is NOT deployed by FVH (`charts.yaml:367` `deployed: false`).
- ZERO deployed apps unconditionally emit Prometheus Operator resources (`monitoring.coreos.com/*`). Six third-party charts (`keycloakx`, `openbao`, `vault-secrets-webhook`, `console`, `redis`, `confluent-for-kubernetes`) ship optional `ServiceMonitor`/`PrometheusRule` templates; ALL default to `enabled: false` and FVH does not flip them on.
- The umbrella's `monitoring.enabled` toggle in `common_components@v3.0.2/charts/values.yaml:54-66` controls THREE Application CRs: `eck-operator`, `eck-operator-crds`, `eck-monitoring`. NONE of them are Prometheus assets. The toggle is **exclusively** about the Elastic stack.
- The FVH ApplicationSet bypasses the umbrella entirely (`charts.yaml:786-789`), so the upstream `monitoring.enabled=true` default never executes — the umbrella's Application CRs are never rendered anyway.

**Action:** No code change is needed in the FVH ApplicationSet. The "monitoring" question can be archived.

### Q2. Can Crossplane be permanently dropped?

**Yes. There has never been Crossplane usage in this stack.**

Evidence ([sbom/audit/crossplane-confirmation.md](../sbom/audit/crossplane-confirmation.md)):

- Zero `crossplane.io`, `Composition`, `CompositionRevision`, `CompositeResourceDefinition`, or `xpkg.upbound.io` refs across all 42 chart entries (every cell of `crossplane_refs` is empty).
- Zero refs in upstream `governance-authority@v3.0.4/charts/values.yaml` and `common_components@v3.0.2/charts/values.yaml`.
- Zero refs in `argocd/applicationsets/simpl-eval/`, `helm/cloudsql-proxy/`, or `helm/simpl-eval-bridge-secrets/`.

**Action:** Crossplane can be permanently removed from any architectural conversation around SIMPL-Eval. If the question came from observing a `crossplane.io` annotation somewhere, it was not in this code path.

## Tier-Ranked Portability Blockers (Top 3)

From [sbom/audit/portability-anchors.md](../sbom/audit/portability-anchors.md), three Tier-1 blockers dominate. None of them are FVH-introduced — they are all upstream chart or application defaults that any non-EC deployment will hit.

| # | Blocker | Class | Severity for non-EC deployment |
|---|---------|-------|--------------------------------|
| 1 | **Onboarding Spring realm hardcode** (`onboarding/src/main/resources/application.yml`: `keycloak.realm: "onboarding"`) | source-patch-required | Critical. Cannot be overridden via Helm — requires a fork to change the realm name. |
| 2 | **OVH cloud project ID in ICM** (`infrastructure-consumption-monitoring-service@2.3.1/charts/values.yaml`: `ea5f1127cb1f407899c1e91d490b34e5`) | infra-coupling | Critical for non-EC tenancies. ICM exists to track consumption against this specific OVH project; non-OVH deployments cannot meaningfully use ICM. |
| 3 | **EC private image registry** (every SIMPL business-service `image.repository` defaults to `registry.code.europa.eu/simpl/simpl-open/...`) | infra-coupling | High. 14 service images plus 1 Job image (15 total EC-specific refs in `images.yaml`) require either EC-tenancy IP whitelisting or a mirror to a registry FVH controls (e.g. GHCR). FVH currently relies on the EC registry being anonymously pullable from our IP range; any tightening of EC's policy breaks every governance and common-namespace deploy. |

## Bootstrap Preconditions (per [sbom/audit/secrets-coupling.md](../sbom/audit/secrets-coupling.md))

For a deploy-from-scratch run, these must all be in place BEFORE the first ApplicationSet sync:

1. **Cluster platform**: External Secrets Operator, Kyverno (with `add-imagepullsecret` policy), cert-manager (with `letsencrypt-prod` ClusterIssuer).
2. **GCP plumbing**: project + Cloud SQL instance + KMS keyring + 2 Workload Identity SAs (`external-secrets`, `<openbao-sa>`, `<sql-client-sa>`) + Cloud SQL IAM grants on 6+ databases.
3. **GCP Secret Manager** entries: `ejbca-rest-api-secret` (4-key JSON), `ghcr-login-secret`, Twingate connector token.
4. **Cluster config**: `ClusterSecretStore gcp-store`, `ClusterExternalSecret ghcr-login-secret`, namespaces `simpl-eval-common` + `simpl-eval-governance` labeled `ghcr.<org-domain>/pull=enabled`.
5. **EJBCA bootstrap**: post-Wave-8, manually extract REST-API client cert + CA truststore from EJBCA → write to GCP SM `ejbca-rest-api-secret` → ExternalSecret refresh → identity-provider becomes Healthy.
6. **Authority credential issuance**: post-Wave-9, manually issue the authority credential row via either Option A (REST walkthrough — `kubectl port-forward` + 6 curl calls against auth-provider) or Option B (`simpl-cli@2.2.1` Helm chart with `initAuthority.enabled: true`, which runs `keypair-gen → csr-gen → onboard-agent → upload-csr → download-pem → upload-cert` as a Job). Without this, tier2-proxy's init container loops on HTTP 404 from `GET /tier1/v2/credentials/active` and the tier2-proxy → tier2-gateway → users-roles stack stays Degraded despite all other preconditions being met. Verbatim upstream procedure and rationale in [auth-provider-credential-bootstrap.md](../upstream/auth-provider-credential-bootstrap.md) (research tracked internally).

The 10-wave Progressive Sync order in `argocd/applicationsets/simpl-eval/applicationset.yaml:25-91` enforces the runtime dependency chain (openbao → vswh → openbao-config → cloudsql-proxy + confluent → kafka → support services → redis → keycloak/ejbca → governance services → gateways/frontend). Note: the wave order brings infrastructure up to the point where credential issuance can succeed, but does **not** perform the issuance itself — that is precondition #6 above.

## Per-Chart Decision Table

Decisions for the FVH SIMPL-Eval ApplicationSet specifically. `keep` = keep deploying as-is. `remove` = stop deploying; not used. `make-optional` = wrap the Application in a feature toggle so it can be skipped without breaking sync. `keep-with-fix` = keep but track an upstream fix.

| Chart | Decision | Rationale |
|-------|----------|-----------|
| poc-charts (adapter) | keep | Core governance service (POC adapter). |
| authentication-provider | keep-with-fix | Critical service. Tracked fixes: appConfig datasource, kafkaConfig topic prefix, create-secret Job ignoreDifferences. |
| identity-provider | keep-with-fix | Critical service. Fixes: appConfig datasource, EJBCA keystore alias mismatch. |
| onboarding | keep-with-fix | Critical service. Tracked source-patch issue: hardcoded `keycloak.realm: "onboarding"` realm name. |
| security-attributes-provider (sap) | keep-with-fix | Critical service. **Blocker (resolved):** vault-env injection — chart pod template forces `VAULT_ADDR: https://vault:8200` (unreachable), overriding the VSWH-injected local OpenBao URL; vault-env then fails DNS resolution and the pod cannot read its secrets. Was tracked internally — **closed 2026-05-28** (the VAULT_ADDR fix landed). The upstream chart defect (issue 10 below) still stands. The earlier appConfig datasource patch is co-applied across IAA services but is not the SAP-specific blocker. **2.12.4 (authority-iaa v1.2.23) added:** `ephemeral-proof.issuer-url` mandatory `@NotNull URI` defaulting to an unsubstituted pipeline placeholder — fixed internally (issue 11 below). |
| users-roles | keep-with-fix | Critical service. Fixes: appConfig datasource, kafkaConfig topic prefix. |
| tier1-gateway | keep-with-fix | Routes external traffic to all governance services. **2.12.6 (authority-iaa v1.2.23) added:** `jwt-configuration.primary.realm` mandatory `@NotBlank` (realm moved off the now-dead `keycloak.app.realm` path) — fixed internally (issue 12 below). |
| tier2-gateway | keep | Authority-side TLS gateway for tier-2 traffic. |
| tier2-proxy | keep | Authentication-provider companion. |
| simpl-fe (frontend) | keep | Governance UI. Most portable component (runtime config via window.env). |
| fc-service (xsfc-catalogue) | keep | Federated Catalogue service. |
| simpl-schema-manager-charts | keep | Schema management for the data space. |
| simpl-notification-service | keep-with-fix | Email notification. **Blocker (superseded):** Kafka SASL mechanism mismatch — the Spring app reads SASL mechanism from a different config path than the chart's `kafka.sasl.mechanism` override writes to, so our PLAIN override never takes effect and the pod restarts ~440 times against the Kafka authentication failure. *Status 2026-06: the chart this audit analyzed (2.1.1) is no longer deployed — FVH moved to 2.7.0 with split probe endpoints and the app is Healthy; whether the upstream config-path defect persists in 2.7.0 is unverified (the chart-defect entry, issue 9 below, stands until checked upstream).* Separately tracked portability-bug: chart default SMTP user/host points at EC infra (not a runtime blocker — the eval doesn't send mail). |
| infrastructure-consumption-monitoring-service (icm) | **make-optional** | Functionally inert for non-OVH deployments (chart defaults its OVH project ID). Wrap the Application in an `enabled` flag and default to `false` for any deployment that's not ICM-driven. The chart is still pulled-in by the v3.0.2 common_components umbrella for completeness, but FVH should be able to skip it with no functional impact on the rest of the stack. |
| kafka (SIMPL 976) | keep | Required by authentication-provider, users-roles, onboarding, notification, icm. |
| openbao | keep | Vault implementation; central to all SIMPL services via vault-agent sidecar pattern. |
| openbao-config | keep (retire fork: upgrade to upstream ≥ v1.3.4) | Bootstraps openbao secret engines + roles (Wave 3). **Forked to GHCR**: vendored at `helm/openbao-config/`, published to `ghcr.io/forumviriumhelsinki/openbao-config`, sourced by the ApplicationSet from GHCR instead of `code.europa.eu`. The fork patches the hardcoded stale `kubernetes_host` (`10.3.0.1` → `kubernetes.default.svc`). This removes one EC-chart fan-in coupling. **Update 2026-06-11:** upstream independently shipped the same fix in v1.3.4 (2026-05-07) — the fork can be retired by upgrading to upstream ≥ v1.3.4 (tracked as a follow-up task). |
| vault-secrets-webhook | keep | Required by all services with `vault.hashicorp.com/*` pod annotations. |
| confluent-for-kubernetes | keep | Renders Confluent Kafka CRs. |
| keycloakx (codecentric, NOT bitnami) | keep | Deliberate override of the upstream's bitnami chart. Stay on this for the foreseeable future. |
| ejbca | keep | PKI for identity-provider mTLS. |
| redis (bitnami) | keep-with-fix | Tracked watchlist item: Bitnami pay-walled / legacy registry. Fix: `kubectl.image` override to `registry.k8s.io/kubectl`. Migration off bitnami is tracked internally. |
| redpanda-console | keep | Kafka UI (operator dashboard). |
| pgadmin4 | keep | Postgres UI (operator dashboard). |
| mailpit | keep | Local SMTP for notification testing. |
| cloudsql-proxy (FVH chart) | keep | Replaces upstream `pg-cluster` for our Cloud SQL backend. |
| simpl-eval-bridge-secrets (FVH chart) | keep | Replaces upstream `openbao-init`; provides Zalando-spilo-style postgres credential Secrets that SIMPL charts look up cross-namespace. |
| pg-cluster (umbrella) | **remove** (already not deployed) | Replaced by Cloud SQL + cloudsql-proxy + bridge-secrets. Confirm it's permanently out of scope. |
| postgres-operator (umbrella) | **remove** (already not deployed) | Companion to pg-cluster. Out of scope. |
| openbao-init (umbrella) | **remove** (already not deployed) | Replaced by bridge-secrets. Out of scope. |
| eck-monitoring (umbrella) | **remove** (already not deployed) | Monitoring stack permanently dropped per Q1. |
| eck-operator (umbrella) | **remove** (already not deployed) | Monitoring stack permanently dropped per Q1. |
| eck-operator-crds (umbrella) | **remove** (already not deployed) | Monitoring stack permanently dropped per Q1. |
| redis-commander (umbrella) | **remove** (already not deployed) | Disabled in upstream values; not needed. |
| fe-authentication-provider (NEW v3.0.x) | make-optional | Per-component frontend introduced in v3.0.x; FVH stays on monolithic simpl-fe. Re-evaluate when planning a future cutover. |
| fe-users-and-roles (NEW v3.0.x) | make-optional | Same as above. |
| fe-identity-provider (NEW v3.0.x) | make-optional | Same as above. |
| fe-onboarding (NEW v3.0.x) | make-optional | Same as above. |
| fe-security-attribute-provider (NEW v3.0.x) | make-optional | Same as above. |
| schema-manager-ui (NEW v3.0.x) | make-optional | UI front-end for schema-manager; FVH skips. |
| governance-authority (umbrella, informational) | keep | Used as multi-source `valuesRef` for app-values/ files. Bypassed for templates. |
| common_components (umbrella, informational) | keep | Same role as governance-authority. |

### Decision summary counts

Counts derived from the table above (totals to 42 = the entry count in `charts.yaml`):

- `keep`: 20 (poc-charts, tier2-gateway, tier2-proxy, simpl-fe, fc-service, simpl-schema-manager-charts, kafka, openbao, openbao-config, vault-secrets-webhook, confluent-for-kubernetes, keycloakx, ejbca, redpanda-console, pgadmin4, mailpit, cloudsql-proxy, simpl-eval-bridge-secrets, governance-authority, common_components)
- `keep-with-fix`: 8 (authentication-provider, identity-provider, onboarding, sap, tier1-gateway, users-roles, simpl-notification-service, redis)
- `make-optional`: 7 (icm, fe-authentication-provider, fe-users-and-roles, fe-identity-provider, fe-onboarding, fe-security-attribute-provider, schema-manager-ui)
- `remove` (already not deployed; confirm permanence): 7 (pg-cluster, postgres-operator, openbao-init, eck-monitoring, eck-operator, eck-operator-crds, redis-commander)

## Upstream Issues to File (resolved 2026-06-11 — see status per item)

From [sbom/audit/upstream-deviation.md](../sbom/audit/upstream-deviation.md). **All 10 items were re-verified against upstream
HEAD/latest tags and deduplicated on 2026-06-11 (filing wave 2, logged internally).**
"Waves" are the 2026-06-11 upstream filing batches: wave 1 filed the
governance-config operator-flow findings; wave 2 covered this list plus the
older `upstream-feedback.md` candidates. Legend: ✅ filed upstream (link to the
code.europa.eu work item) · ❌ claim did not survive verification ·
⬜ no action needed (fixed upstream / already reported).
Five of the ten did not survive verification — the original claims below are kept
verbatim for the audit trail, with the verified disposition appended.

1. **`simpl.kafka.topic.prefix` discoverability** — chart reads from `kafkaConfig.simpl.kafka.topic.prefix` but `values.yaml` advertises `kafka.topicPrefix` as the override. Affects `authentication-provider`, `users-roles` (tracked internally in FVH).
   ❌ *Claim invalid (verified at 2.8.x and current):* neither chart's `values.yaml` advertises a `kafka.topicPrefix` key. The real, adjacent gaps are already filed: the wrapper's values-placement bug ([authority-iaa#5](https://code.europa.eu/simpl/simpl-open/development/iaa/agent-iaa/authority-iaa/-/work_items/5)) and live placeholder defaults ([onboarding#1](https://code.europa.eu/simpl/simpl-open/development/iaa/onboarding/-/work_items/1)).
2. **appConfig datasource override pattern** — `db.*` keys are documented in chart values but the chart hardcodes `spring.datasource.{url,username,password}` defaults and ignores top-level `db.*`. Affects `identity-provider`, `authentication-provider`, `sap`, `users-roles` (tracked internally in FVH).
   ❌ *Claim invalid:* checked at users-roles v2.8.0, auth-provider v2.12.3, identity-provider v2.11.5 (inside the observation window) and at current tags — the claimed advertised-but-ignored `db.*` contract does not exist in the charts as described.
3. **identity-provider EJBCA keystore alias mismatch** — chart defaults `ssl.bundle.jks.ejbca.key.alias: superadmin`, but the chart's bundled EJBCA bootstrap generates the keystore with alias `identity-provider-client`.
   ❌ *Claim invalid:* the chart bundles no EJBCA bootstrap (that lives in `ejbca-preconfig`, run as an initContainer of the EJBCA deployment), and the bootstrap derives the alias from `MANAGEMENT_END_ENTITY_USERNAME` (documented value `SuperAdmin`, matching the chart default). Our alias mismatch was a deployer-side username choice.
4. **authentication-provider create-secret Job spec.selector** — Job is rendered without `spec.selector`, requiring `ignoreDifferences` for the API-server-populated immutable fields.
   ⬜ *Fixed upstream:* authentication-provider **v2.16.0 (GA, 2026-06-09)** converts the Job to ArgoCD hooks with `ttlSecondsAfterFinished`, removing it from the continuously-managed resource set; authority-iaa v1.5.x pins 2.16.0.
5. **icm OVH project ID as default** — `ea5f1127cb1f407899c1e91d490b34e5` is tenant-specific. The chart should have no default (or a placeholder) and require an explicit value.
   ✅ *Filed wave 2:* [icm#1](https://code.europa.eu/simpl/simpl-open/development/monitoring/infrastructure-consumption-monitoring-service/-/work_items/1) (still present at icm 2.6.1).
6. **simpl-notification-service SMTP defaults** — `dev@simpl-europe.eu` via `ssl0.ovh.net` should be a placeholder, not the EC dev environment.
   ✅ *Filed wave 2:* [notification-service#2](https://code.europa.eu/simpl/simpl-open/development/contract-billing/notification-service/-/work_items/2) (still present at notification-service v2.7.0).
7. **onboarding hardcoded `keycloak.realm: "onboarding"`** in `src/main/resources/application.yml` — should be parameterised via env / Spring property override.
   ❌ *Claim invalid as a blocker:* the realm IS overridable via the chart's `appConfig` → spring-configmap mechanism (FVH flipped it to `authority` without a fork). Residual style nit only: the key lacks a `[TOKEN]` placeholder unlike its siblings.
8. **users-roles consumer FE URL hardcoded** — `https://fe.iaa-dsdev-consumer.dev.simpl-europe.eu/...` in `application.yml` notification template default.
   ⬜ *Already reported* as a by-catch finding inside wave-1 [authority-iaa#4](https://code.europa.eu/simpl/simpl-open/development/iaa/agent-iaa/authority-iaa/-/work_items/4).
9. **simpl-notification-service Kafka SASL config path** — the chart's `kafka.sasl.mechanism` value writes to a config key the Spring application does not read, so a PLAIN override never reaches the Kafka client and the pod authentication-fails in a tight restart loop. Either the chart should propagate to the correct Spring property, or the application should read from the chart-documented key.
   ⬜ *Fixed upstream:* notification-service **v2.6.2** — the consumer config now `@Value`-injects `spring.kafka.properties.{security.protocol,sasl.*}` instead of hardcoding SASL_PLAINTEXT.
10. **security-attributes-provider (sap) vault-env VAULT_ADDR** — the chart pod template forces `VAULT_ADDR: https://vault:8200`, overriding the VSWH-injected local OpenBao URL and causing vault-env DNS resolution failure. The chart should allow this environment variable to be overridden or omitted to support external secret injection.
    ❌ *Claim invalid:* the sap chart contains zero vault content (clean `.Values.env` passthrough); `https://vault:8200` is the bank-vaults vault-secrets-webhook chart default, which FVH already overrides cluster-wide in `vswh.yaml`. The failure mode belonged to webhook configuration, not the sap chart.

### Discovered 2026-06-15 (authority-iaa v1.2.23 post-sync validation, tracked internally — not part of the 2026-06-11 wave)

Both surfaced only at runtime after ArgoCD synced the v1.2.23 image bumps; the chart-template diffs were byte-identical, so neither was visible pre-sync. Both are instances of the chart-vs-`$values` version skew documented in [upstream-deviation.md §Summary](../sbom/audit/upstream-deviation.md#summary). Fixed internally. **Both filed upstream 2026-06-15** (wave 3), each re-verified present at the latest GA chart and deduplicated against the project tracker first — see [upstream-feedback.md §0](../upstream/upstream-feedback.md#0-filing-log) A8/A9.

11. **sap (security-attributes-provider) 2.12.x `ephemeral-proof.issuer-url` unsubstituted placeholder** — chart `values.yaml` defaults `appConfig.simpl.ephemeral-proof.issuer-url` to the SIMPL-pipeline token `[SIMPL_EPHEMERAL_PROOF_ISSUER_URL]`, which the binding validates as `@NotNull URI`. A deployer not running the SIMPL CI substitution (FVH, and any plain-Helm/ArgoCD consumer) gets a null bind → `APPLICATION FAILED TO START`. The chart should ship a real default or document the required override; `values-test.yaml` doesn't set it either. FVH override: `issuer-url: https://governance.simpl-eval.tfds.io/sapApi/v1`. ✅ **Filed 2026-06-15** ([security-attributes-provider#1](https://code.europa.eu/simpl/simpl-open/development/iaa/security-attributes-provider/-/work_items/1)); still present at latest GA chart v2.13.0.
12. **tier1-gateway 2.12.x `jwt-configuration.primary.realm` required but only commented** — the realm config moved off `appConfig.keycloak.app.realm` (set by the v3.0.4 `app-values`, silently dead at 2.12.x) to `appConfig.jwt-configuration.primary.realm` (`@NotBlank`), shipped only as a commented `<your-realm-name>` example in the chart `values.yaml` with no migration note. Plain-Helm deployers crash-loop with no chart-surfaced guidance. The chart should either keep reading the old key, ship an active default, or document the move. FVH override: `jwt-configuration.primary.realm: authority` (+ `applicant.realm: authority` for the authority deployment). ✅ **Filed 2026-06-15** ([tier1-gateway#2](https://code.europa.eu/simpl/simpl-open/development/iaa/tier1-gateway/-/work_items/2)); still present at latest GA chart v2.14.0.

## Dependency Graph

See `docs/simpl-open/architecture/dependency-graph.d2` (source) and `docs/simpl-open/architecture/dependency-graph.svg` (rendered).

Key topology observations from the graph:

- **Two namespace boundaries**: `simpl-eval-common` (kafka, openbao, vswh, infra services) and `simpl-eval-governance` (all SIMPL business services + Keycloak/EJBCA/redis).
- **Cross-namespace secret bridge**: `bridge-secrets` in common fans out 9 postgres-credential Secrets that governance services consume.
- **Vault-agent fan-in**: ~10 services rely on the openbao instance via vault-secrets-webhook injection — this is a single point of dependency for governance + common services.
- **Cloud SQL fan-in**: All 7 governance Java services route through the in-namespace `cloudsql-proxy-g` Service to reach the single Cloud SQL instance.
- **EC-registry fan-in**: 14 deployed services pull images from `registry.code.europa.eu` (14 EC-specific refs in `images.yaml`) — this is the single biggest portability anchor visible in the graph. (The `openbao-config` Job, previously counted here, actually runs the public `quay.io/openbao/openbao` image, not an EC image — it is not an EC anchor.)
- **Helm chart fan-in**: 15 SIMPL chart Applications pull from `code.europa.eu/api/v4/projects/<NNN>/packages/helm/stable`. This is anonymously readable for now, but a coupling. (`openbao-config` was forked to `ghcr.io/forumviriumhelsinki`, dropping it from this set — was 16.)

## Next Steps

1. **Convert `make-optional` items into real feature flags** in `argocd/applicationsets/simpl-eval/apps/` (icm + 6 fe-/UI charts). Currently they're "skipped by absence" — making them explicit `enabled: false` with a comment improves intent visibility.
2. ~~**File the 10 upstream issues** (cross-check against the internal filing log).~~ Done 2026-06-11 (filing wave 2) — see the per-item dispositions above; only 2 of the 10 survived verification and were filed, 2 were already fixed upstream, 1 was already reported, 5 were invalid.
3. **Consider mirroring SIMPL images to GHCR** to remove the EC-registry runtime dependency. This is the single biggest one-shot portability improvement.
4. **Consider patching onboarding's hardcoded realm name** (or maintaining a fork) if a non-EC deployment ever needs a different realm.
5. **Re-run this audit at v3.1.x** when the fe-* charts mature, to decide whether FVH should adopt them or stay on monolithic simpl-fe. The fe-* split is tracked internally (v3.1.0 Option 2 prep, per ADR-0037).

*Status 2026-06: two of the keep-with-fix charts have since been forked outright — `openbao-config` (noted above) and `authentication-provider` (pinned to a published 2.8.1 fork to end the create-secret Job's permanent ArgoCD Missing/OutOfSync — issue 4 below remains an upstream defect).*
