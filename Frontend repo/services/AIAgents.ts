// ================================================================
// AI AGENTS
// Orchestrated multi-step workflows that complete whole tasks
// Each agent: trigger → steps → broker review → done
//
// Usage:
//   const result = await AIAgents.run('application_processor', applicationId, firmId);
// ================================================================

import { supabase } from './supabaseClient';
import { AIOrchestrator } from './AIOrchestrator';

export type AgentName =
  | 'application_processor'
  | 'submission_agent'
  | 'approval_processor'
  | 'compliance_agent'
  | 'refix_agent'
  | 'document_chaser';

interface StepLog {
  step: string;
  status: 'done' | 'failed' | 'skipped';
  detail: string;
  tokens_used?: number;
  timestamp: string;
}

interface AgentResult {
  success: boolean;
  runId: string | null;
  summary: string;
  stepsCompleted: number;
  stepsFailed: number;
  requiresBrokerReview: boolean;
  reviewItems: Array<{ type: string; description: string; data?: any }>;
  totalTokens: number;
  error?: string;
}

// ================================================================
// STEP LOGGER
// ================================================================
function makeLogger(steps: StepLog[]) {
  return {
    log(step: string, status: StepLog['status'], detail: string, tokens = 0) {
      steps.push({ step, status, detail, tokens_used: tokens, timestamp: new Date().toISOString() });
    }
  };
}

// ================================================================
// CHECK AGENT ENABLED
// ================================================================
async function isAgentEnabled(firmId: string, agentName: AgentName): Promise<boolean> {
  const { data } = await supabase
    .from('ai_agent_settings')
    .select('*')
    .eq('firm_id', firmId)
    .maybeSingle();
  if (!data) return false;
  const key = agentName + '_enabled' as keyof typeof data;
  return data[key] === true;
}

// ================================================================
// SAVE AGENT RUN
// ================================================================
async function saveRun(params: {
  applicationId: string | null;
  firmId: string;
  advisorId?: string;
  agentName: AgentName;
  triggerEvent: string;
  status: string;
  stepLog: StepLog[];
  summary: string;
  requiresBrokerReview: boolean;
  reviewItems: any[];
  totalTokens: number;
  durationMs: number;
}): Promise<string | null> {
  const { data } = await supabase.from('ai_agent_runs').insert({
    application_id: params.applicationId,
    firm_id: params.firmId,
    advisor_id: params.advisorId || null,
    agent_name: params.agentName,
    trigger_event: params.triggerEvent,
    status: params.status,
    steps_completed: params.stepLog.filter(s => s.status === 'done').length,
    steps_failed: params.stepLog.filter(s => s.status === 'failed').length,
    steps_total: params.stepLog.length,
    step_log: params.stepLog,
    summary: params.summary,
    requires_broker_review: params.requiresBrokerReview,
    broker_review_items: params.reviewItems,
    total_tokens_used: params.totalTokens,
    duration_ms: params.durationMs,
    completed_at: new Date().toISOString(),
  }).select('id').single();
  return data?.id || null;
}

// ================================================================
// AGENT 1: APPLICATION PROCESSOR
// Runs when documents uploaded or application created
// Populates income/expenses, runs algorithms, generates advice
// ================================================================
async function runApplicationProcessor(
  applicationId: string,
  firmId: string,
  advisorId?: string,
  triggerEvent = 'manual'
): Promise<AgentResult> {
  const start = Date.now();
  const steps: StepLog[] = [];
  const log = makeLogger(steps);
  const reviewItems: any[] = [];
  let totalTokens = 0;

  try {
    // Step 1: Run serviceability
    try {
      await supabase.rpc('calculate_serviceability', { p_application_id: applicationId });
      log.log('serviceability', 'done', 'Serviceability calculated — DTI, UMI, LVR, lender eligibility');
    } catch (e: any) {
      log.log('serviceability', 'failed', e.message);
    }

    // Step 2: Run anomaly detection
    try {
      const { data: flagCount } = await supabase.rpc('detect_anomalies', { p_application_id: applicationId });
      const count = flagCount || 0;
      log.log('anomaly_detection', 'done', count + ' anomaly flags detected');
      if (count > 0) {
        reviewItems.push({ type: 'anomalies', description: count + ' anomalies detected — review before submission', data: { count } });
      }
    } catch (e: any) {
      log.log('anomaly_detection', 'failed', e.message);
    }

    // Step 3: Score readiness
    try {
      await supabase.rpc('calculate_readiness_score', { p_application_id: applicationId });
      const { data: score } = await supabase
        .from('application_readiness_scores')
        .select('score_grade, total_score, critical_count')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      log.log('readiness_score', 'done', 'Grade ' + (score?.score_grade || '?') + ' — ' + (score?.total_score || 0) + '/100');
      if (score?.critical_count && score.critical_count > 0) {
        reviewItems.push({ type: 'readiness', description: score.critical_count + ' critical readiness issues — must fix before submission', data: score });
      }
    } catch (e: any) {
      log.log('readiness_score', 'failed', e.message);
    }

    // Step 4: Generate smart document checklist
    try {
      await supabase.rpc('generate_document_checklist', { p_application_id: applicationId });
      log.log('document_checklist', 'done', 'Smart checklist generated based on client profile');
    } catch (e: any) {
      log.log('document_checklist', 'skipped', 'Checklist already exists or ' + e.message);
    }

    // Step 5: Generate AI advice summary
    try {
      const advice = await AIOrchestrator.run('advice_summary', applicationId, { firmId, advisorId, forceRefresh: true });
      totalTokens += advice.tokensUsed;
      if (advice.success) {
        log.log('advice_summary', 'done', 'AI advice summary generated — lender recommendation ready', advice.tokensUsed);
        reviewItems.push({ type: 'advice', description: 'AI advice summary ready for review', data: advice.data });
      } else {
        log.log('advice_summary', 'failed', advice.error || 'AI error');
      }
    } catch (e: any) {
      log.log('advice_summary', 'failed', e.message);
    }

    // Step 6: Check compliance gaps
    try {
      const { data: compliance } = await supabase
        .from('compliance_checklists')
        .select('disclosure_statement_provided, needs_objectives_completed, cccfa_affordability_assessed')
        .eq('application_id', applicationId)
        .maybeSingle();

      const gaps = [];
      if (!compliance?.disclosure_statement_provided) gaps.push('Disclosure statement not provided');
      if (!compliance?.needs_objectives_completed) gaps.push('Needs & Objectives incomplete');
      if (!compliance?.cccfa_affordability_assessed) gaps.push('CCCFA affordability not documented');

      if (gaps.length > 0) {
        log.log('compliance_check', 'done', gaps.length + ' compliance gaps found');
        reviewItems.push({ type: 'compliance', description: 'Compliance gaps: ' + gaps.join(', '), data: { gaps } });
      } else {
        log.log('compliance_check', 'done', 'All compliance checks passed');
      }
    } catch (e: any) {
      log.log('compliance_check', 'failed', e.message);
    }

    const summary = [
      'Serviceability calculated',
      steps.find(s => s.step === 'anomaly_detection')?.detail,
      steps.find(s => s.step === 'readiness_score')?.detail,
      reviewItems.length > 0 ? reviewItems.length + ' items need your review' : 'All checks passed',
    ].filter(Boolean).join('. ');

    const runId = await saveRun({
      applicationId, firmId, advisorId,
      agentName: 'application_processor',
      triggerEvent,
      status: reviewItems.length > 0 ? 'pending_review' : 'completed',
      stepLog: steps,
      summary,
      requiresBrokerReview: reviewItems.length > 0,
      reviewItems,
      totalTokens,
      durationMs: Date.now() - start,
    });

    return {
      success: true,
      runId,
      summary,
      stepsCompleted: steps.filter(s => s.status === 'done').length,
      stepsFailed: steps.filter(s => s.status === 'failed').length,
      requiresBrokerReview: reviewItems.length > 0,
      reviewItems,
      totalTokens,
    };

  } catch (e: any) {
    return { success: false, runId: null, summary: 'Agent failed: ' + e.message, stepsCompleted: 0, stepsFailed: 1, requiresBrokerReview: false, reviewItems: [], totalTokens, error: e.message };
  }
}

// ================================================================
// AGENT 2: COMPLIANCE AGENT
// Checks all CCCFA/FMA/FAA requirements before submission
// ================================================================
async function runComplianceAgent(
  applicationId: string,
  firmId: string,
  advisorId?: string
): Promise<AgentResult> {
  const start = Date.now();
  const steps: StepLog[] = [];
  const log = makeLogger(steps);
  const reviewItems: any[] = [];
  let totalTokens = 0;

  try {
    // Check all compliance items
    const { data: compliance } = await supabase
      .from('compliance_checklists')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    const { data: creditChecks } = await supabase
      .from('credit_checks')
      .select('checked_at')
      .eq('application_id', applicationId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: docs } = await supabase
      .from('documents')
      .select('category')
      .eq('application_id', applicationId);

    const docCategories = new Set((docs || []).map((d: any) => d.category));

    // CCCFA checks
    if (!compliance?.disclosure_statement_provided) {
      reviewItems.push({ type: 'critical', description: 'CRITICAL: Disclosure statement not provided to client (FMC Act s.431K)', data: { fix: 'Provide and record disclosure statement' } });
      log.log('disclosure_check', 'failed', 'Disclosure statement missing');
    } else {
      log.log('disclosure_check', 'done', 'Disclosure statement provided');
    }

    if (!compliance?.needs_objectives_completed) {
      reviewItems.push({ type: 'critical', description: 'CRITICAL: Needs & Objectives not documented (FAA requirement)', data: { fix: 'Complete Needs & Objectives section' } });
      log.log('needs_objectives', 'failed', 'Needs & Objectives missing');
    } else {
      log.log('needs_objectives', 'done', 'Needs & Objectives complete');
    }

    if (!creditChecks) {
      reviewItems.push({ type: 'high', description: 'No credit check recorded — required under CCCFA affordability assessment', data: { fix: 'Run and record credit check' } });
      log.log('credit_check', 'failed', 'No credit check on file');
    } else {
      const agedays = Math.round((Date.now() - new Date(creditChecks.checked_at).getTime()) / 86400000);
      if (agedays > 90) {
        reviewItems.push({ type: 'high', description: 'Credit check is ' + agedays + ' days old — refresh required (> 90 days)', data: { fix: 'Run fresh credit check' } });
        log.log('credit_check', 'failed', 'Credit check stale: ' + agedays + ' days old');
      } else {
        log.log('credit_check', 'done', 'Credit check current: ' + agedays + ' days old');
      }
    }

    if (!docCategories.has('ID')) {
      reviewItems.push({ type: 'critical', description: 'No identity document — AML/CFT Act requirement', data: { fix: 'Upload client ID document' } });
      log.log('aml_check', 'failed', 'No identity document');
    } else {
      log.log('aml_check', 'done', 'Identity document present');
    }

    // Generate compliance narrative
    if (reviewItems.filter(i => i.type === 'critical').length === 0) {
      const narrative = await AIOrchestrator.run('serviceability_narrative', applicationId, { firmId });
      totalTokens += narrative.tokensUsed;
      log.log('compliance_narrative', narrative.success ? 'done' : 'failed', 'CCCFA compliance narrative generated');
    } else {
      log.log('compliance_narrative', 'skipped', 'Skipped — critical compliance gaps must be resolved first');
    }

    const criticalCount = reviewItems.filter(i => i.type === 'critical').length;
    const summary = criticalCount > 0
      ? criticalCount + ' critical compliance gaps — must resolve before submission'
      : reviewItems.length > 0
        ? reviewItems.length + ' compliance items to address'
        : 'All compliance checks passed — ready for submission';

    const runId = await saveRun({
      applicationId, firmId, advisorId,
      agentName: 'compliance_agent',
      triggerEvent: 'manual',
      status: criticalCount > 0 ? 'pending_review' : 'completed',
      stepLog: steps,
      summary,
      requiresBrokerReview: reviewItems.length > 0,
      reviewItems,
      totalTokens,
      durationMs: Date.now() - start,
    });

    return { success: true, runId, summary, stepsCompleted: steps.filter(s => s.status === 'done').length, stepsFailed: steps.filter(s => s.status === 'failed').length, requiresBrokerReview: reviewItems.length > 0, reviewItems, totalTokens };

  } catch (e: any) {
    return { success: false, runId: null, summary: 'Compliance agent failed: ' + e.message, stepsCompleted: 0, stepsFailed: 1, requiresBrokerReview: false, reviewItems: [], totalTokens, error: e.message };
  }
}

// ================================================================
// MAIN AGENTS RUNNER
// ================================================================
export const AIAgents = {
  async run(
    agentName: AgentName,
    applicationId: string | null,
    firmId: string,
    options: { advisorId?: string; triggerEvent?: string; force?: boolean; extraData?: any } = {}
  ): Promise<AgentResult> {

    // Check if agent is enabled for this firm (unless forced)
    if (!options.force) {
      const enabled = await isAgentEnabled(firmId, agentName);
      if (!enabled) {
        return { success: false, runId: null, summary: 'Agent ' + agentName + ' is not enabled for this firm', stepsCompleted: 0, stepsFailed: 0, requiresBrokerReview: false, reviewItems: [], totalTokens: 0, error: 'Agent disabled' };
      }
    }

    switch (agentName) {
      case 'application_processor':
        return runApplicationProcessor(applicationId!, firmId, options.advisorId, options.triggerEvent || 'manual');
      case 'compliance_agent':
        return runComplianceAgent(applicationId!, firmId, options.advisorId);
      default:
        return { success: false, runId: null, summary: 'Agent ' + agentName + ' not yet implemented', stepsCompleted: 0, stepsFailed: 0, requiresBrokerReview: false, reviewItems: [], totalTokens: 0, error: 'Not implemented' };
    }
  },

  // Get all runs for an application
  async getRuns(applicationId: string) {
    const { data } = await supabase
      .from('ai_agent_runs')
      .select('id, agent_name, status, summary, steps_completed, steps_failed, requires_broker_review, broker_reviewed, total_tokens_used, started_at, completed_at')
      .eq('application_id', applicationId)
      .order('started_at', { ascending: false });
    return data || [];
  },

  // Broker approves agent actions
  async approve(runId: string, notes?: string) {
    await supabase.from('ai_agent_runs').update({
      broker_reviewed: true,
      broker_approved: true,
      broker_reviewed_at: new Date().toISOString(),
      broker_notes: notes || null,
      status: 'completed',
    }).eq('id', runId);
  },

  // Broker rejects/reverses agent actions
  async reject(runId: string, notes?: string) {
    await supabase.from('ai_agent_runs').update({
      broker_reviewed: true,
      broker_approved: false,
      broker_reviewed_at: new Date().toISOString(),
      broker_notes: notes || null,
      status: 'cancelled',
      reversed: true,
    }).eq('id', runId);
  },
};
