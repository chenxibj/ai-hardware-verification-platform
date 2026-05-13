# Code Review Report — AHVP Commits (2026-05-11~13)

**Reviewer:** 菜菜子 (AI Code Reviewer)  
**Date:** 2026-05-13  
**Scope:** 3 commits on `main` branch

---

## Commit 1: `e8678302` — security: remove hardcoded AGENT_TOKEN default value

### Summary
- Removes the hardcoded default `ahvp-agent-secret-2026` from `application.yml`, `TaskDispatcher.java`, and test code
- Adds `@PostConstruct` validation in `AgentTokenFilter` to warn when token is unconfigured
- Cleans up `V1__baseline.sql`: removes `\restrict`/`\unrestrict` commands and `flyway_schema_history` table/index DDL from the baseline dump

### Findings

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **🔴 P0** | `agent/config.yaml` | **Hardcoded token `ahvp-agent-secret-2026` still present!** Line 13: `token: ahvp-agent-secret-2026`. This commit only cleaned the backend Java/YAML side. The Python agent still has the hardcoded secret in its config file, which is checked into Git. This **defeats the purpose** of the security fix — the secret is still in the repo history AND current HEAD. |
| 2 | **🟡 P1** | `.env.example` | Missing `AGENT_TOKEN=` entry. The commit adds `AGENT_TOKEN: ${AGENT_TOKEN}` to `docker-compose.yml` (in commit 2), but `.env.example` has no `AGENT_TOKEN` placeholder. New deployers won't know they need to set it. |
| 3 | **🟢 P2** | `AgentTokenFilter.java` | The `@PostConstruct` validation only `log.warn`s when token is empty. Consider failing fast (`throw`) or at least marking the application "unhealthy" via actuator. With empty token, **all** agent requests are rejected silently at runtime, which is secure but operationally confusing (agents get 401 with no deployment-time signal beyond a log warning that scrolls away). |
| 4 | **🟢 P2** | `AgentTokenFilterTest.java` | Good: test token changed to `test-agent-token-for-unit-tests` — clearly a test-only value. No issue. |
| 5 | **🟢 P2** | `V1__baseline.sql` | Removing `\restrict`/`\unrestrict` and `flyway_schema_history` DDL from the baseline is correct — Flyway manages its own schema history table, and `\restrict`/`\unrestrict` are `pg_dump` artifacts that break Flyway's SQL parser. Good cleanup. |

### Verdict: ⚠️ Incomplete — P0 agent/config.yaml hardcoded token must be addressed.

---

## Commit 2: `39302289` — fix: init.sql syntax error (missing comma) + disable Flyway validate on migrate

### Summary
- Fixes 2 syntax errors in `deploy/init.sql`:
  1. Missing comma after `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` (before `plan_id`)
  2. Unquoted string values in CHECK constraint: `IN (OPERATOR, MODEL)` → `IN ('OPERATOR', 'MODEL')`
- Adds Docker Compose environment variables: `SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false`, `SPRING_FLYWAY_CLEAN_DISABLED=true`, `AGENT_TOKEN=${AGENT_TOKEN}`

### Findings

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **🟡 P1** | `docker-compose.yml` | `SPRING_FLYWAY_VALIDATE_ON_MIGRATE: "false"` — Disabling validate-on-migrate is a common transitional workaround when bootstrapping Flyway on an existing DB, but it should be **temporary**. If left permanently, schema drift between migration scripts and actual DB will go undetected. **Recommendation:** Add a TODO/comment with a timeline to re-enable, or remove after the baseline migration has been applied to all environments. |
| 2 | **🟡 P1** | `application.yml` (overall state) | **Duplicate `spring.flyway` block!** After all 3 commits are applied, `application.yml` has TWO `spring.flyway:` sections — one at lines 7-11 (`baseline-version: "0"`) and another at lines 29-32 (`baseline-version: 1`). In Spring YAML parsing, the **last** one wins for overlapping keys. This means: `baseline-version` is `1` (not `"0"`), and `enabled`, `baseline-on-migrate`, `locations` from the first block survive (no conflict). This is confusing and error-prone. **Should be merged into a single block.** |
| 3 | **🟢 P2** | `deploy/init.sql` | The syntax fixes are correct and complete for this file. The missing comma and unquoted CHECK values were genuine bugs. ✅ |
| 4 | **🟢 P2** | `deploy/init.sql` vs `V1__baseline.sql` | **Schema drift:** `init.sql` has `eval_config JSONB NOT NULL` while `V1__baseline.sql` has `eval_config jsonb` (nullable). These two files serve different purposes (init.sql = fresh deploy helper, V1__baseline.sql = Flyway baseline), but the inconsistency could cause confusion. Not urgent since init.sql appears to be a standalone deploy script, not used by Flyway. |
| 5 | **🟢 P2** | `docker-compose.yml` | `SPRING_FLYWAY_CLEAN_DISABLED: "true"` — Good safety measure. Prevents accidental `flyway clean` from destroying production data. ✅ |

### Verdict: ✅ Syntax fix is correct. P1 items (duplicate flyway block, validate-on-migrate permanent disable) need follow-up.

---

## Commit 3: `a4cd1885` — feat: migrate from ddl-auto=update to Flyway managed migrations

### Summary
- Adds `flyway-core` dependency to `pom.xml`
- Configures Flyway in `application.yml` (first flyway block: `baseline-version: "0"`, `baseline-on-migrate: true`)
- Creates `V1__baseline.sql` — a full `pg_dump` of the existing schema as Flyway baseline
- Note: This is the **oldest** of the 3 commits (parent: `d63a9b2e`), so later commits build on top of it

### Findings

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | **🔴 P0** | `application.yml` | **`ddl-auto` is set to `validate` but NOT to `none`!** With `ddl-auto: validate`, Hibernate still validates the schema against entities at startup and will **throw exceptions** if there's a mismatch. While this is safer than `update`, the standard Flyway migration pattern uses `ddl-auto: none` (Flyway owns all DDL). With `validate`, any entity-schema mismatch (e.g., a pending V4 migration not yet applied) causes startup failure. Consider switching to `none` for production or keeping `validate` only in dev. |
| 2 | **🔴 P0** | `application.yml` | **Duplicate `spring.flyway` config creates conflicting `baseline-version`!** First block (from this commit): `baseline-version: "0"`. Second block (appears to be from another merge?): `baseline-version: 1`. For an existing database with tables already present, `baseline-on-migrate: true` with `baseline-version: "0"` means Flyway will baseline at version 0 and then try to run V1__baseline.sql, which will **fail** because the tables already exist (CREATE TABLE without IF NOT EXISTS). With `baseline-version: 1` (which wins due to YAML last-key precedence), Flyway baselines at V1 and skips V1__baseline.sql — this is the **correct** behavior for existing DBs. **The duplication must be resolved, and the intended value must be `1` for existing DBs.** |
| 3 | **🟡 P1** | `V1__baseline.sql` | **`\restrict` and `\unrestrict` commands** (psql metacommands) were included in this commit. These are NOT valid SQL — they are `pg_dump` artifacts. Flyway's SQL parser will choke on them. Commit `e8678302` later removes them, which is correct, but the initial commit was broken. **If anyone checks out this specific commit and runs Flyway, it will fail.** Not a current issue since HEAD is clean, but bad for bisecting. |
| 4 | **🟡 P1** | `V1__baseline.sql` | **`flyway_schema_history` table DDL included in the baseline.** The baseline script tries to CREATE the flyway_schema_history table, but Flyway itself creates this table. This creates a conflict — if Flyway runs the baseline (fresh DB), it would try to create the table twice. Commit `e8678302` later removes this. Same bisect concern as above. |
| 5 | **🟡 P1** | `V1__baseline.sql` | **`dataset_ids` defined as `bigint[]`** in the baseline, but V3 migration converts from `text` to `bigint[]`. This means: (a) Fresh DB via V1→V3 = column is created as `bigint[]` then V3 tries ALTER to `bigint[]` (no-op, but the USING clause referencing `dataset_ids` as text will fail on a `bigint[]` column). (b) Existing DB baselined at V1 = V3 runs correctly to convert text→bigint[]. **Fresh deployments via Flyway may break on V3.** |
| 6 | **🟡 P1** | `V1__baseline.sql` | **No `IF NOT EXISTS` guards on any CREATE TABLE.** For existing databases where baseline-version is set correctly to 1, this isn't an issue (V1 is skipped). But if `baseline-version` is misconfigured to 0, the migration will fail on first `CREATE TABLE`. Given the duplicate config (P0 #2), this amplifies the risk. |
| 7 | **🟢 P2** | `pom.xml` | Uses `flyway-core` without specifying version — relies on Spring Boot BOM. This is fine for Spring Boot managed dependencies. For PostgreSQL, note that Flyway 10+ may need `flyway-database-postgresql` as an additional dependency. If using Spring Boot 3.2+, this should be auto-included, but worth verifying. |
| 8 | **🟢 P2** | `V1__baseline.sql` | Contains `COMMENT ON EXTENSION "uuid-ossp"` — harmless but unnecessary noise in the migration. Minor. |

### Verdict: ⚠️ Has P0 issues (duplicate flyway config, ddl-auto=validate). The V1 baseline commit was not self-contained (required e8678302 to fix). Fresh-deploy path (V1→V2→V3) likely broken.

---

## Cross-Commit Analysis

### 🔴 P0 Issues (Must Fix)

1. **Hardcoded `ahvp-agent-secret-2026` in `agent/config.yaml` (line 13)** — The security commit cleaned Java/YAML/test files but missed the Python agent config. The secret remains in the repo at HEAD. This needs immediate remediation + secret rotation (the value has been in Git history).

2. **Duplicate `spring.flyway` config in `application.yml`** — Two blocks with conflicting `baseline-version` (0 vs 1). YAML last-key-wins means the value is `1`, which happens to be correct for existing DBs, but this is accidental. A future editor could reorder the blocks and break everything. Must merge into one block with `baseline-version: 1`.

3. **Fresh deploy path (V1→V2→V3) is broken** — V1__baseline.sql defines `dataset_ids` as `bigint[]`, but V3 assumes it's `text` and tries to cast. Fresh DB deployments using Flyway will fail at V3. Fix: either make V3 conditional (`DO $$ ... IF column_type = 'text' THEN ... END IF; $$`) or change V1 to use `text` to match the original schema that V3 was written to migrate from.

### 🟡 P1 Issues (Should Fix Soon)

4. **`SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false` left permanently in docker-compose.yml** — Needs a re-enablement plan. Risk: schema drift goes undetected.

5. **`ddl-auto: validate` instead of `none`** — With Flyway managing DDL, Hibernate validation adds startup fragility. Consider `none` for prod, `validate` for dev only.

6. **`.env.example` missing `AGENT_TOKEN`** — New deployers won't know it's required.

7. **Commit `a4cd1885` is not independently valid** — Contains `\restrict`/`\unrestrict` and `flyway_schema_history` DDL that break Flyway. Fixed by later commit. Git history is messy.

### 🟢 P2 Issues (Nice to Fix)

8. **`eval_config` nullability inconsistency** — `init.sql` says `NOT NULL`, baseline says nullable.

9. **`flyway-database-postgresql` dependency** — May be needed for Flyway 10+ / Spring Boot 3.2+.

10. **`@PostConstruct` warning-only for missing AGENT_TOKEN** — Consider fail-fast or health indicator.

---

## Data Safety Assessment: ddl-auto=update → Flyway

**Is the transition safe for existing databases?**

✅ **Yes, with caveats:**
- `baseline-on-migrate: true` with `baseline-version: 1` correctly tells Flyway "the DB already has V1 applied, start tracking from here"
- `ddl-auto: validate` ensures Hibernate doesn't make surprise DDL changes
- V2 and V3 migrations handle real schema fixups (NOT NULL drops, type conversion)
- The V3 `USING` clause correctly handles text→bigint[] conversion with NULL handling
- `SPRING_FLYWAY_CLEAN_DISABLED=true` prevents accidental data destruction

⚠️ **Risks:**
- The duplicate flyway config means `baseline-version` could flip to `0` if someone merges blocks — causing V1 to try re-creating all tables (instant failure, no data loss)
- Fresh deploys (new environments) will fail at V3 (P0 #3 above)

---

## Recommendations (Priority Order)

1. **IMMEDIATELY** fix `agent/config.yaml` — remove hardcoded token, use env var. Rotate the secret `ahvp-agent-secret-2026` since it's in Git history.
2. **Merge** the two `spring.flyway` blocks in `application.yml` into one, with `baseline-version: 1`.
3. **Fix V3 migration** to be idempotent — check column type before attempting conversion.
4. **Add `AGENT_TOKEN=` to `.env.example`.**
5. **Plan to re-enable** `validate-on-migrate` once all environments have run the baseline.
6. **Consider** `ddl-auto: none` for production profile.

---

*Review completed: 2026-05-13 04:01 CST*
