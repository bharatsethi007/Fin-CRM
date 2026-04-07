# AdvisorFlow — Setup Instructions

## 1. Cursor Rules

Copy the `.cursor/rules/` folder into your project root:

```powershell
# From your Frontend repo directory
Copy-Item -Path "path\to\downloaded\.cursor" -Destination "C:\Users\BharatS\advisorflow\Frontend repo\.cursor" -Recurse
```

Cursor will automatically pick up `.cursor/rules/advisorflow-architecture.mdc` and enforce the rules on every AI interaction.

**What it enforces:**
- 300-line file limit
- No .rpc(), no supabase.functions.invoke(), no Realtime
- Edge Function header requirements
- Multi-tenant security patterns
- AI safety rules
- Windows/PowerShell commands

---

## 2. Vitest Setup

### Install dependencies:

```powershell
cd "C:\Users\BharatS\advisorflow\Frontend repo"
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

### Copy the files:

- `vitest.config.ts` → project root (alongside your existing `vite.config.ts`)
- `tests/setup.ts` → `tests/setup.ts`
- `tests/critical.test.ts` → `tests/critical.test.ts`

### Add to package.json scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Run:

```powershell
npm test
```

---

## What the 10 tests cover:

| # | Test | Why it matters |
|---|------|---------------|
| 1 | DTI calculation | Wrong DTI = regulatory breach |
| 2 | UMI at stress rate | CCCFA requirement — must stress test at 8.5% |
| 3 | LVR calculation | RBNZ restriction thresholds |
| 4 | 300-line file limit | Prevents the 5000-line disaster |
| 5 | Forbidden patterns scan | Catches .rpc(), Realtime, exposed keys |
| 6 | No hardcoded firm_id | Multi-tenant data leak prevention |
| 7 | Storage path has firm_id | Tenant file isolation |
| 8 | PII sanitiser exists | AI safety — no personal data to OpenAI |
| 9 | Compliance terms in prompts | CCCFA/FMA grounding |
| 10 | Edge Function headers | Prevents silent 401 failures |

**Tests 4-7 scan your actual codebase.** They start as warnings (won't fail the build) so you can see violations first. Flip them to strict once you've cleaned up.
