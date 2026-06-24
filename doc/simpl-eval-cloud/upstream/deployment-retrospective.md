---
title: "Deploying 30 Interconnected Apps to a Remote GKE Cluster: A SIMPL-Eval Story"
date: 2026-02-17
type: retrospective
project: Forum Virium Helsinki Infrastructure
tags: [argocd, gitops, gke, terraform, devops, helm]
status: draft
---

# Deploying 30 Interconnected Apps to a Remote GKE Cluster: A SIMPL-Eval Story

> **Status: Feb 18, 2026 snapshot**, preserved as written — including its
> since-superseded "Current State" and "What's Next" sections. The
> [Epilogue](#epilogue-june-2026) below (added 2026-06-11) tells how it
> ended; the full phase-by-phase continuation is in
> [`deployment-timeline.md`](../overview/deployment-timeline.md).

Deploying a multi-tenant evaluation environment as a side project—and what broke along the way.

## The Mission

Forum Virium Helsinki needed to set up SIMPL-Open: a European data-sharing platform evaluation environment running on Google Cloud. The platform consists of about 30 interconnected Helm charts (PostgreSQL operators, Kafka, Keycloak, vault, governance services, frontend), all designed by external EU consortiums.

The documented SIMPL-Open deployment procedure includes its own ArgoCD instance on the target cluster. We chose not to follow that approach. We already run an ArgoCD instance that manages all our GitOps deployments, and we wanted SIMPL-Open visible alongside everything else—not hidden behind a separate ArgoCD that we would also need to configure, secure, and maintain. Running a second ArgoCD means a second set of RBAC policies, a second authentication setup, and a second UI to monitor. Or worse, leaving the bundled ArgoCD with its default configuration.

Instead, we connected the remote GKE cluster to our existing ArgoCD using GKE Hub fleet membership. This meant we could manage SIMPL-Open the same way we manage everything else, but it also meant we needed to solve problems the bundled ArgoCD would have handled automatically—like the variable substitution that the upstream charts expect.

## Prologue: the local-kind era (late 2025)

Before any GCP work, we ran SIMPL-Open on a local kind cluster (a Makefile-driven deployment with self-installed ArgoCD and OpenBao). That evaluation phase is what de-risked the GKE deployment, and two of its findings carried forward:

- **The A1 upstream bug (`valueFiles: null`) was found here first.** The umbrella charts' `range .Values.*.valueFiles` loops render an empty `valueFiles:` key when the list is empty, which Kubernetes rejects as `null`. We worked around it locally with an automated chart-patch script before encountering the same bug again on GKE; it heads the upstream catalog in [upstream-feedback.md](upstream-feedback.md) (Category A1).
- **Patching upstream charts is a tooling problem, not a one-off.** The local era taught us to automate chart patches (a Python script wired into the deployment flow) rather than hand-editing — the same philosophy later became the CMP plugin and the chart forks on GKE.

The local-kind working notes (HANDOFF, TESTING-SUMMARY, FIXES-APPLIED, DEPLOYMENT-SUCCESS-SUMMARY) were retired in June 2026; everything still relevant lives in this document and the upstream catalog. The local deployment tooling itself was retained separately.

## The Plan (Jan 14–23)

We started with Terraform: a fresh GKE cluster (shipped as GKE Standard), Workload Identity, and Secret Manager integration.

What actually happened:
- Day 1: Terraform module scaffolding
- Days 6–8: Terraform apply failures due to compute permissions, IAM service account naming, and SSD quota limits. We switched to HDD disks and added `deletion_protection`
- Day 9: Cluster connectivity. GKE Hub fleet membership so our management ArgoCD could actually reach the remote cluster

**Lesson**: Most Terraform errors come from wrong assumptions about quotas and permissions. Read the error, check the quota, check IAM, verify service account roles.

The infrastructure was ready by Jan 23. The problems started when we tried to deploy ArgoCD applications.

## The CMP Plugin Saga (Jan 26–30)

The SIMPL-Open charts use `${NAMESPACE}` and `${NAMESPACETAG}` placeholders that need to be replaced at deploy time. ArgoCD does not support this by default. We needed a Config Management Plugin (CMP)—a sidecar container that runs custom template logic before ArgoCD processes the manifests.

This took 11 commits over 5 days.

**Jan 28** alone had 7 commits:
1. Adding a CMP sidecar
2. Fixing the image version to match ArgoCD v3.2.0
3. Adding a readiness probe to the CMP
4. Fixing the readiness probe socket path
5. Removing the version string that broke the socket path
6. Adding cluster permissions
7. Pinning charts to tagged releases

Each fix revealed the next problem: the socket path depended on the plugin name, the readiness check was timing out, the image version did not match.

**By Jan 29**, we had moved substitution to the init phase, filtered out nested Application CRs that would break CMP processing, and built a custom sidecar image with `yq` for YAML processing.

**Jan 30** was just a final image version fix.

We went from shell scripts to a custom Go rewrite the following week.

**Lesson**: When debugging a plugin sidecar, check in this order:
1. Can it start? (image, service account)
2. Can it connect? (socket path, port binding)
3. Does it respond? (readiness probe config)
4. Does it work? (actual template logic)

Skipping any step means debugging the wrong thing.

## The OpenBao Vault (Feb 3–9)

By early February, we had rewritten the CMP in Go (`feat(argocd-cmp): rewrite CMP plugin in Go for distroless deployment`), with distroless images, proper error handling, and structured logging.

Next: OpenBao vault with GCP KMS auto-unseal.

The setup:
1. GCP KMS key for auto-unsealing
2. Workload Identity binding
3. IAM roles for the service account
4. Full HCL config with the seal stanza

By Feb 6, KMS auto-unseal was working. By Feb 9, it was documented.

This went smoothly because we followed a clear order: set up Workload Identity, configure IAM bindings, then write the application config.

**Lesson**: When integrating a secrets engine with GCP, get the IAM bindings working first. Verify Workload Identity before configuring the application.

## The Big Deployment (Feb 10–11)

On Feb 10, we deployed all ~30 nested ArgoCD Applications in one commit: PostgreSQL operators, Kafka, Keycloak, Neo4j, Redis, gateways, governance services, and frontend.

20+ applications failed immediately.

We started fixing them:

**Cloud SQL Proxy** (`fa1f160`): The proxy was binding to `127.0.0.1` internally, which meant the liveness probe couldn't reach it from outside the pod. We built a Helm chart that wraps the proxy, exposes it on `0.0.0.0:5432`, and integrates Workload Identity.

**OpenBao init/config conflict** (`0a861cc`): Both the `openbao-init` and `openbao-config` charts were generating the same 9 Secrets. We split them into separate nested applications with sync waves, letting init create secrets and config use them.

**Confluent Operator CRD size** (`0a861cc`): The Kafka operator CRDs are 262KB of schema. ArgoCD's standard 3-way merge cannot handle that size. We added `ServerSideApply` to the application's sync options.

**Redis StorageClass** (`0a861cc`): The Redis operator needed `standard-rwo` but it wasn't defined. One line in the AppProject destinations fixed it.

**7 app-level errors** (`f954219`): Mailpit used the wrong ingress field (`hostname` instead of `host`). Redpanda Console expected a different config key. EJBCA ingress was not formatted correctly. Small chart differences that added up.

By Feb 11, we had identified and fixed all the root causes. The apps were not all healthy, but they were syncing.

**Lesson**: When deploying 30 apps at once:
1. Have a readiness checklist before you deploy
2. Triage by sync order (vault before everything else)
3. Separate init from config phases
4. Check CRD sizes and controller behavior upfront
5. Document the quirks of each chart you're composing

## The Cleanup (Feb 13–16)

Migrated app secrets from centralized `argocd-secrets` to co-located ExternalSecrets within each app's `valuesObject`. This follows the architectural decision that project repos own their secrets, not the infrastructure repo.

This was routine cleanup—necessary for maintainability.

## Summary

This work happened over about 5 weeks, alongside other projects—it was roughly 20% of total workload during that period. The 55 commits were spread across:

- 1 GKE cluster (Standard)
- 1 Config Management Plugin (shell → Go rewrite)
- 1 vault deployment (OpenBao + GCP KMS)
- ~30 nested applications
- 25+ upstream Helm chart repositories

The work followed this order:

1. **Infrastructure-up**: Get the cluster, networking, security working
2. **Connectivity**: Enable ArgoCD to reach the remote cluster
3. **Templating**: Build the CMP to handle upstream chart quirks
4. **Secrets**: Vault setup with auto-unseal
5. **Applications**: Deploy the actual workloads
6. **Iteration**: Fix the 20+ failures that happened
7. **Hygiene**: Migrate secrets, close the gaps

## What Went Right

- **Terraform was reliable**: Once we had the right GCP quotas and permissions, the module applied cleanly and stayed clean
- **ArgoCD worked well**: Once the CMP was stable, ArgoCD synced everything correctly
- **Workload Identity simplified authentication**: No service account keys to rotate, no secrets in environment variables
- **Nested apps provided isolation**: Each component could fail without bringing down others
- **Sync waves controlled ordering**: By setting which apps sync first, we avoided dependency deadlocks

## What Would Go Differently

**Upstream chart testing**: Test the charts locally first. Find the placeholders, configuration differences, and schema mismatches before deploying.

**CMP plugin strategy**: Build and test the plugin with real charts early, not in production.

**Vault architecture**: Decide on auto-unseal before starting. It is much simpler than manual unsealing.

**App-level readiness**: Each chart assumes certain things about its environment (StorageClass, networking, RBAC). Document these assumptions before deployment.

**Sync order**: Plan which apps need to be running before others. Do not discover this during deployment.

## Current State

As of Feb 18, the environment is deployed but not stable. 13 of 32 applications are Degraded, 4 are stuck in Progressing, and 2 upstream charts have template bugs that prevent ArgoCD from rendering manifests at all.

The main failure chain: OpenBao init/config Jobs are stuck, so secrets are not distributed. Keycloak cannot start without its secrets. Most governance services cannot start without Keycloak. One blocked Job leads to 13 degraded apps.

Separately, two upstream charts (governance-frontend and tier1-gateway v2.5.0) have bugs in their YAML templates. These are problems in the SIMPL-Open charts themselves. We can work around them by using older chart versions or patching values, but they need upstream fixes.

## What's Next

1. Unblock OpenBao Jobs: check vault seal status, delete stuck Jobs to trigger re-creation
2. Get Keycloak running, which should fix most governance failures
3. Pin or patch the two broken upstream charts
4. Fix remaining app-specific issues once their dependencies are healthy

The cluster, networking, GitOps pipeline, and vault architecture all work. The remaining problems are in the application layer: stuck Jobs, upstream chart bugs, and cascading failures from shared dependencies being down.

Five weeks of part-time work got us from zero to deployed. Getting to stable is the next phase.

## Epilogue (June 2026)

*Added 2026-06-11. Everything above is the February snapshot, unchanged —
its "Current State" and "What's Next" reflect Feb 18 and are superseded by
this section.*

The February snapshot ends mid-story; here is how it ended. The full
phase-by-phase account is in
[`deployment-timeline.md`](../overview/deployment-timeline.md).

**Stable, then functional.** The OpenBao chain unblocked as predicted, a
v3.0.x chart-bump cascade in April–May produced the bridge-secrets chart and
a portability audit, and upstream's v3.1.0 (May 20) added first-class
external-ArgoCD documentation — validating the deployment pattern this
retrospective argued for. On **June 11 the full governance onboarding loop
closed**: procedure template defined, applicant registered and submitted,
NOTARY approval granted — the platform doing the thing it exists to do,
end-to-end, on ~40 ArgoCD applications.

**The two "broken" charts.** The governance-frontend and tier1-gateway
v2.5.0 template bugs called out above were re-verified against upstream in
June: the frontend chart actually rendered fine all along (our
ComparisonError was a values problem), while tier1-gateway's failure was
real but mis-diagnosed — the chart's default `ingress.issuer: ""` renders a
nil annotation that ArgoCD rejects. A reminder that February's triage notes
are hypotheses, not verdicts.

**Closing the loop upstream.** Everything we worked around was eventually
re-verified at upstream HEAD and either filed on code.europa.eu (12 issues
across two waves, June 2026), confirmed already fixed upstream, or
retracted as mis-diagnosed. The living record is
[`upstream-feedback.md`](upstream-feedback.md) §0; the filing log is tracked
internally.

**Postscript (June 15) — "byte-identical chart diff" is not "inert".** Four
days later, completing the `authority-iaa v1.2.23` component set bit
us with exactly the failure mode this epilogue warns about. The remaining
five IAA bumps were merged as pin-only on the strength of byte-identical
chart-template diffs — but two of the new *images* (tier1-gateway 2.12.6, sap
2.12.4) had added mandatory Spring config the charts never surface
(`jwt-configuration.primary.realm`; `simpl.ephemeral-proof.issuer-url`),
and both crash-looped at boot once ArgoCD synced. Post-sync validation
caught it, the keys were supplied in `valuesObject`, and both
defects were filed upstream the same day (wave 3 — security-attributes-provider#1,
tier1-gateway#2) after re-verifying they persist at the latest GA charts. The February-triage lesson — *notes
are hypotheses, not verdicts* — generalises: a clean chart diff certifies the
templates, never the image's runtime config contract. Validate against live
pods, not artifacts.

---

*Work started: Jan 14, 2026 | Initial deploy: Feb 10 | Onboarding loop closed: Jun 11, 2026 | IAA v1.2.23 set completed + validated: Jun 15 — ~40 apps deployed, 14 upstream issues filed*
