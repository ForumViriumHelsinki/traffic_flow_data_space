#!/usr/bin/env bash
#
# simpl_chart_tools.sh — discover, fetch, and diff SIMPL-Open Helm charts
# published to the European Commission's public GitLab Helm registry
# (code.europa.eu). Deployment-agnostic: it talks only to the public
# upstream registry and makes no assumptions about your cluster, cloud, or
# environment, so it is useful whether you deploy SIMPL-Open on k3s or on a
# managed-cloud Kubernetes.
#
# Commands:
#   versions <project_id> [filter]          List stable chart versions
#   fetch    <project_id> <chart> <version> [dest]   Download + extract a chart
#   diff     <project_id> <chart> <v1> <v2> Diff two chart versions
#
# A SIMPL-Open component is a GitLab *project* on code.europa.eu, addressed by
# its numeric project ID. Find a component's ID on its project page at
# https://code.europa.eu/simpl/simpl-open (Settings → General, or the number
# under the project name). Commonly used IDs:
#
#   902  governance-authority (umbrella)
#   951  common_components (umbrella)
#   913  identity-provider
#   939  authentication-provider
#   771  users-roles
#   861  security-attributes-provider (sap)
#
# Requires: bash 4+, curl, yq (mikefarah/yq v4+), tar.
#
# Examples:
#   ./simpl_chart_tools.sh versions 913
#   ./simpl_chart_tools.sh versions 913 2.11
#   ./simpl_chart_tools.sh fetch 913 identity-provider 2.11.4
#   ./simpl_chart_tools.sh diff 913 identity-provider 2.11.3 2.11.4

set -euo pipefail

API_BASE="https://code.europa.eu/api/v4/projects"

die() { echo "error: $*" >&2; exit 1; }

require() {
    for c in "$@"; do
        command -v "$c" >/dev/null 2>&1 || die "missing required tool: $c"
    done
}

usage() {
    sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

# List stable chart versions from a project's Helm registry index.
# Filters out SNAPSHOT / -rc. / latest / hotfix pre-release tags.
cmd_versions() {
    local project_id="${1:-}" filter="${2:-}"
    [[ -n "$project_id" ]] || die "usage: versions <project_id> [filter]"
    require curl yq
    local url="${API_BASE}/${project_id}/packages/helm/stable/index.yaml"
    local versions
    # .entries[].[].version only; nested dependency versions are not captured.
    versions=$(curl -fsSL "$url" \
        | yq '.entries[][].version' \
        | grep -Ev 'SNAPSHOT|-rc\.|latest|hotfix' \
        | sort -V \
        | uniq) || die "could not fetch chart index for project ${project_id}"
    if [[ -n "$filter" ]]; then
        echo "$versions" | grep -F "$filter" || true
    else
        echo "$versions"
    fi
}

# Download and extract a chart tarball to <dest>/<chart>-<version>/<chart>/.
# Atomic + idempotent: a previously extracted chart is reused; a partial
# extraction can never satisfy the idempotency check. Prints the chart dir.
cmd_fetch() {
    local project_id="${1:-}" chart="${2:-}" version="${3:-}" dest="${4:-/tmp/simpl-charts}"
    [[ -n "$project_id" && -n "$chart" && -n "$version" ]] \
        || die "usage: fetch <project_id> <chart> <version> [dest]"
    require curl tar
    local dest_dir="${dest}/${chart}-${version}"
    local chart_dir="${dest_dir}/${chart}"
    if [[ -d "$chart_dir" ]]; then
        echo "$chart_dir"
        return 0
    fi
    mkdir -p "$dest"
    local url="${API_BASE}/${project_id}/packages/helm/stable/charts/${chart}-${version}.tgz"
    echo "fetching ${url}..." >&2
    # Extract in a subshell so its cleanup trap is scoped to the subshell
    # (a function-level RETURN/EXIT trap would leak the temp-dir variable into
    # later returns). Move into place only on success, so a partial extraction
    # can never satisfy the idempotency check above.
    (
        set -euo pipefail
        work_dir=$(mktemp -d -p "$dest")
        trap 'rm -rf "$work_dir"' EXIT
        curl -fsSL "$url" | tar -xz -C "$work_dir"
        mkdir -p "$dest_dir"
        mv "${work_dir}/${chart}" "$chart_dir"
    ) || die "could not fetch/extract ${chart} ${version}"
    echo "$chart_dir"
}

# Fetch two versions of a chart and recursively diff their extracted trees.
cmd_diff() {
    local project_id="${1:-}" chart="${2:-}" v1="${3:-}" v2="${4:-}"
    [[ -n "$project_id" && -n "$chart" && -n "$v1" && -n "$v2" ]] \
        || die "usage: diff <project_id> <chart> <v1> <v2>"
    local dir1 dir2
    dir1=$(cmd_fetch "$project_id" "$chart" "$v1")
    dir2=$(cmd_fetch "$project_id" "$chart" "$v2")
    echo "diffing ${dir1} vs ${dir2}" >&2
    diff -r "$dir1" "$dir2" || true
}

main() {
    local cmd="${1:-}"
    [[ -n "$cmd" ]] || usage 1
    shift
    case "$cmd" in
        versions) cmd_versions "$@" ;;
        fetch)    cmd_fetch "$@" ;;
        diff)     cmd_diff "$@" ;;
        -h|--help|help) usage 0 ;;
        *) die "unknown command: ${cmd} (try: versions | fetch | diff | --help)" ;;
    esac
}

main "$@"
