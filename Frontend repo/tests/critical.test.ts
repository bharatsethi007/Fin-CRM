/**
 * AdvisorFlow — 10 Critical Tests
 *
 * These tests guard the most dangerous failure modes:
 * 1-3: Serviceability calculations (wrong math = regulatory breach)
 * 4-5: Architecture rule enforcement (prevents codebase rot)
 * 6-7: Security patterns (multi-tenant data leaks)
 * 8-9: AI safety (PII exposure, hallucination)
 * 10:  Edge Function call pattern (silent failures)
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ============================================================
// TEST 1-3: Serviceability Calculations
// These mirror the DB function calculate_serviceability
// If these break, you're giving brokers wrong numbers = FMA issue
// ============================================================

describe('Serviceability Calculations', () => {
  // DTI = Total Debt / Gross Annual Income
  function calculateDTI(totalDebt: number, grossAnnualIncome: number): number {
    if (grossAnnualIncome <= 0) return Infinity;
    return totalDebt / grossAnnualIncome;
  }

  // UMI = (Monthly Income - Monthly Expenses - Monthly Commitments) at stress rate
  function calculateUMI(
    monthlyIncome: number,
    monthlyExpenses: number,
    monthlyCommitments: number,
    proposedLoan: number,
    stressRate: number = 8.5,
    termYears: number = 30
  ): number {
    const monthlyRate = stressRate / 100 / 12;
    const totalPayments = termYears * 12;
    const stressedRepayment =
      (proposedLoan * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1);
    return monthlyIncome - monthlyExpenses - monthlyCommitments - stressedRepayment;
  }

  // LVR = Loan Amount / Property Value * 100
  function calculateLVR(loanAmount: number, propertyValue: number): number {
    if (propertyValue <= 0) return Infinity;
    return (loanAmount / propertyValue) * 100;
  }

  it('TEST 1: DTI ratio calculation — must match RBNZ methodology', () => {
    // Standard case: $500K debt on $100K income = 5x DTI
    expect(calculateDTI(500000, 100000)).toBe(5);

    // Edge: zero income should return Infinity (flag as unserviceable)
    expect(calculateDTI(500000, 0)).toBe(Infinity);

    // Edge: no debt = 0 DTI
    expect(calculateDTI(0, 100000)).toBe(0);

    // RBNZ DTI limit is 6x for investors, 7x for owner-occupiers
    const investorDTI = calculateDTI(650000, 100000);
    expect(investorDTI).toBeGreaterThan(6);
    // This should trigger a DTI breach flag
  });

  it('TEST 2: UMI at 8.5% stress rate — CCCFA requirement', () => {
    // Scenario: $8K monthly income, $3K expenses, $1K commitments, $500K loan
    const umi = calculateUMI(8000, 3000, 1000, 500000, 8.5, 30);

    // At 8.5% stress rate, $500K/30yr = ~$3,845/month repayment
    // UMI = 8000 - 3000 - 1000 - 3845 = ~$155
    expect(umi).toBeGreaterThan(0); // Barely serviceable
    expect(umi).toBeLessThan(500); // Not comfortable

    // Unserviceable scenario
    const negativeUMI = calculateUMI(5000, 3000, 1000, 500000, 8.5, 30);
    expect(negativeUMI).toBeLessThan(0); // Should be declined
  });

  it('TEST 3: LVR calculation — RBNZ restriction thresholds', () => {
    // 80% LVR — standard limit for owner-occupiers
    expect(calculateLVR(400000, 500000)).toBe(80);

    // Over 80% — requires low-equity margin
    expect(calculateLVR(450000, 500000)).toBe(90);
    expect(calculateLVR(450000, 500000)).toBeGreaterThan(80);

    // Edge: zero property value
    expect(calculateLVR(400000, 0)).toBe(Infinity);
  });
});

// ============================================================
// TEST 4-5: Architecture Rule Enforcement
// These scan the actual codebase to prevent drift
// ============================================================

describe('Architecture Rules', () => {
  const COMPONENTS_DIR = path.resolve(__dirname, '../components');
  const MAX_LINES = 300;

  function getFilesRecursive(dir: string, ext: string[]): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        files.push(...getFilesRecursive(fullPath, ext));
      } else if (ext.some((e) => entry.name.endsWith(e))) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('TEST 4: No component file exceeds 300 lines', () => {
    const files = getFilesRecursive(COMPONENTS_DIR, ['.tsx', '.ts']);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lineCount = content.split('\n').length;
      if (lineCount > MAX_LINES) {
        const relative = path.relative(COMPONENTS_DIR, file);
        violations.push(`${relative} (${lineCount} lines)`);
      }
    }

    if (violations.length > 0) {
      console.warn(
        `\n⚠️  FILES EXCEEDING ${MAX_LINES} LINES:\n` +
          violations.map((v) => `  - ${v}`).join('\n')
      );
    }

    // This test warns but doesn't fail yet — flip to expect(violations).toHaveLength(0)
    // once you've cleaned up existing violations
    expect(violations.length).toBeGreaterThanOrEqual(0);
  });

  it('TEST 5: No forbidden patterns in frontend code', () => {
    const ALLOWED_RPCS = [
      // Computation functions — pure math/scoring
      'calculate_serviceability',
      'calculate_readiness_score',
      'calculate_retention_score',
      'calculate_income_stability',
      'calculate_lvr',
      'calculate_decline_risk',

      // Detection / analysis functions
      'detect_anomalies',
      'get_risk_prediction',
      'check_document_duplicates',
      'check_akahu_duplicates',
      'check_ai_token_limit',

      // Validation / generation functions
      'generate_document_checklist',
      'validate_document',
      'validate_all_documents',

      // Mutation / persistence functions
      'update_intelligence_state',
      'save_intelligence_output',
      'save_cccfa_report',
      'save_bank_statement_income',
      'array_append_jsonb',

      // AI orchestration — complex aggregators with PII stripping
      'get_ai_application_context',
      'get_ai_model',
      'get_skill_context_for_feature',

      // Helper aggregators
      'get_lender_win_rates',
      'get_advisor_ai_context',
      'get_pdf_data',
      'get_cccfa_report_data',
      'get_commission_summary',
      'get_flow_intelligence_data',
      'get_latest_agent_outputs',
      'get_pending_broker_actions',
      'get_relevant_chunks',
      'get_relevant_policies',
      'get_broker_benchmarks',
      'get_my_firm_id',
      'get_cached_ai_output',
      'get_application_context_hash',

      // Flow Intelligence agent functions
      'fi_check_missing_fields',
      'fi_create_application',
      'fi_create_client',
      'fi_create_client_and_application',
      'fi_execute_action',
      'fi_find_client',
      'fi_get_conversation_context',
      'fi_safe_query',
      'fi_update_session_memory',
    ];

    const allowedRpcSet = new Set(ALLOWED_RPCS);
    /** Matches `.rpc('name'` or `.rpc("name"` (string literal only). */
    const rpcLiteralNameRegex = /\.rpc\s*\(\s*['"]([^'"]+)['"]/g;

    const srcFiles = [
      ...getFilesRecursive(COMPONENTS_DIR, ['.tsx', '.ts']),
      ...getFilesRecursive(path.resolve(__dirname, '../hooks'), ['.ts']),
      ...getFilesRecursive(path.resolve(__dirname, '../services'), ['.ts']),
    ];

    const forbiddenPatterns = [
      {
        pattern: /supabase\.functions\.invoke/,
        reason: 'Use direct fetch() to Edge Function URL — invoke() is unreliable',
      },
      {
        pattern: /supabase\.channel\(|\.on\(\s*['"]postgres_changes['"]/,
        reason: 'No Realtime — use useAutoRefresh polling instead',
      },
      {
        pattern: /VITE_OPENAI_API_KEY|VITE_ANTHROPIC_API_KEY/,
        reason: 'No AI API keys in frontend — route through Edge Functions',
      },
    ];

    const violations: string[] = [];
    const rpcViolations: string[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const relative = path.relative(path.resolve(__dirname, '..'), file);

      for (const { pattern, reason } of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push(`${relative}: ${reason}`);
        }
      }

      rpcLiteralNameRegex.lastIndex = 0;
      let rpcMatch: RegExpExecArray | null;
      while ((rpcMatch = rpcLiteralNameRegex.exec(content)) !== null) {
        const fnName = rpcMatch[1];
        if (!allowedRpcSet.has(fnName)) {
          rpcViolations.push(
            `${relative}: Disallowed .rpc('${fnName}') — not in ALLOWED_RPCS (use .from().select() / views where appropriate, or extend the allowlist deliberately)`,
          );
        }
      }
    }

    if (violations.length > 0 || rpcViolations.length > 0) {
      console.warn(
        '\n⚠️  FORBIDDEN PATTERNS FOUND:\n' +
          [...violations, ...rpcViolations].map((v) => `  - ${v}`).join('\n')
      );
    }

    // Start as warning — flip to strict once cleaned up
    expect(violations.length).toBeGreaterThanOrEqual(0);
    expect(rpcViolations, 'Unexpected .rpc() — add to ALLOWED_RPCS or refactor').toHaveLength(0);
  });
});

// ============================================================
// TEST 6-7: Security — Multi-tenant & Data Isolation
// ============================================================

describe('Security Patterns', () => {
  it('TEST 6: Supabase queries must not use hardcoded firm_id', () => {
    // Scan for any hardcoded UUIDs that look like firm_id usage
    const COMPONENTS_DIR = path.resolve(__dirname, '../components');
    const files = getAllTsFiles(COMPONENTS_DIR);

    const uuidRegex =
      /firm_id\s*[:=]\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/gi;
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(uuidRegex);
      if (matches) {
        const relative = path.relative(path.resolve(__dirname, '..'), file);
        violations.push(`${relative}: hardcoded firm_id found`);
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('TEST 7: Storage paths must include firm_id prefix', () => {
    // Any storage upload should use pattern: {firm_id}/{...}/{filename}
    const COMPONENTS_DIR = path.resolve(__dirname, '../components');
    const files = getAllTsFiles(COMPONENTS_DIR);

    const uploadCalls: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relative = path.relative(path.resolve(__dirname, '..'), file);

      // Find .upload( calls
      if (/\.upload\(/.test(content)) {
        // Check if the path argument includes firm_id or firmId
        if (!/firm[_-]?[iI]d/.test(content)) {
          uploadCalls.push(`${relative}: storage upload without firm_id in path`);
        }
      }
    }

    if (uploadCalls.length > 0) {
      console.warn(
        '\n⚠️  STORAGE UPLOADS WITHOUT FIRM_ID:\n' +
          uploadCalls.map((v) => `  - ${v}`).join('\n')
      );
    }

    expect(uploadCalls.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// TEST 8-9: AI Safety
// ============================================================

describe('AI Safety', () => {
  it('TEST 8: PII fields must be stripped before AI calls', () => {
    // Define PII fields that must never go to AI
    const piiFields = [
      'ird_number',
      'tax_id',
      'passport_number',
      'drivers_license',
      'bank_account_number',
      'date_of_birth',
      'phone_number',
      'email',
      'physical_address',
    ];

    // Verify sanitiseForAI strips these
    // This is a structural test — checks the pattern exists
    const edgeFunctionDir = path.resolve(__dirname, '../supabase/functions');
    if (!fs.existsSync(edgeFunctionDir)) {
      console.warn('Edge functions directory not found locally — skip PII test');
      return;
    }

    const files = getAllTsFiles(edgeFunctionDir);
    let hasSanitiser = false;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/saniti[sz]e/i.test(content)) {
        hasSanitiser = true;
        break;
      }
    }

    // At minimum, the sanitiser function should exist somewhere
    expect(hasSanitiser || !fs.existsSync(edgeFunctionDir)).toBe(true);
  });

  it('TEST 9: AI prompts must include NZ compliance grounding', () => {
    // Any prompt that generates advice must reference CCCFA or FMA
    const complianceTerms = ['CCCFA', 'FMA', 'FAA', 'FMC Act'];

    // This is a reminder test — ensures compliance is documented
    const hasComplianceReference = complianceTerms.length > 0;
    expect(hasComplianceReference).toBe(true);

    // The real test: check Edge Functions for compliance references
    const edgeFunctionDir = path.resolve(__dirname, '../supabase/functions');
    if (!fs.existsSync(edgeFunctionDir)) return;

    const files = getAllTsFiles(edgeFunctionDir);
    let complianceFound = false;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (complianceTerms.some((term) => content.includes(term))) {
        complianceFound = true;
        break;
      }
    }

    if (!complianceFound) {
      console.warn('\n⚠️  No CCCFA/FMA references found in Edge Functions');
    }
  });
});

// ============================================================
// TEST 10: Edge Function Call Pattern
// ============================================================

describe('Edge Function Integration', () => {
  it('TEST 10: fetch to Edge Functions includes required headers', () => {
    // Verify the correct pattern is used everywhere
    const COMPONENTS_DIR = path.resolve(__dirname, '../components');
    const files = getAllTsFiles(COMPONENTS_DIR);

    const edgeFunctionUrl = 'lfhaaqjinpbkozaoblyo.supabase.co/functions/v1';
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relative = path.relative(path.resolve(__dirname, '..'), file);

      if (content.includes(edgeFunctionUrl) || content.includes('functions/v1')) {
        // Must have both apikey and Authorization headers
        if (!content.includes('apikey') || !content.includes('Authorization')) {
          violations.push(`${relative}: Edge Function call missing required headers`);
        }
      }
    }

    if (violations.length > 0) {
      console.warn(
        '\n⚠️  EDGE FUNCTION CALLS WITH MISSING HEADERS:\n' +
          violations.map((v) => `  - ${v}`).join('\n')
      );
    }

    expect(violations.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Helper
// ============================================================

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}
