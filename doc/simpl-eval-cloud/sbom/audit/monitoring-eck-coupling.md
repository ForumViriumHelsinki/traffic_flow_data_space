# Audit: Monitoring & ECK Coupling

**Question:** Are any deployed apps unconditionally referencing ECK CRDs (`*.k8s.elastic.co`)? What does enabling `monitoring.enabled` in the umbrella drag in (Prometheus and/or ECK)?

**Inputs:**
- `docs/simpl-open/sbom/charts.yaml` (refreshed v3.0.x state)
- `argocd/applicationsets/simpl-eval/apps/*.yaml`
- Upstream `governance-authority@v3.0.4/charts/values.yaml`
- Upstream `common_components@v3.0.2/charts/values.yaml`

## Per-Chart Yes/No Table

Scope (BROAD): each cell is "yes" if the chart's `templates/` directory contains a manifest that references the kind family. `prometheus_refs` = `monitoring.coreos.com/*` (ServiceMonitor, PodMonitor, PrometheusRule). `eck_refs` = `*.k8s.elastic.co` (Elasticsearch, Kibana, ApmServer, Beat, Logstash).

| Chart | Deployed | Prometheus refs? | ECK refs? | Default-on? | Evidence |
|-------|----------|------------------|-----------|-------------|----------|
| poc-charts (adapter) | yes | no | no | n/a | `charts.yaml:67-69`, GitLab tree shows 4 templates (Deployment/Ingress/Service/SA) |
| authentication-provider | yes | no | no | n/a | `charts.yaml:101-103` |
| fc-service (xsfc-catalogue) | yes | no | no | n/a | `charts.yaml:128-130` |
| tier1-gateway | yes | no | no | n/a | `charts.yaml:145-147` |
| tier2-proxy | yes | no | no | n/a | `charts.yaml:159-161` |
| openbao-config | yes | no | no | n/a | `charts.yaml:175-177` |
| onboarding | yes | no | no | n/a | `charts.yaml:192-194` |
| simpl-fe (frontend) | yes | no | no | n/a | `charts.yaml:215-217` |
| identity-provider | yes | no | no | n/a | `charts.yaml:236-238` |
| infrastructure-consumption-monitoring-service (icm) | yes | no | no | n/a | `charts.yaml:256-258` — name is misleading; emits ConfigMap/Deployment/Service/SA only |
| simpl-notification-service (notification) | yes | no | no | n/a | `charts.yaml:273-275` |
| security-attributes-provider (sap) | yes | no | no | n/a | `charts.yaml:289-291` |
| tier2-gateway | yes | no | no | n/a | `charts.yaml:305-307` |
| simpl-schema-manager-charts | yes | no | no | n/a | `charts.yaml:321-323` |
| users-roles | yes | no | no | n/a | `charts.yaml:337-339` |
| kafka (SIMPL 976) | yes | no | no | n/a | `charts.yaml:353-355` — emits Confluent CRs (`platform.confluent.io/v1beta1`), not ECK |
| confluent-for-kubernetes | yes | no (off by default) | no | gated | `charts.yaml:494-498` — `prometheusRule.create: false`, `serviceMonitor: false` |
| ejbca-community-helm | yes | no | no | n/a | `charts.yaml:516-519` |
| keycloakx | yes | optional | no | gated off | `charts.yaml:530-540` — `templates/servicemonitor.yaml` gated by `metrics.enabled=false` |
| openbao | yes | optional | no | gated off | `charts.yaml:550-560` — gated by `serverTelemetry.{serviceMonitor,prometheusRules}.enabled=false` |
| vault-secrets-webhook | yes | no | no | n/a | `charts.yaml:570-573` — `metrics.serviceMonitor.enabled` default false |
| console (redpanda-console) | yes | optional | no | gated off | `charts.yaml:586-588` — gated by `serviceMonitor.enabled=false` |
| mailpit | yes | no | no | n/a | `charts.yaml:603-605` |
| redis (bitnami) | yes | optional | no | gated off | `charts.yaml:619-625` — gated by `metrics.{enabled,serviceMonitor.enabled,prometheusRule.enabled}=false` |
| pgadmin4 | yes | no | no | n/a | `charts.yaml:643-645` |
| **eck-monitoring** | **NO** (FVH) | no | **YES — unconditional** | gated by `monitoring.enabled` in cc umbrella | `charts.yaml:381-410` — emits Elasticsearch, Kibana, ApmServer, Beat, Logstash, OTel Collector |
| eck-operator | NO (FVH) | no | no | n/a | operator chart, defines kinds rather than emitting them. `charts.yaml:723` |
| eck-operator-crds | NO (FVH) | no | no | n/a | CRD-only chart. `charts.yaml:743` |
| postgres-operator | NO (FVH) | no | no | n/a | `charts.yaml:704-706` |
| pg-cluster | NO (FVH) | no | no | n/a | `charts.yaml:359-361` |
| openbao-init | NO (FVH) | no | no | n/a | `charts.yaml:375-377` |
| redis-commander | NO (FVH, disabled upstream) | no | no | n/a | `charts.yaml:763-765` |
| fe-* (5 new v3.0.x charts) | NO (FVH) | no | no | n/a | `charts.yaml:419-498` — all emit basic web kinds |
| schema-manager-ui | NO (FVH) | no | no | n/a | `charts.yaml:511-513` |
| **cloudsql-proxy (FVH)** | yes | no | no | n/a | `helm/cloudsql-proxy/templates/` |
| **simpl-eval-bridge-secrets (FVH)** | yes | no | no | n/a | `helm/simpl-eval-bridge-secrets/templates/secret.yaml` only emits Secret |

**Conclusion 1: ZERO deployed apps unconditionally reference ECK CRDs.** Only `eck-monitoring` does, and it is NOT deployed (`charts.yaml:367` `deployed: false`).

**Conclusion 2: ZERO deployed apps unconditionally emit Prometheus Operator resources.** Six charts (`keycloakx`, `openbao`, `vault-secrets-webhook`, `console`, `redis`, `confluent-for-kubernetes`) ship optional ServiceMonitor/PrometheusRule templates, but ALL of them default to `enabled: false` and FVH does not flip them on in any `valuesObject`.

## What `monitoring.enabled` Drags In

Tracing from upstream values:

### `common_components@v3.0.2/charts/values.yaml` lines 54-66
```yaml
monitoring:
  enabled: true                              # <- default ON in upstream
  operator:
    repo_URL: https://helm.elastic.co/
    chart_name: eck-operator                 # <- ECK operator
    crds_chart_name: eck-operator-crds       # <- ECK CRDs
    targetRevision: "3.0.0"
  projectID: "828"
  targetRevision: 0.3.3
  chart_name: eck-monitoring                 # <- ECK consumer chart
```

When `monitoring.enabled=true`, the umbrella renders THREE Application CRs:
1. **eck-operator** (helm.elastic.co/eck-operator 3.0.0) — operator workloads, no Elastic data plane.
2. **eck-operator-crds** (helm.elastic.co/eck-operator-crds 3.0.0) — installs `*.k8s.elastic.co` CRDs cluster-wide.
3. **eck-monitoring** (SIMPL 828, 0.3.3) — emits 10 Elastic CRs (Elasticsearch, Kibana, ApmServer, 3 Beats, 3 Logstash variants, OTel Collector).

### `governance-authority@v3.0.4/charts/values.yaml` lines 315-319
```yaml
monitoring:
  enabled: true
  projectID: "828"
  targetRevision: 0.3.1
  chart_name: eck-monitoring
```

Authority side ALSO renders an `eck-monitoring` Application (older version 0.3.1) when its `monitoring.enabled` is on.

### Critical finding: monitoring.enabled drags in **ECK only, NOT Prometheus**

The umbrella's `monitoring.enabled` toggle is *exclusively* about the Elastic Cloud Operator. There is no Prometheus Operator chart in either v3.0.x umbrella's value tree. The third-party charts (openbao, redis, etc.) that ship optional Prometheus templates are not gated by the umbrella's monitoring flag — they're gated by their own chart-local toggles, which are off by default.

## What FVH Does

FVH does not include ANY of `eck-operator`, `eck-operator-crds`, or `eck-monitoring` in `argocd/applicationsets/simpl-eval/apps/`. The FVH ApplicationSet bypasses the umbrella entirely (`charts.yaml:786-789` notes), so the upstream `monitoring.enabled=true` default never executes — the umbrella's Application CRs are never rendered.

Confirmed by:
```
$ ls argocd/applicationsets/simpl-eval/apps/ | grep -E 'eck|monitor'
icm.yaml             # infrastructure-consumption-monitoring-service (NOT ECK)
```

The only "monitoring"-named app is `icm` (a SIMPL business service for IDS data-space resource consumption tracking) — confirmed by `charts.yaml:265` notes "does NOT emit Prometheus or ServiceMonitor resources."

## Answer

- **Deployed apps unconditionally referencing ECK CRDs:** ZERO.
- **Enabling `monitoring.enabled` in the umbrella drags in:** ECK operator + ECK CRDs + eck-monitoring (which emits Elasticsearch, Kibana, ApmServer, Beats, Logstash, OTel Collector). It does NOT drag in any Prometheus Operator resources.
- **Recommendation:** monitoring can be permanently dropped without breaking any deployed component. The umbrella's `monitoring.enabled=true` upstream default is irrelevant because FVH bypasses the umbrella. No FVH Application uses the ECK CRDs as input.
