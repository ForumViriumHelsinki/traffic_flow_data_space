# SIMPL-Open Chart Tools

A small, deployment-agnostic helper for working with SIMPL-Open Helm charts
published to the European Commission's public GitLab Helm registry on
[code.europa.eu](https://code.europa.eu/simpl/simpl-open). It talks **only** to
the public upstream registry — it makes no assumptions about your cluster,
cloud, or environment — so it is equally useful for the
[k3s](../../doc/SIMPL-k3s/) and the
[managed-cloud](../../doc/simpl-eval-cloud/) deployment paths.

It is handy for **version discovery and upgrade planning**: see which stable
chart versions exist for a component, pull a chart locally, and diff two
versions before bumping.

## Requirements

`bash` 4+, `curl`, [`yq`](https://github.com/mikefarah/yq) (mikefarah v4+), `tar`.

## Usage

```
./simpl_chart_tools.sh versions <project_id> [filter]
./simpl_chart_tools.sh fetch    <project_id> <chart> <version> [dest]
./simpl_chart_tools.sh diff     <project_id> <chart> <v1> <v2>
```

| Command | Purpose |
|---|---|
| `versions` | List stable chart versions for a component (filters out SNAPSHOT / `-rc.` / `latest` / `hotfix` pre-releases). Optional substring `filter`. |
| `fetch` | Download and extract a chart tarball to `<dest>/<chart>-<version>/<chart>/` (atomic + idempotent). Prints the chart directory. Default `dest` is `/tmp/simpl-charts`. |
| `diff` | Fetch two versions and recursively `diff -r` their extracted trees. |

## Project IDs

A SIMPL-Open component is a GitLab **project** on code.europa.eu, addressed by
its numeric project ID. Find a component's ID on its project page (the number
under the project name, or Settings → General). Commonly used IDs:

| ID | Component |
|---|---|
| `902` | governance-authority (umbrella) |
| `951` | common_components (umbrella) |
| `913` | identity-provider |
| `939` | authentication-provider |
| `771` | users-roles |
| `861` | security-attributes-provider (sap) |

## Examples

```
# Which stable versions of identity-provider are published?
./simpl_chart_tools.sh versions 913

# Narrow to the 2.11 line
./simpl_chart_tools.sh versions 913 2.11

# Pull a specific chart locally
./simpl_chart_tools.sh fetch 913 identity-provider 2.11.4

# See what changed between two versions before upgrading
./simpl_chart_tools.sh diff 913 identity-provider 2.11.3 2.11.4
```

---

Part of the **Traffic Flow Data Space (TFDS)** project, **co-funded by the
European Union**. Released under the repository's [MIT License](../../LICENSE).
