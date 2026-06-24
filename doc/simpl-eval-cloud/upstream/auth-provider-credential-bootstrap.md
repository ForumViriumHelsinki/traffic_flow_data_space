# auth-provider credential bootstrap — research

**Date:** 2026-04-28
**Trigger:** tier2-proxy blocked by 404 from `GET /tier1/v2/credentials/active` against `authentication-provider:8080` — auth-provider has no active credential in its DB.
**Related:** internal tier2 cascade umbrella issue; a Spring `appConfig.client.authority.url` binding fix that made auth-provider Healthy.

## TL;DR

**Conclusion: 1. Manual procedure documented.** The upstream chart does NOT issue a credential. Credential bootstrap is an operator-run, post-deploy step that must be performed once after Wave 9 (governance services) come up Healthy. Two equivalent procedures exist:

- **Option A — REST/curl walkthrough**, documented in `iaa/documentation` 2.9.x README (six-call sequence via port-forward).
- **Option B — `simpl-cli` Kubernetes Job** (chart `simpl-cli@2.2.1` from `iaa/cli`) wired to `initAuthority.enabled: true` with Keycloak admin creds.

FVH's deploy is silent on this step. The fix is to codify Option B as a Wave-10 ApplicationSet entry (or run Option A once and document the dataspace identity).

## What was searched

- `code.europa.eu/simpl/simpl-open/development/iaa/authentication-provider` — chart `2.8.0` pulled and unpacked
- `code.europa.eu/simpl/simpl-open/development/iaa/tier2-proxy` — chart `1.2.1` pulled and unpacked
- `code.europa.eu/simpl/simpl-open/development/agents/governance-authority.git` — umbrella ref `v3.0.4` cloned
- `code.europa.eu/simpl/simpl-open/development/iaa/cli.git` — `v2.2.1` cloned (the `simpl-cli` Java tool + chart)
- `code.europa.eu/simpl/simpl-open/development/iaa/documentation.git` — `versioned_docs/2.9.x/README.md` (matches the deployment-guide pointer)
- FVH side: `argocd/applicationsets/simpl-eval/apps/{authentication-provider,tier2-proxy}.yaml`, `argocd/applicationsets/simpl-eval/applicationset.yaml`, and the SIMPL-Open deployment docs

## What the chart does (or does not) do

### `authentication-provider@2.8.0`

Chart contents (`/tmp/auth-research/authentication-provider/templates/`):

| File | Purpose | Touches credentials? |
|---|---|---|
| `deployment.yaml` | Renders the auth-provider Deployment | No |
| `configmap.yaml` | Renders `application.yml` from `appConfig` | No |
| `db-cipher-secret-job.yaml` | Pre-install Job: generates AES key in `authenticationprovider-db-cipher-secret` if absent | No (this is the DB-encryption key, NOT a participant credential) |
| `db-cipher-secret-{rb,sa,role}.yaml` | RBAC for the cipher-secret Job | No |
| `service.yaml`, `serviceaccount.yaml`, `hpa.yaml`, `NOTES.txt`, `_helpers.tpl` | Standard | No |

There is **no** Job, post-install hook, init container, or admin endpoint in the chart that writes a participant credential to the DB. `values.yaml` has no `bootstrap.*` / `credentials.*` / `initCredential.*` keys.

### `tier2-proxy@1.2.1`

`templates/deployment.yaml:37-79` defines an init container that polls `GET ${SIMPL_AUTHENTICATION_PROVIDER_BASEURL}/tier1/v2/credentials/active` and waits forever for HTTP 200 (line 70). The check is gated by `.Values.initContainers.checkAuthProvider.checkCredentialPresence.enabled` (default **`true`**, `values.yaml:115`). This is the exact spot tier2-proxy hangs in our cluster — auth-provider responds, but the endpoint returns 404 because the DB has no credential row.

Snippet (`templates/deployment.yaml:48-76`):

```yaml
- name: CREDENTIAL_CHECK_URL
  value: "{{ tpl .Values.authenticationProviderUrl . }}/tier1/v2/credentials/active"
...
until (
  http_response_code="$(curl -qs $CREDENTIAL_CHECK_URL -o /dev/null -w "%{response_code}")"
  [[ "$http_response_code" == "200" ]]
  ); do
  echo "Waiting credential installation"
  sleep 10
done
echo "Credential is installed."
```

### `governance-authority` umbrella (`v3.0.4`)

`charts/templates/{application,import-ttl,secret-manager-role}.yaml` plus `app-values/auth-provider/values.yaml` (16 lines). No init Job. No `simpl-cli` dependency in `Chart.yaml`. The umbrella's `documents/deployment-guide/README.md:163-172` explicitly defers initialization:

> ### Initialization
>
> After the deployment process is complete, a manual initialization process of the authority is required.
>
> The steps are described in the document:
> https://code.europa.eu/simpl/simpl-open/development/iaa/documentation/-/tree/main/versioned_docs/2.9.x#governance-authority-init-via-apis
>
> ### Tier2-proxy status
>
> Please keep in mind that until the agent is properly initialized, the tier2-proxy component will not work properly.

So the umbrella explicitly off-loads credential bootstrap to a separate, manual operator step and acknowledges that tier2-proxy will not work until it runs.

### `simpl-cli@2.2.1`

Separate Helm chart (`/iaa/cli/charts/`) NOT pulled in by the governance-authority umbrella. Two Jobs:

- `init-authority-job.yaml` (gated by `initAuthority.enabled: true`)
- `init-participant-job.yaml` (gated by `initParticipant.enabled: true`)

The authority Job runs `/scripts/init-authority-bash.sh` (`src/main/resources/scripts/init-authority-bash.sh`), which on Job start:

1. Polls EJBCA, Keycloak, and the four governance microservices' liveness probes (line 200 retry loop)
2. Retrieves the Keycloak `cli` client secret from the `master` realm using admin credentials
3. Calls `agent keypair-gen` → `agent csr-gen` → `authority onboard-agent --ptype GOVERNANCE_AUTHORITY` → `authority upload-csr` → `authority download-pem` → `agent upload-cert`

Step 7 (`agent upload-cert`) is what writes the active credential row that `/tier1/v2/credentials/active` reads.

## What the upstream docs say (verbatim)

`iaa/documentation/versioned_docs/2.9.x/README.md:395-440` — REST procedure:

```bash
kubectl port-forward svc/authentication-provider 8080:8080
kubectl port-forward svc/identity-provider 8090:8080

export AUTHORITY_AUTH_PROVIDER=localhost:8080
export AUTHORITY_IDENTITY_PROVIDER=localhost:8090

# Generating keypair...
curl -X POST "$AUTHORITY_AUTH_PROVIDER/v1/keypairs/generate"

# Generating CSR...
curl -X POST "$AUTHORITY_AUTH_PROVIDER/v1/csr/generate" \
--header 'Content-Type: application/json' \
--data-raw '{
  "commonName": "<tier2 hostname>",
  "country": "<country>",
  "organization": "<organization name>",
  "organizationalUnit": "<organizational unit name>"
}' > csr.pem

# Creating Authority participant
PARTICIPANT_ID=$(curl -X POST "$AUTHORITY_IDENTITY_PROVIDER/v1/participants" \
--header 'Content-Type: application/json' \
--data-raw '{
  "organization": "<organization name>",
  "participantType": "GOVERNANCE_AUTHORITY"
}' | sed -E 's/^"(.*)"$/\1/')

# Uploading CSR ..
curl -X POST "$AUTHORITY_IDENTITY_PROVIDER/v1/participants/$PARTICIPANT_ID/csr" \
-F "csr=@csr.pem"

# Downloading credentials ...
curl "$AUTHORITY_IDENTITY_PROVIDER/v1/credentials/$PARTICIPANT_ID/download" \
-o cert.pem

# Uploading credentials ...
curl -X POST "$AUTHORITY_AUTH_PROVIDER/v1/credentials" \
-F "credential=@cert.pem"
```

`iaa/documentation/versioned_docs/2.9.x/README.md:442-448` — Job procedure:

> ### Governance Authority init via Kubernetes
>
> *Prerequisite*: make sure you have the latest Keycloak configuration with the `cli` client configured
>
> The authority initialization can be carried out in by deploying a kubernetes job as described in the SIMPL CLI [documentation](https://code.europa.eu/simpl/simpl-open/development/iaa/cli/-/tree/v2.2.1?#authority-initialization) in a fully automated way.

`simpl-cli/README.md:124-151` — example values for `initAuthority.enabled: true` (Keycloak realm/clientId/master credentials, CSR CN/O/OU/Country, microservice URLs).

## What FVH currently ships

- `argocd/applicationsets/simpl-eval/apps/authentication-provider.yaml` — sync wave 9, governance prefix, no post-install hook, no `simpl-cli` reference. The only Job in scope is the chart's own `authentication-provider-create-secret-*` (the AES cipher-secret Job; unrelated to participant credentials).
- `argocd/applicationsets/simpl-eval/apps/tier2-proxy.yaml` — sync wave 9, no override of `initContainers.checkAuthProvider.checkCredentialPresence.enabled`, so it defaults to `true` and waits for credential installation.
- `argocd/applicationsets/simpl-eval/applicationset.yaml` — 10 progressive waves; no wave 10/11 entry for a `simpl-cli`-style init Job.
- [`../architecture/portability-audit.md`](../architecture/portability-audit.md) lists 5 bootstrap preconditions but is **silent** on credential issuance — none of preconditions 1-5 covers it. This research closes that gap.

## Conclusion

**1. Manual procedure documented.** This is by design: the upstream chart deliberately defers credential issuance to an operator-controlled init step. There is no missing chart feature and no upstream bug — the umbrella's deployment guide explicitly tells the operator to run the init step separately, and acknowledges in writing that tier2-proxy will not work until they do.

What we are seeing in the cluster (tier2-proxy init container looping on 404) is the documented and expected state of a freshly-deployed Authority that hasn't been initialized yet. The Spring-binding fix was a prerequisite — it made auth-provider Healthy enough to *answer* `/tier1/v2/credentials/active`; the answer is just (correctly) 404 until a credential is uploaded.

The audit doc on main missed this because it focused on chart-level bootstrap (wave-ordered services, Cloud SQL, OpenBao, ExternalSecrets, EJBCA REST creds) and didn't trace tier2-proxy's runtime dependency on a populated `credentials` table.

## Recommendation

**Codify Option B (simpl-cli Job) as a wave-10 entry in the FVH ApplicationSet.** Rationale:

- Reproducible across re-deploys of `simpl-eval-governance` (e.g., DB recreation)
- No `kubectl port-forward` ceremony, no operator typing CN/O/OU/Country into a shell
- Already an upstream-supported Helm chart (`simpl-cli@2.2.1`), so we are not inventing a new abstraction
- Matches our existing pattern of declarative `argocd/applicationsets/simpl-eval/apps/*.yaml` entries

Open follow-up issues (one each, per `decision-defaults.md` PR strategy):

1. **`feat(simpl-eval): add wave-10 simpl-cli init-authority Job`** — add `apps/simpl-cli-init-authority.yaml` with `initAuthority.enabled: true`, set `csr.cn = tls.authority.governance.simpl-eval.tfds.io`, wire to the `cli` Keycloak client (Keycloak realm/clientId/clientSecret already exist for our governance Keycloak; verify the `cli` client has the master-realm grants the script needs).
2. **`docs(simpl-open): add credential bootstrap to portability audit preconditions`** — add a 6th bootstrap precondition to [`../architecture/portability-audit.md`](../architecture/portability-audit.md) describing the credential issuance step and pointing at this research doc and the upstream procedures.

If we want a one-shot **manual** unblock today (to verify the cascade beyond credential issuance) before landing the Job, run Option A inside a debug pod in `simpl-eval-governance`:

```bash
kubectl --context=<staging-project> -n simpl-eval-governance run cred-bootstrap \
  --rm -it --image=curlimages/curl:8.6.0 -- sh
# inside: run the 6 curl calls from the verbatim block above, replacing the
# localhost:port values with the in-cluster service DNS
# (authentication-provider:8080, identity-provider:8080) and supplying real
# CN/O/OU/Country values.
```

We do **not** recommend filing an upstream issue — the behavior is documented and intended. If anything, an issue would be a *FVH* one to add the precondition to our audit doc, which is what this PR is.
