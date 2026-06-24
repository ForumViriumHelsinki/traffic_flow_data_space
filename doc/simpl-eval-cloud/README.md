# SIMPL-eval — a cloud (GKE) deployment of SIMPL-Open

This directory documents Forum Virium Helsinki's **cloud** deployment of
[SIMPL-Open](https://code.europa.eu/simpl/simpl-open) — the European
Commission's open-source middleware for federated data spaces — on a
**managed Kubernetes (GKE Standard)** cluster on Google Cloud, regional in
`europe-north1`. The deployment is nicknamed `simpl-eval`.

It is the **cloud counterpart to the [`SIMPL-k3s/`](../SIMPL-k3s/) guide** in
this repository: where `SIMPL-k3s/` shows how to stand SIMPL-Open up on a
lightweight single-/multi-node `k3s` cluster, this directory captures what a
full managed-cloud deployment looks like — the GCP architecture, the upstream
issues we hit and reported, a portability audit of everything that couples the
deployment to a specific environment, a software bill of materials (SBOM) for
the deployed stack, and a deployment retrospective. The two are
**complementary, not redundant**: read `SIMPL-k3s/` to deploy; read this to
understand the cloud shape, the portability trade-offs, and the upstream
lessons.

> **Provenance.** This is a curated, genericized export of FVH's internal
> `simpl-eval` cloud-evaluation documentation, shared so other TFDS
> deliverables and partners can learn from it. Environment-specific
> identifiers (GCP project IDs, service-account emails, internal issue
> numbers, internal hostnames) have been replaced with `<placeholder>` values;
> the architecture, region, component versions, and concrete deployment shape
> are preserved. Anything in `<angle brackets>` is a placeholder you would
> substitute for your own environment.

## Reading paths

### "What is this?"

1. [overview/what-is-simpl-open.md](overview/what-is-simpl-open.md) — one-page
   intro to SIMPL-Open.
2. [overview/deployment-timeline.md](overview/deployment-timeline.md) — how the
   cloud deployment unfolded, phase by phase.

### "How is the cloud deployment shaped?"

1. [architecture/gcp-architecture.md](architecture/gcp-architecture.md) — GCP
   project, GKE cluster, IAM, networking, Cloud SQL, OpenBao + Cloud KMS
   auto-unseal, fleet/ArgoCD connectivity, and an illustrative cost estimate.
2. [architecture/deployment-spec.md](architecture/deployment-spec.md) —
   component specification (target state).
3. [architecture/endpoints.md](architecture/endpoints.md) — an example
   public-vs-restricted endpoint exposure matrix.
4. [architecture/portability-audit.md](architecture/portability-audit.md) —
   every environment-specific override and the production-readiness gap
   analysis.

### "What should an upstream contributor / operator know?"

1. [upstream/deployment-retrospective.md](upstream/deployment-retrospective.md)
   — the full deployment narrative with lessons learned.
2. [upstream/upstream-feedback.md](upstream/upstream-feedback.md) — categorised
   feedback gathered for the SIMPL-Open project.
3. [upstream/auth-provider-credential-bootstrap.md](upstream/auth-provider-credential-bootstrap.md)
   — the auth-provider credential-bootstrap chain.
4. [upstream/governance-config-operator-flow.md](upstream/governance-config-operator-flow.md)
   — governance config-operator flow findings.

### "What exactly is deployed?"

[sbom/](sbom/) — chart, image, and source inventory for the deployed stack,
plus coupling/portability audit notes.

## Document inventory

| Document | Concern | Purpose |
|---|---|---|
| [overview/what-is-simpl-open.md](overview/what-is-simpl-open.md) | overview | One-page intro to SIMPL-Open |
| [overview/deployment-timeline.md](overview/deployment-timeline.md) | overview | Chronological deployment story |
| [architecture/gcp-architecture.md](architecture/gcp-architecture.md) | architecture | GCP project & infrastructure reference (genericized) |
| [architecture/deployment-spec.md](architecture/deployment-spec.md) | architecture | Component specification (target state) |
| [architecture/endpoints.md](architecture/endpoints.md) | architecture | Example endpoint exposure matrix |
| [architecture/portability-audit.md](architecture/portability-audit.md) | architecture | Environment-override catalogue + production-gap analysis |
| [architecture/dependency-graph.svg](architecture/dependency-graph.svg) | architecture | Chart/secret dependency topology (rendered from [.d2](architecture/dependency-graph.d2)) |
| [upstream/deployment-retrospective.md](upstream/deployment-retrospective.md) | upstream | Full deployment narrative with lessons |
| [upstream/upstream-feedback.md](upstream/upstream-feedback.md) | upstream | Categorised upstream feedback |
| [upstream/auth-provider-credential-bootstrap.md](upstream/auth-provider-credential-bootstrap.md) | upstream | Credential-bootstrap chain |
| [upstream/governance-config-operator-flow.md](upstream/governance-config-operator-flow.md) | upstream | Governance config-operator flow findings |
| [sbom/](sbom/) | architecture | Chart / image / source inventory + coupling audit |

## A note on diagrams

Most diagrams in this repository are authored in MermaidJS (see
[../schematics/](../schematics/)). The two architecture diagrams in this
directory are instead authored in **[D2](https://d2lang.com/)** — kept as both
`.d2` source and a rendered `.svg` (which GitHub displays inline). Edit the
`.d2` and re-render with `d2 <file>.d2 <file>.svg`.

---

Part of the **Traffic Flow Data Space (TFDS)** project, carried out in
collaboration with the City of Helsinki, Forum Virium Helsinki, Porto Digital,
and Nationaal Dataportaal Wegverkeer (NDW), and **co-funded by the European
Union**. Released under the repository's [MIT License](../../LICENSE).
