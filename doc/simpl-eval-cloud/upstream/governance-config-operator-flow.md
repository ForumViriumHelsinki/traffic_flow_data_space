# Governance-Config Operator Flow — Findings & Upstream Divergences

Session log of executing the post-deploy governance configuration flow
(onboarding procedure template → applicant registration → NOTARY approval)
on the SIMPL-Eval cluster, 2026-06-10/11. Documents where our deployment and
the upstream SIMPL-Open documentation/components diverge, as candidate
upstream feedback.

Status legend: ✅ done · 🚧 blocked/pending · 📤 candidate upstream feedback

## Flow status

| Step | Status |
|---|---|
| Reset `e.j` / `m.t` passwords (Keycloak admin API) | ✅ |
| Authority-realm logins work at all (SPI config) | ✅ |
| Define Consumer onboarding procedure template as `e.j` in FE | ✅ (matches upstream manual exactly) |
| Verify via `just simpl-eval-onboarding-templates e.j` path | ✅ (HTTP 200, template listed) |
| Applicant registration (`/onboarding/application/request`) | ✅ user created |
| Applicant login → submit onboarding request | ✅ (submitted, IN REVIEW) |
| NOTARY (`m.t`) approval | ✅ **APPROVED** 2026-06-11 — full loop closed |

Residual cleanup: a second, orphaned IN PROGRESS onboarding request for
`eval.applicant1@example.com` exists (left by the first registration
attempt whose Keycloak user creation 401'd mid-transaction). Harmless;
reject it from the NOTARY view or leave it to expire (30 days).

## What broke, in order (each layer hid the next)

1. **All authority-realm logins returned 500** — the `attribute-authenticator`
   SPI (running in the realm's `Custom browser` / `Custom direct grant`
   flows) requires `AUTHENTICATION_PROVIDER_BASE_URL` and
   `USERS_ROLES_BASE_URL` on the Keycloak pod. Fixed by supplying the URLs
   and the `/tier1/v2` suffix plus a users-roles bump.
2. **Tokens lacked the `client-roles` claim → every governance API call
   403'd.** The claim chain is: SPI queries users-roles at login → sets
   `DS_ROLES` session note → `dsRoles` client scope maps it to the
   `client-roles` JWT claim → all backend services authorize *only* on that
   claim (`TierOneAuthInfoJwtPersister` reads `client-roles`, never
   `realm_access.roles`). users-roles 2.8.0 didn't serve the
   `/tier1/v2/users` API the SPI calls, so the lookup 404'd and the SPI
   "continued with a non-decorated session". Fixed by the 2.12.9 bump.
3. **users-roles 2.12.9 crash-looped twice at boot** — first on its
   Keycloak-admin-API Liquibase migration hitting the wrong Keycloak URL
   shape, then on missing `notification.role-requests.*` properties.
4. **Onboarding registration 400'd** (`Role SIMPL_USER must be present`) —
   onboarding 2.8.1 predates the users-roles 2.12.9 user-creation contract.
   Bumped to 2.12.8 with its required runtime config, plus a
   secret-value correction.
5. **Applicant login fails** — applicants are created in the `onboarding`
   realm (upstream's topology) but our monolithic FE can only point at one
   realm (`authority`). Fixed by the single-realm topology plus the
   dual-role-channel work below.
6. **Submit 500'd on first publish** — the onboarding submit emits a Kafka
   event, and the chart's *default* `kafkaConfig` producer block (invalid
   `<REPLACE_WITH_...>` placeholders) survived the Helm deep-merge under
   our override. Fixed by a producer-level pin + null-out. NB the
   state transition itself had already committed — the event publish is
   post-commit — so the request still reached IN REVIEW.

## Root cause pattern: component-set version skew

Almost everything above is one disease: our governance components were a mix
of 2.7.x/2.8.x while the realm exports + keycloak-authenticator SPI 2.7.1 we
deploy come from **upstream authority-iaa chart v1.2.23** (project 1402),
which pins a coherent 2.12.x set:

| Component | authority-iaa v1.2.23 | Ours (before) | Ours (after) |
|---|---|---|---|
| keycloak-authenticator SPI | 2.7.1 | 2.7.1 | 2.7.1 |
| users-roles | 2.12.9 | 2.8.0 | **2.12.9** |
| onboarding | 2.12.8 | 2.8.1 | **2.12.8** |
| authentication-provider | 2.12.4 | 2.8.1 | 2.8.1 (unchanged) |
| FE | fe-* micro-frontends 2.12.x / 2.9.x | simpl-fe 2.7.1 monolith | simpl-fe 2.7.1 (unchanged) |

The SIMPL-Open services version their **API contracts together** (tier1/v2
endpoints, role-validation rules, JWT claim expectations). Mixing minor
versions across services is not safe even within the same major. When
bumping any one governance component, derive the *whole set* from the
authority-iaa chart release that matches the realm exports:

```sh
just simpl-eval-chart-fetch 1402 authority-iaa <version>
grep -B2 -A4 'targetRevision' /tmp/simpl-charts/authority-iaa-<version>/authority-iaa/values.yaml
```

## Candidate upstream feedback 📤

> **Filed upstream 2026-06-11** — each item was re-verified against upstream
> HEAD and deduplicated against the public trackers before filing; per-item
> links below. This was filing wave 1; wave 2 (same day) covered the older
> candidates from `upstream-feedback.md` and the portability audit. The
> filing log for both waves is tracked internally.

1. **keycloak-authenticator deployment guide omits the `/tier1/v2` path
   suffix.** Project 915 `documents/deployment-guide/README.md` shows
   `USERS_ROLES_BASE_URL: http://users-roles.<ns>...:8080` (no path), but
   the SPI's generated clients append only the operation path (`/users`),
   and upstream's own authority-iaa chart sets both URLs **with**
   `/tier1/v2`. Following the repo's own guide yields 404s on every login.
   → Filed: [keycloak-authenticator#2](https://code.europa.eu/simpl/simpl-open/development/iaa/keycloak-authenticator/-/work_items/2)
2. **Copy-paste bug in the SPI's `application.conf`** (project 915,
   `src/main/resources/application.conf`):
   `participantId.userSessionNote = ${?CREDENTIAL_ID_USER_SESSION_NOTE}` —
   the `CREDENTIAL_ID_USER_SESSION_NOTE` env var overrides
   **participantId**'s session note instead of credentialId's (the
   `credentialId.userSessionNote` key has no env override at all).
   → Filed: [keycloak-authenticator#3](https://code.europa.eu/simpl/simpl-open/development/iaa/keycloak-authenticator/-/work_items/3)
3. **Malformed log format strings in the SPI** crash logging via
   `UnknownFormatConversionException: Conversion = '%'` —
   `CredentialAdapterFactory.java:35` (`"...provider url %"` should be
   `%s`), and `getOptionalProperty` in
   `AuthenticatorConfigurationFactory.java` (`"Value for property % not
   found"`). Masks the very diagnostics the operator needs.
   → Filed: [keycloak-authenticator#4](https://code.europa.eu/simpl/simpl-open/development/iaa/keycloak-authenticator/-/work_items/4)
   (verification found a third site, included in the report)
4. **Published images cannot boot from chart defaults alone.** users-roles
   ≥2.12 (`notification.role-requests.*`) and onboarding ≥2.12
   (`email-service.*`, `keycloak.*`) validate `@NotNull` properties whose
   classpath defaults are unsubstituted `[TOKEN]` placeholders. The Helm
   charts ship **no** values for them — they exist only as inline `values:`
   in the authority-iaa wrapper chart. A chart-only consumer (`helm install
   users-roles/onboarding` per the component READMEs) crash-loops.
   → Filed: [authority-iaa#4](https://code.europa.eu/simpl/simpl-open/development/iaa/agent-iaa/authority-iaa/-/work_items/4)
   (also reports two by-catches: onboarding's `notary-url-template` reusing
   the APPLICANT placeholder token, and users-roles' hardcoded dev-URL
   classpath default)
5. **users-roles 2.12.x boot-time Liquibase migration hard-depends on the
   Keycloak admin API** (`RolePersistenceSchemaMigration` →
   `keycloak.url`). Misconfigure the URL and the pod crash-loops with an
   opaque `HTTP 404 Not Found` from deep inside resteasy. A connectivity
   precheck or clearer error would save operators hours.
   → Filed: [users-roles#1](https://code.europa.eu/simpl/simpl-open/development/iaa/users-roles/-/work_items/1)
   (covers both migration classes — `SyncUsersSchemaMigration` shares the pattern)
6. **`simpl.kafka.topic.prefix` placement is inconsistent** — the
   authority-iaa template writes it as a *top-level* Helm value sibling of
   `kafkaConfig`, but the charts only render `.Values.kafkaConfig` (and
   `.Values.appConfig`) into the Spring config. The top-level `simpl:` block
   appears to be dead in upstream's own deploys; the working placement is
   nested inside `kafkaConfig`.
   → Filed: [authority-iaa#5](https://code.europa.eu/simpl/simpl-open/development/iaa/agent-iaa/authority-iaa/-/work_items/5)
   (verification found upstream had already fixed the users-roles /
   tier2-gateway / auth-provider blocks — only the onboarding block remains)
7. **Invalid placeholder strings shipped as chart defaults.** The
   onboarding chart's default `kafkaConfig` carries
   `<REPLACE_WITH_SECURITY_PROTOCOL>` / `<REPLACE_WITH_JAAS_CONFIG>` etc.
   as *live default values*. Helm deep-merges defaults under any user
   override, so unless the override shadows **every** placeholder key
   exactly, the broken values silently survive and the producer fails at
   first publish (after boot — invisible to readiness probes). Defaults
   should be absent/empty, not invalid sentinels.
   → Filed: [onboarding#1](https://code.europa.eu/simpl/simpl-open/development/iaa/onboarding/-/work_items/1)
8. **The user manual's onboarding flows match the FE exactly** — the
   procedure-template flow (tabs per participant type, "Define onboarding
   procedure template", description + expiration only), the applicant
   registration/submission flow, and the NOTARY approve/reject/revision
   detail view all behave as documented. Positive signal; no divergence
   found in the UI flows themselves.
   → Not filed (positive finding, nothing to report).

## Local divergences (ours, documented, not upstream bugs)

- **Single-host topology**: upstream splits FE (`authority.fe.*`) and API
  (`authority.be.*`) hosts; we serve the FE at `simpl.simpl-eval.tfds.io`
  and APIs/Keycloak at `governance.simpl-eval.tfds.io` via the
  tier1-gateway `/auth` route.
- **No Vault webhook**: upstream injects secrets via banzaicloud
  vault-env (`vault:...` annotations); we inline the upstream-published
  eval credentials from the vendored realm exports (gitleaks-allowlisted)
  and use Cloud SQL IAM for databases.
- **PLAINTEXT Kafka** (vs upstream SASL_PLAINTEXT) — see
  `apps/kafka.yaml`; client configs must say `security.protocol:
  PLAINTEXT`.
- **`notification.role-requests.*` / `email-service.*` URLs** point at our
  FE host; only used as links inside notification emails (mailpit).

## Applicant realm topology (open decision)

Upstream (authority-iaa v1.2.23):
- applicants live in the **`onboarding` realm**; governance staff in
  `authority`.
- the **fe-onboarding micro-frontend** gets `KEYCLOAK_REALM=onboarding`
  while every other FE module gets `authority`.
- the **tier1-gateway** carries a dual JWT config:
  `jwt-configuration.primary.realm=authority`,
  `jwt-configuration.applicant.realm=onboarding`.

Our simpl-fe 2.7.1 monolith renders **one shared env** for all
micro-frontend deployments (`KEYCLOAK_REALM=authority`), so the
upstream-faithful split-realm topology is unreachable until the fe-*
micro-frontend migration. The pragmatic eval fix is a **single-realm topology**:

1. ✅ `onboarding-sa` service-account client created in the **authority**
   realm (same vendored secret) with realm-management roles
   `manage-users`, `view-users`, `query-users` — executed live by the
   operator 2026-06-11 via the Keycloak admin API (client id
   `c2795488-f0b0-4d33-b321-41fa9eda7ef7`).
2. ✅ Onboarding service `keycloak.realm` flipped to `authority`
   (`apps/onboarding.yaml` appConfig) so applicants are created where the
   FE can log them in.
3. ✅ Client + service-account user mirrored into
   `data/keycloak/authority.json` so future realm re-imports
   (`--import-realm` only applies to *new* realms) reproduce the live
   state.

Revert all three when the fe-* micro-frontends land.

### Two parallel role systems (FE vs backend)

Working the applicant flow exposed that SIMPL-Open authorizes on **two
independent role channels**, and the single-realm topology must satisfy
both:

| Consumer | Reads roles from | Populated by |
|---|---|---|
| Backend services (onboarding, users-roles, …) | `client-roles` JWT claim | attribute-authenticator SPI → users-roles service → `DS_ROLES` session note → `dsRoles` scope mapper |
| FE route guards (`canActivateAuthRole`, keycloak-angular `getUserRoles()`) | `realm_access.roles` (+ `resource_access`) | Keycloak realm role assignments |

In upstream's split topology these align invisibly: the onboarding realm
gives every user the `APPLICANT` **realm role** via the
`default-roles-onboarding` composite *and* maps realm roles into
`client-roles` via a realm-role mapper on `frontend-cli`; the authority
realm seeds staff realm roles (`T2IAA_M`, `NOTARY`, …) that mirror their
users-roles DB rows. Neither half is documented as a contract.

Single-realm consequences (both executed for the eval):

1. **users-roles row + roles** — the V1 unauthenticated registration does
   NOT create a users-roles row; users-roles 2.12.9 auto-creates one (with
   empty roles) at the user's first login. Assign roles via
   `PUT /v1/users/{userId}/roles` with body `["SIMPL_USER","APPLICANT"]`
   (the API rejects any assignment that omits `SIMPL_USER`, and takes role
   *names*, not ids). NB `{userId}` is users-roles' **own internal UUID**,
   not the Keycloak user id (the Keycloak id 404s) — look it up via
   `GET /v1/users` or `GET /tier1/v2/users?email=…` first. Done for a first
   applicant user via port-forward; repeated for a second applicant user 2026-06-11 (procedure now
   captured in our internal operations runbook → "Applicant onboarding flow").
2. **APPLICANT realm role** — added to the authority realm's
   `default-roles-authority` composite (mirroring upstream's
   `default-roles-onboarding` mechanism), so the FE guard passes for
   applicants without per-user grants. Executed live 2026-06-11 (the role
   itself already existed in the live realm — create returned 409; only
   the composite membership was new). NB: this also gives staff users the
   APPLICANT realm role — harmless for the eval (guards are
   any-role-matches; backend authorization is unaffected since it reads
   client-roles). Mirrored into `authority.json`.

Until the fe-* micro-frontends land, step 1 is a **per-applicant operator
step** (no automation assigns users-roles roles to self-registered applicants
in this topology).

## Operator credentials state (eval)

- `e.j` (T2IAA_M) and `m.t` (NOTARY) passwords were reset 2026-06-10 via
  the Keycloak admin API (`just simpl-eval-keycloak-set-password`
  equivalent); values were handed over out-of-band in the session that
  performed the reset. Reset again at will — the seeded users ship only
  hashes.
- Consumer onboarding procedure template exists (30 days expiration, no
  documents/rules — minimal eval template).
- A test applicant (`eval.applicant1@example.com`, demo organisation,
  Consumer) was created in the **onboarding** realm during the blocked
  flow; expect to recreate or migrate it after the realm decision.
