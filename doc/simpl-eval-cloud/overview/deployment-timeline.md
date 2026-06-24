# SIMPL-Eval Deployment Timeline

Chronological account of the SIMPL-Open evaluation infrastructure deployment, compiled from git history.

## Phase 1: GCP Infrastructure (Jan 14–23)

**Jan 14** — Initial commit bootstrapping the Terraform module for a dedicated GKE cluster, networking, and foundational GCP resources. (Early drafts considered GKE Autopilot; the cluster shipped as GKE **Standard** — a deliberate choice to keep node-level control for the evaluation.)

- `d84ae4f` feat(simpl-open): add SIMPL Open evaluation infrastructure
- `456677c` feat(simpl-open): add SIMPL Open evaluation infrastructure

**Jan 20–22** — Terraform iteration to get the GCP module to `terraform apply` cleanly. Issues included compute permissions, IAM naming, resource dependencies, SSD quota limits, and a missing variable.

- `65191f4` feat(gcp): expose Cloud SQL toggle for SIMPL-Open evaluation cluster
- `8fd517f` feat(gcp): expose Cloud SQL toggle for SIMPL-Open evaluation cluster
- `bb601b2` fix(gcp): resolve simpl-eval module Terraform apply errors
- `f4afdfd` fix(gcp): resolve simpl-eval module Terraform apply errors
- `265ee44` fix(gcp): resolve remaining simpl-eval Terraform apply errors
- _related:_ fix(gcp): add compute permissions for Terraform Cloud service account
- _related:_ docs(gcp): add Terraform Cloud service account prerequisites
- _related:_ fix(gcp): add missing deletion_protection variable
- `8f078d7` fix(gcp): use HDD disks for simpl-eval to avoid SSD quota limit
- `3456c0f` fix(gcp): use HDD disks for simpl-eval to avoid SSD quota limit

**Jan 23** — Cluster connectivity. Added GKE Hub fleet membership so the management ArgoCD could reach the remote simpl-eval cluster via Connect Gateway. Enabled cluster deployment in ArgoCD.

- `749c124` fix(gcp): add fleet membership for simpl-eval ArgoCD connectivity
- `aece392` fix(gcp): add fleet membership for simpl-eval ArgoCD connectivity
- `fefc9a0` fix(gcp): set HDD disk type on simpl-eval default node pool
- `6ac6b00` feat(argocd): enable simpl-eval cluster deployment
- `b63d8f3` feat(argocd): enable simpl-eval cluster deployment

## Phase 2: ArgoCD Integration & CMP Plugin (Jan 26–30)

**Jan 26** — External DNS Workload Identity for the simpl-eval cluster. Fixed chart paths (`helm` → `charts`).

- `2ccbc44` feat(gcp): add External DNS Workload Identity to simpl-eval module
- `8fb740c` fix(argocd): update simpl-eval chart paths from helm to charts

**Jan 27** — Created dedicated `simpl-eval` AppProject with RBAC for a team member.

- `3963323` feat(argocd): create dedicated simpl-eval project and grant developer access
- `72927a8` feat(argocd): create dedicated simpl-eval project and grant developer access

**Jan 28** — The CMP plugin saga. SIMPL-Open upstream Helm charts use `${VARIABLE}` placeholders that ArgoCD can't natively resolve. This triggered 7 commits in a single day as the CMP sidecar was iteratively debugged:

- `eb0a459` fix(argocd): add CMP plugin for SIMPL Open chart version placeholder
- `575ddc1` fix(argocd): correct CMP sidecar image version to match ArgoCD v3.2.0
- `c38b6a5` fix(argocd): add readiness probe to CMP sidecar to prevent connection errors
- `82f77f0` fix(argocd): correct CMP sidecar readiness probe socket path
- `79c3e39` fix(argocd): remove version from CMP plugin to fix socket path mismatch
- `75a3be2` fix(argocd): add cluster resource permissions to simpl-eval project
- `1b1a324` fix(argocd): add kube-system namespace to simpl-eval project
- `fcf9fae` fix(argocd): add kube-system namespace to simpl-eval project
- `fb8ee7f` fix(argocd): pin simpl-eval charts to tagged releases
- `fe786ca` fix(argocd): pin simpl-eval charts to tagged releases

**Jan 29** — CMP refinement. Moved substitution to init phase, expanded AppProject for 25+ chart repos, filtered nested Application CRs from CMP output, built custom sidecar image with `yq`.

- `1e25fef` fix(argocd): substitute SIMPL Open placeholders in CMP init phase
- `f2b7a8b` fix(argocd): expand simpl-eval AppProject permissions for SIMPL-Open charts
- `9a9d38a` fix(argocd): expand simpl-eval AppProject permissions for SIMPL-Open charts
- `d6d94a1` fix(argocd): filter nested Applications in SIMPL CMP and create them separately
- `4d28d5b` fix(argocd): filter nested Applications in SIMPL CMP and create them separately
- `fa4f017` fix(argocd): add custom CMP sidecar image with yq for YAML processing

**Jan 30** — Fixed CMP image version alignment.

- `f7cdbb1` fix(argocd): correct CMP image version to match pending release

## Phase 3: CMP Rewrite & OpenBao (Feb 3–9)

**Feb 3** — Rewrote the CMP plugin in Go for distroless deployment, replacing the shell-based approach. Added openbao and bank-vaults repos to the project.

- `b329554` feat(argocd-cmp): rewrite CMP plugin in Go for distroless deployment
- `be96869` fix(argocd): add openbao and bank-vaults repos to simpl-eval project

**Feb 6** — Configured OpenBao GCP KMS auto-unseal: KMS key, Workload Identity SA, IAM bindings, and full HCL seal config.

- `787276d` feat(gcp): configure OpenBao GCP KMS auto-unseal for SIMPL-Open evaluation cluster
- `b944a1a` feat(gcp): configure OpenBao GCP KMS auto-unseal for SIMPL-Open evaluation cluster

**Feb 9** — Documentation for the KMS auto-unseal setup.

- `cb5633f` docs(simpl-open): update OpenBao documentation for GCP KMS auto-unseal
- `5d29991` docs(simpl-open): update OpenBao documentation for GCP KMS auto-unseal

## Phase 4: Nested Apps & Mass Fixes (Feb 10–11)

**Feb 10** — The big deployment push. Added ~30 nested ArgoCD Applications covering the full SIMPL-Open stack: PostgreSQL, Kafka, Keycloak, EJBCA, Neo4j, Redis, gateways, frontend, and all governance services. Immediate follow-up fixes addressed Cloud SQL Proxy binding, missing StorageClass, broken valuesRef, and openbao config issues.

- `9752898` feat(argocd): add nested ArgoCD Applications for all SIMPL-Open components
- `f500b20` feat(argocd): add nested ArgoCD Applications for all SIMPL-Open components
- `2ea1c5c` feat(simpl-eval): add Cloud SQL proxy and fix 20+ app failures
- `fa1f160` fix(simpl-eval): add Cloud SQL proxy and fix 20+ app failures
- `34417d8` Add kubectl image configuration to simplEval Redis
- `9770308` fix(simpl-eval): correct openbao-config values path and bump chart
- `27e045f` fix(simpl-eval): correct openbao-config values path and bump chart
- `b44b84f` fix(simpl-eval): remove broken valuesRef from openbao-config

**Feb 11** — Continued stabilization. Root causes addressed: OpenBao init/config conflict (9 duplicate Secrets), Confluent Operator CRD size (262KB+ requiring ServerSideApply), Redis StorageClass dependency, and 7 individual app-level errors.

- `f66b8de` fix(simpl-eval): correct openbao-config values to match chart schema
- `9474ab0` fix(simpl-eval): correct openbao-config values to match chart schema
- `d14fd4d` fix(simpl-eval): add openbao-init chart deployment
- `ed575d6` fix(simpl-eval): resolve 3 root causes degrading 14 applications
- `0a861cc` fix(simpl-eval): resolve 3 root causes degrading 14 applications
- `f954219` fix(simpl-eval): fix 7 application-level errors in nested apps

## Phase 5: Secrets Migration (Feb 13–16)

**Feb 16** — Migrated remaining app secrets from centralized `argocd-secrets` to co-located ExternalSecrets within each app's `valuesObject`, following the pattern established by ADR-0014.

- _related:_ feat(argocd): migrate remaining app secrets from argocd-secrets to co-located ExternalSecrets

## Phase 6: v3.0.x Recovery Cascade (Apr 27 – May 12)

After two months of relative quiet, a chart-version bump to track upstream `governance-authority v3.0.x` re-opened a long cascade of issues. Each fix unblocked the next, in a pattern reminiscent of the Feb 10–11 mass push but spread over two weeks. Two outcomes stand out: the **bridge-secrets** chart (a new local Helm chart that bridges externally-managed secrets into the Spilo / OpenBao formats SIMPL-Open expects) and the **portability audit** doc that retrospectively catalogues every FVH override required to make the upstream stack work on GKE.

**Apr 27** — Recipe and ExternalSecret plumbing. Discovered binary keystores in ejbca-rest-api couldn't be base64-encoded by the templater; explicit decode required.

- `0ecbeea3` fix(simpl-eval): replace invalid gcloud projection in grant-iam recipe
- `f7b6803b` fix(simpl-eval): base64-decode binary keystores in ejbca-rest-api ExternalSecret

**Apr 28** — The chart bump and its immediate fallout. Aligning to upstream's `governance-authority v3.0.x` umbrella exposed a chain of identity-provider, gateway, and database-config mismatches. Six commits in one day.

- `c27aa96a` chore(simpl-eval): align chart versions with upstream umbrella v3.0.x
- `1c449b1e` fix(simpl-eval): inject EJBCA keystore/truststore passwords for identity-provider
- `7cc5ae9d` fix(simpl-eval): override identity-provider keystore alias to match EJBCA-generated cert
- `97bab786` fix(simpl-eval): override appConfig datasource for governance apps using db.*
- `5f2a3b76` fix(simpl-eval): set kafkaConfig.simpl.kafka.topic.prefix for auth-provider and users-roles
- `142881e1` feat(simpl-eval): add drift detection recipe and colorize triage output

**Apr 29** — Frontend, tier1-gateway, and openbao-config recovered after the bump.

- `42060353` fix(simpl-eval): recover frontend, tier1-gateway, openbao-config after v3.0.x bump

**May 4** — Documentation push and the auth-provider hole. Two doc PRs landed in parallel with two more fixes. The **portability audit** became the canonical "what FVH had to override and why" reference; the **auth-provider credential bootstrap research** documented the SIMPL_AUTH_PROVIDER_ADMIN_PASSWORD bootstrap chain that nothing in the upstream chart explains.

- `44350ac4` fix(simpl-eval): replace broken simpl-eval-app-events justfile recipe
- `80c027cb` docs(simpl-open): land Phase 1+2 portability audit
- `0041d88f` fix(simpl-eval): set appConfig.client.authority.url for auth-provider
- `551bb50d` docs(simpl-open): document auth-provider credential bootstrap research
- `70009b7a` fix(simpl-eval): unblock users-roles + tier2-gateway via SIMPL_KAFKA_TOPIC_PREFIX env var

**May 5** — Cost-attribution work (GKE Cost Allocation, Resource Usage Export, Cloud SQL labelling) — not strictly SIMPL-Open functional work, but pinning the simpl-eval cluster spend to the TFDS project for cost attribution was the trigger.

- `f1e5a2d1` feat(gcp): add GKE cost observability dataset + simpl-eval cost allocation
- `d91041f6` feat(cost): label simpl-eval Cloud SQL instance for TFDS cost attribution
- `b21aab2b` feat(cost): enable GKE Cost Allocation + Resource Usage Export on arc-runners

**May 12** — The Redis password cascade close-out and a SAP liveness fix. The Redis override was the trailing edge of a cascade that opened on May 9 when an upstream chart bump pulled a Spring Redis client that read the password from a different env-var than `bridge-secrets` was setting.

- `e0eb25e7` fix(simpl-eval): override Spring Redis password from redis-secrets (close 2026-05-09 cascade)
- `6c60bd7f` fix(simpl-eval): bump SAP memory limit to 1Gi (liveness probe killing slow Spring Boot startup)

## Phase 7: v3.1.0 Release, A7 Discovery, ADR-0037 (May 20–25)

**May 20** — SIMPL-Open releases `governance-authority v3.1.0` on `code.europa.eu`. Per upstream notes: multidomain support, OpenBao-vault improvements, and (notably) a new `documents/deployment-guide/ARGOCD_DEPLOYMENT.md` that treats external ArgoCD as a first-class supported pattern — a subset of which traces back to FVH-raised feedback ([`upstream-feedback.md`](../upstream/upstream-feedback.md) Categories B1 + B2).

**May 25** — Three threads land on the same day:

- **A7 upstream bug discovered.** Bisect of the `authentication-provider create-secret` Job traces a non-terminating loop to a recent `randAlphaNum` Helm function change. Filed internally against the upstream-feedback doc.
- **Audit-doc corrections.** Re-reading the portability audit against the actual v3.0.x deployed state surfaced three errors: vault-env was already wired for SAP (not just identity-provider), Kafka SASL applies to notification-service too, and a sixth bootstrap precondition (the auth-provider admin password) was missing from the list. Filed internally.
- **ADR-0037 proposal.** A Chrome session reading the private `code.europa.eu/simpl/simpl-open` GitLab UI confirmed v3.1.0 is a structural restructure (umbrella → 3 subcharts; `bitnami/keycloak` re-introduced; 5 modular `fe-*` charts replace monolithic `simpl-fe`; chart distribution moves to a published `authority` chart at project 902). Filed internally — sketches four adoption options under the foundational external-ArgoCD constraint and gates the decision on external Hetzner validation.

## Phase 8: PKI Hardening, Operator-Flow Closure & Upstream Filing (May 26 – Jun 11)

The v3.1.0 decision (deferred per ADR-0037) shifted focus to making the deployed v3.0.4 stack actually complete the end-to-end participant onboarding flow. The work ran in four threads — PKI durability, chart forks to end permanent drift, a component-bump cascade, and finally the operator flow itself — closing with an upstream filing pass.

**May 26–27** — Decision records land. ADR-0037 merged with **Option 1** (stay on the v3.0.4 umbrella-bypass, bump components individually; full v3.1.0 adoption deferred pending external validation on Hetzner). The Technical Deployment Spec was rewritten for the v3.1.0 target state, and the portability-audit corrections plus the A7 upstream bug entry (authentication-provider `create-secret` Job `randAlphaNum` loop) were filed.

- `4a49b063` docs(adr): add ADR-0037 — SIMPL-Open governance-authority v3.1.0 adoption strategy
- `4bb2bf6b` docs(simpl-open): rewrite Tech-Spec for v3.1.0, refresh sbom
- `fd7c8db9` docs(simpl-open): correct portability audit
- `e3e53cb1` docs(simpl-open): add A7 upstream bug

**May 28 – Jun 5** — Ownership and durability. FVH took over namespace bootstrap from the upstream parent apps, persisted the EJBCA CA across restarts (PVC + H2 persistence), forked the openbao-config chart to fix a stale `kubernetes_host`, automated the Governance Authority PKI bootstrap, and provisioned the fc-service Cloud SQL database.

- `42bb7a19` refactor(simpl-eval): own namespace bootstrap, drop upstream parent apps
- `c4e2d4f0` / `486e9f41` fix(simpl-eval): persist EJBCA CA across restarts
- `79d64737` / `53230bc9` feat(openbao-config): fork upstream chart, activate GHCR fork — patches the hardcoded stale `kubernetes_host` (`10.3.0.1` → `kubernetes.default.svc`). (Jun-11 re-verification found upstream had independently shipped the same fix in v1.3.4 on May 7 — the fork is now retirable; tracked as follow-up.)
- `dae94e77` feat(simpl-eval): automate Governance Authority PKI bootstrap
- `4245343f` feat(gcp): provision simpl-eval-governance_fcservice Cloud SQL database

**Jun 8–9** — EJBCA and chart-drift close-out. The CA re-seed runbook was rewritten to a validated CLI procedure, the EJBCA server-cert SAN was pinned to the service FQDN, and the authentication-provider chart was forked (pinned to published 2.8.1) to end its permanent ArgoCD Missing/OutOfSync state — finally closing the long-standing cosmetic-drift issue (tracked internally). The notification service moved to chart 2.7.0 with split probe endpoints, and the public-vs-Twingate endpoint exposure doc landed.

- `ff6e698b` docs(simpl-open): rewrite EJBCA re-seed runbook to the validated CLI procedure
- `e75002a2` fix(argocd): pin EJBCA HTTPSERVER_HOSTNAME so server cert SAN matches the svc FQDN
- `3b0450b7` / `05aed16e` fix(simpl-eval): fork authentication-provider chart, pin to 2.8.1
- `5c90fa94` fix(simpl-eval): upgrade common-notification to chart 2.7.0
- `c1d220b8` docs(simpl-eval): document public vs Twingate endpoint exposure

**Jun 10** — The authority-iaa v1.2.23 alignment day: users-roles bumped to 2.12.9, onboarding to 2.12.8 with paired runtime config, Keycloak image to 26.4.7, Keycloak realms bootstrapped declaratively via `--import-realm`, and the Keycloak issuer aligned with the gateway `/auth` StripPrefix topology.

- `1e8e5e98` fix(simpl-eval): align SPI URLs and users-roles with authority-iaa v1.2.23
- `8ae4e630` / `0e587517` users-roles 2.12.9 + onboarding 2.12.8
- `18808cbd` feat(simpl-eval): bootstrap authority + onboarding Keycloak realms via --import-realm
- `d1c89578` / `071ee0d6` fix(simpl-eval): Keycloak `/auth` gateway topology

**Jun 10–11** — **The full onboarding loop closes.** The governance-config operator flow was executed end-to-end and fixed layer by layer: gateway CORS + Keycloak `/auth` topology, attribute-authenticator SPI URLs, users-roles boot fixes, the onboarding secret correction, single-realm applicant topology, Kafka producer placeholder fix. **Jun 11: NOTARY approval granted** (NOTARY is the governance reviewer role that approves onboarding requests) — the full loop (template → applicant registration → submission → approval) closed. Root-cause pattern documented in [`governance-config-operator-flow.md`](../upstream/governance-config-operator-flow.md): component-set version skew vs the authority-iaa chart pins.

- `6b5d807a` fix(simpl-eval): single-realm applicant topology + operator-flow findings doc
- `b147d7e1` docs(simpl-eval): operator flow complete — full onboarding loop closed

**Jun 11** — Upstream filing day. Every accumulated workaround and finding was re-verified against upstream HEAD + latest tags and deduplicated against the public trackers, then filed on code.europa.eu via `glab`:

- **Wave 1**: the 7 operator-flow findings — all still present, all filed.
- **Wave 2**: 17 older candidates consolidated from `upstream-feedback.md`, the portability audit, and git history — 5 filed, 3 already fixed upstream (incl. the long-tracked A7 `randAlphaNum` Job fix, GA in authentication-provider v2.16.0 on Jun 9), 1 obsolete, 1 duplicate of wave 1, and **7 claims invalidated by verification** — the audit docs were corrected accordingly.

Filing log and dispositions tracked internally; living status table in [`upstream-feedback.md` §0](../upstream/upstream-feedback.md).

---

## Phase 9: Completing the IAA v1.2.23 Set (Jun 15)

**Jun 15** — The remaining five IAA components were bumped to the coherent `authority-iaa v1.2.23` pins: tier1-gateway `2.12.6`, sap `2.12.4`, tier2-gateway `2.11.4`, identity-provider `2.11.4`, tier2-proxy `1.5.5` — joining the users-roles `2.12.9` / onboarding `2.12.8` already aligned on Jun 10, and finishing the component-version side of ADR-0037 Option 1.

**The post-sync surprise.** Per-component schema audits had classed all five as pin-only (chart templates byte-identical within each major line), so the bumps merged on that basis. But post-sync validation caught that two of the new **images** — not their charts — added mandatory Spring config the chart artifacts never surface: tier1-gateway 2.12.6 requires `jwt-configuration.primary.realm` (the realm moved off the now-dead `keycloak.app.realm` path), and sap 2.12.4 requires `simpl.ephemeral-proof.issuer-url` (whose chart default is an unsubstituted SIMPL-pipeline placeholder). Both crash-looped with `APPLICATION FAILED TO START` while their old 2.8.0 ReplicaSets kept serving; the other three went Healthy cleanly, tier2-proxy held under its 500Mi limit with no OOM, and the HPA renames landed inert. The fix supplied both keys in `valuesObject`, and both defects were filed upstream the same day (wave 3 — [security-attributes-provider#1](https://code.europa.eu/simpl/simpl-open/development/iaa/security-attributes-provider/-/work_items/1), [tier1-gateway#2](https://code.europa.eu/simpl/simpl-open/development/iaa/tier1-gateway/-/work_items/2)) after re-verifying both still present at the latest GA charts. **Lesson:** a byte-identical chart-template diff does not certify an image bump as inert — image-internal config requirements are invisible in chart artifacts and must be validated against live pods.

---

## Summary

| Metric | Value |
|--------|-------|
| Calendar days (Jan 14 → Jun 15) | 152 |
| Phases | 9 (5 build-out, 1 recovery cascade, 1 v3.1.0 evaluation, 1 hardening + operator-flow closure, 1 IAA v1.2.23 completion) |
| Custom local Helm charts | 1 (`bridge-secrets`) + 2 forked upstream charts (`openbao-config`, `authentication-provider`) |
| Nested ArgoCD Applications | ~31 |
| Helm chart repos in AppProject | 25+ |
| Upstream issues filed (each re-verified at upstream HEAD before filing) | 14 (7 wave 1 + 5 wave 2 + 2 wave 3) |

The deployment followed an infrastructure-up pattern: GCP resources → ArgoCD connectivity → CMP plugin for upstream chart quirks → application deployments with rapid iteration on ~30 nested apps. The CMP plugin was the most iterative component, progressing from shell scripts → custom image with yq → full Go rewrite in under a week. Phases 6 and 7 added the **bridge-secrets** chart, the portability-audit retrospective, and the ADR-0037 decision point. Phase 8 closed both loops: the **functional** loop (with PKI made durable, two upstream charts forked to end permanent drift, and the authority-iaa v1.2.23 bumps in place, a real onboarding request was approved end-to-end on 2026-06-11) and the **feedback** loop (every workaround re-verified and either filed upstream, confirmed fixed, or retracted) — what started as a pure infrastructure exercise is now a published case study in deploying SIMPL-Open via external ArgoCD. Phase 9 (Jun 15) finished the authority-iaa v1.2.23 component set and, in doing so, surfaced the sharpest single lesson of the project: a byte-identical chart-template diff does not make an image bump inert — validate against live pods, not chart artifacts.
