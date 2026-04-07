# Baseline Migrations — Captured from Production

**Captured:** 2026-04-07
**Source:** Supabase project `lfhaaqjinpbkozaoblyo` (production)
**Purpose:** Close the schema drift gap between your repo and your live database.

---

## What this is

These 10 migration files contain **93 custom Postgres functions** that exist in your production database but were NOT in your `supabase/migrations/` folder. They were created directly in Supabase Studio (or via ad-hoc SQL) and never captured as migrations.

This is a **schema drift problem** — your repo did not match production, which means:
- You couldn't reproduce your database in another environment
- A new developer couldn't see what existed
- You couldn't roll back changes
- A Supabase project reset would have lost everything silently

These files fix that.

---

## File breakdown

| File | Functions | What it contains |
|---|---|---|
| `20260407120000_baseline_helpers_functions.sql` | 16 | `get_my_firm_id`, `log_audit_event`, `search_documents`, broker metrics, lender win rates, PDF/CCCFA report data |
| `20260407120100_baseline_audit_functions.sql` | 1 | `audit_trail_trigger_fn` |
| `20260407120200_baseline_serviceability_functions.sql` | 7 | `calculate_serviceability`, `calculate_lvr`, `calculate_readiness_score`, `calculate_retention_score`, `calculate_decline_risk`, `calculate_income_stability`, `detect_anomalies` |
| `20260407120300_baseline_compliance_functions.sql` | 5 | CCCFA + KiwiSaver functions |
| `20260407120400_baseline_document_functions.sql` | 13 | Document parsing, validation, checklists, duplicate checks, Akahu integration |
| `20260407120500_baseline_commission_functions.sql` | 6 | Commission tracking and settlement |
| `20260407120600_baseline_client_portal_functions.sql` | 5 | Client portal activation, credit sync |
| `20260407120700_baseline_ai_functions.sql` | 13 | AI orchestration: model config, application context, token limits, intelligence state, cached outputs |
| `20260407120800_baseline_flow_intelligence_functions.sql` | 10 | All `fi_*` Flow Intelligence agent functions |
| `20260407120900_baseline_triggers_functions.sql` | 17 | All trigger functions and `updated_at` helpers |

**Total: 93 functions, ~5,800 lines**

---

## How to install

### Step 1 — Drop into your repo

Copy the `supabase/migrations/` folder into your repo (it should merge with your existing migrations folder):

```powershell
Copy-Item -Path "supabase\migrations\*" -Destination "C:\Users\BharatS\advisorflow\Frontend repo\supabase\migrations\" -Recurse
```

### Step 2 — Mark as already applied (CRITICAL)

These functions ALREADY EXIST in production. Do NOT run `supabase db push` or `supabase migration up` or you'll get "function already exists" errors.

You need to mark these migrations as already applied without running them. There are two ways:

**Option A — Supabase CLI (recommended):**

```powershell
cd "C:\Users\BharatS\advisorflow\Frontend repo"
supabase migration repair --status applied 20260407120000
supabase migration repair --status applied 20260407120100
supabase migration repair --status applied 20260407120200
supabase migration repair --status applied 20260407120300
supabase migration repair --status applied 20260407120400
supabase migration repair --status applied 20260407120500
supabase migration repair --status applied 20260407120600
supabase migration repair --status applied 20260407120700
supabase migration repair --status applied 20260407120800
supabase migration repair --status applied 20260407120900
```

**Option B — Direct SQL on Supabase:**

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260407120000', 'baseline_helpers_functions'),
  ('20260407120100', 'baseline_audit_functions'),
  ('20260407120200', 'baseline_serviceability_functions'),
  ('20260407120300', 'baseline_compliance_functions'),
  ('20260407120400', 'baseline_document_functions'),
  ('20260407120500', 'baseline_commission_functions'),
  ('20260407120600', 'baseline_client_portal_functions'),
  ('20260407120700', 'baseline_ai_functions'),
  ('20260407120800', 'baseline_flow_intelligence_functions'),
  ('20260407120900', 'baseline_triggers_functions')
ON CONFLICT DO NOTHING;
```

### Step 3 — Commit to git

```powershell
git add supabase/migrations/2026040712*
git commit -m "chore(db): capture baseline functions from production"
git push
```

---

## What's NOT in here (yet)

This baseline only captures **functions**. Your database also has:

- **Tables** — schema definitions (CREATE TABLE statements)
- **Views** — `v_pipeline_overview`, `v_rate_refix_alerts`, `v_critical_deadlines`, `v_advisor_daily_briefing`
- **Indexes** — the 40+ performance indexes
- **RLS policies** — row-level security rules
- **Triggers** — the actual trigger definitions on tables (not the functions they call)
- **pg_cron jobs** — scheduled tasks
- **Extensions** — pgvector, pg_trgm

If your migrations folder already has these, you're fine. If not, we need to capture them too. Let me know and I'll generate baselines for tables, views, indexes, and policies as well.

---

## Going forward

**Rule: Never create database objects directly in Supabase Studio without also writing the migration file.**

Use the Supabase MCP `apply_migration` tool from now on — it both applies the SQL AND creates the migration file. That way drift never happens again.
