import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { AIOrchestrator } from '../../services/AIOrchestrator';
import { usePdfGenerator } from '../../hooks/usePdfGenerator';
import { PdfPreviewModal } from '../applications/PdfPreviewModal';
import { AIFeedbackRating } from '../common/AIFeedbackRating';
import { useToast } from '../../hooks/useToast';

interface Props {
  applicationId: string;
  firmId: string;
  advisorId?: string;
}

interface ComplianceItem {
  key: string;
  group: string;
  label: string;
  description: string;
  regulatory_basis: string;
  field: string;
  date_field?: string;
  smart_actions: SmartAction[];
  completed: boolean;
  completed_date?: string;
  blocking: boolean;
}

interface SmartAction {
  label: string;
  type: 'ai_generate' | 'mark_done' | 'create_task' | 'navigate' | 'request_doc';
  icon: string;
  color: string;
}

type ComplianceData = Record<string, any>;

export const SmartComplianceTab: React.FC<Props> = ({ applicationId, firmId, advisorId }) => {
  const [data, setData] = useState<ComplianceData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ key: string; content: string } | null>(null);
  const [aiFeedbackFeature, setAiFeedbackFeature] = useState<string | null>(null);
  const [complianceId, setComplianceId] = useState<string | null>(null);
  const { generating, preview, error: pdfError, generate, closePreview, approve, download } = usePdfGenerator();
  const toast = useToast();

  useEffect(() => { load(); }, [applicationId]);

  async function load() {
    setLoading(true);
    const { data: comp } = await supabase
      .from('compliance_checklists')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (comp) {
      setData(comp);
      setComplianceId(comp.id);
    } else {
      // Auto-create compliance record
      const { data: created } = await supabase
        .from('compliance_checklists')
        .insert({ application_id: applicationId, firm_id: firmId })
        .select('*').single();
      if (created) { setData(created); setComplianceId(created.id); }
    }
    setLoading(false);
  }

  async function toggle(field: string, value: boolean, dateField?: string) {
    setSaving(field);
    try {
      const update: any = { [field]: value };
      if (dateField && value) update[dateField] = new Date().toISOString().split('T')[0];
      if (dateField && !value) update[dateField] = null;
      const { error } = await supabase.from('compliance_checklists').update({ ...update, updated_at: new Date().toISOString() }).eq('id', complianceId);
      if (error) throw error;
      setData(prev => ({ ...prev, ...update }));
      toast.success('Compliance item updated');
      await load();

      // Invalidate intelligence cache so it recalculates
      await supabase.rpc('update_intelligence_state', {
        p_application_id: applicationId, p_items: [], p_blocking: 0, p_warning: 0, p_passed: 0,
      });
    } catch (err: any) {
      toast.error('Failed to update compliance: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(null);
    }
  }

  async function runAI(key: string, feature: string, options: any = {}) {
    setAiRunning(key);
    setAiResult(null);
    setAiFeedbackFeature(null);
    try {
      const result = await AIOrchestrator.run(feature as any, applicationId, { firmId, advisorId, forceRefresh: true, ...options });
      if (result.success && result.data) {
        let content = '';
        if (feature === 'needs_objectives_draft') content = result.data.primary_objective + '\n\n' + (result.data.needs_identified || []).join('\n');
        else if (feature === 'compliance_narrative') content = result.data.affordability_summary || result.data.cccfa_conclusion;
        else content = JSON.stringify(result.data, null, 2);
        setAiResult({ key, content });
        setAiFeedbackFeature(feature);

        try {
          await supabase.rpc('save_intelligence_output', {
            p_application_id: applicationId,
            p_feature: feature === 'needs_objectives_draft' ? 'needs_objectives_draft' : feature,
            p_output: result.data,
            p_model: result.model || 'gpt-4o-mini',
            p_prompt_tokens: result.tokensUsed || 0,
            p_completion_tokens: 0,
          });
        } catch (e) {
          logger.warn('Could not save AI output to intelligence state:', e);
        }
        toast.success('AI content generated');
      } else {
        toast.error('Failed to generate AI content: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error('Failed to generate AI content: ' + (err?.message || 'Unknown error'));
    } finally {
      setAiRunning(null);
    }
  }

  const ITEMS: ComplianceItem[] = [
    {
      key: 'disclosure', group: 'FMC Act', label: 'Disclosure Statement',
      description: 'Client must receive a disclosure statement before advice is given.',
      regulatory_basis: 'FMC Act 2013, s.431K',
      field: 'disclosure_statement_provided', date_field: 'disclosure_statement_date',
      blocking: true,
      completed: !!data.disclosure_statement_provided,
      completed_date: data.disclosure_statement_date,
      smart_actions: [
        { label: 'Generate PDF', type: 'ai_generate', icon: '✨', color: '#6366f1' },
        { label: 'Mark as provided', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'disclosure_signed', group: 'FMC Act', label: 'Disclosure Signed by Client',
      description: 'Client signature confirming receipt of disclosure.',
      regulatory_basis: 'FMC Act 2013, s.431K',
      field: 'disclosure_signed', date_field: 'disclosure_signed_date',
      blocking: false,
      completed: !!data.disclosure_signed,
      completed_date: data.disclosure_signed_date,
      smart_actions: [
        { label: 'Mark as signed', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Request signature', type: 'request_doc', icon: '📨', color: '#2563eb' },
      ],
    },
    {
      key: 'needs_objectives', group: 'FAA', label: 'Needs & Objectives',
      description: 'Document client goals and financial objectives before providing advice.',
      regulatory_basis: 'Financial Advisers Act 2008',
      field: 'needs_objectives_completed',
      blocking: true,
      completed: !!data.needs_objectives_completed,
      smart_actions: [
        { label: 'AI Draft', type: 'ai_generate', icon: '✨', color: '#6366f1' },
        { label: 'Mark complete', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Generate PDF', type: 'ai_generate', icon: '📄', color: '#0ea5e9' },
      ],
    },
    {
      key: 'soa', group: 'FAA', label: 'Statement of Advice Prepared',
      description: 'Written advice document provided to client.',
      regulatory_basis: 'Financial Advisers Act 2008',
      field: 'soa_prepared', date_field: 'soa_date',
      blocking: false,
      completed: !!data.soa_prepared,
      completed_date: data.soa_date,
      smart_actions: [
        { label: 'AI Draft SOA', type: 'ai_generate', icon: '✨', color: '#6366f1' },
        { label: 'Mark complete', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'kyc_identity', group: 'AML/CFT', label: 'Identity Verified (KYC)',
      description: 'Verify client identity using an approved identity document.',
      regulatory_basis: 'AML/CFT Act 2009',
      field: 'kyc_identity_verified', date_field: 'kyc_identity_verified_date',
      blocking: true,
      completed: !!data.kyc_identity_verified,
      completed_date: data.kyc_identity_verified_date,
      smart_actions: [
        { label: 'Mark as verified', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Request ID document', type: 'request_doc', icon: '📨', color: '#2563eb' },
      ],
    },
    {
      key: 'kyc_address', group: 'AML/CFT', label: 'Address Verified',
      description: 'Verify client address with a utility bill or bank statement.',
      regulatory_basis: 'AML/CFT Act 2009',
      field: 'kyc_address_verified',
      blocking: false,
      completed: !!data.kyc_address_verified,
      smart_actions: [
        { label: 'Mark as verified', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Request proof', type: 'request_doc', icon: '📨', color: '#2563eb' },
      ],
    },
    {
      key: 'kyc_aml', group: 'AML/CFT', label: 'AML/PEP Check',
      description: 'Screen client against sanctions and politically exposed persons lists.',
      regulatory_basis: 'AML/CFT Act 2009',
      field: 'kyc_aml_checked',
      blocking: false,
      completed: !!data.kyc_aml_checked,
      smart_actions: [
        { label: 'Mark as done', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'cccfa_income', group: 'CCCFA', label: 'Income Verified',
      description: 'Verify declared income against payslips or bank statements.',
      regulatory_basis: 'CCCFA 2003',
      field: 'cccfa_income_verified',
      blocking: true,
      completed: !!data.cccfa_income_verified,
      smart_actions: [
        { label: 'Mark as verified', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Parse bank statement', type: 'navigate', icon: '✨', color: '#6366f1' },
      ],
    },
    {
      key: 'cccfa_expenses', group: 'CCCFA', label: 'Expenses Verified',
      description: 'Verify declared expenses meet CCCFA affordability requirements.',
      regulatory_basis: 'CCCFA 2003',
      field: 'cccfa_expenses_verified',
      blocking: true,
      completed: !!data.cccfa_expenses_verified,
      smart_actions: [
        { label: 'Mark as verified', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'cccfa_affordability', group: 'CCCFA', label: 'Affordability Assessment',
      description: 'Document the CCCFA affordability assessment and its outcome.',
      regulatory_basis: 'CCCFA 2003',
      field: 'cccfa_affordability_assessed',
      blocking: true,
      completed: !!data.cccfa_affordability_assessed,
      smart_actions: [
        { label: 'AI Generate', type: 'ai_generate', icon: '✨', color: '#6366f1' },
        { label: 'Mark complete', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'cccfa_credit', group: 'CCCFA', label: 'Credit Check',
      description: 'Run a credit check as part of CCCFA affordability assessment.',
      regulatory_basis: 'CCCFA 2003',
      field: 'cccfa_credit_checked',
      blocking: false,
      completed: !!data.cccfa_credit_checked,
      smart_actions: [
        { label: 'Mark as done', type: 'mark_done', icon: '✓', color: '#059669' },
        { label: 'Create task', type: 'create_task', icon: '📋', color: '#7c3aed' },
      ],
    },
    {
      key: 'cccfa_hardship', group: 'CCCFA', label: 'Hardship Discussion',
      description: 'Discuss what happens if the client cannot meet repayments.',
      regulatory_basis: 'CCCFA 2003',
      field: 'cccfa_hardship_discussed',
      blocking: false,
      completed: !!data.cccfa_hardship_discussed,
      smart_actions: [
        { label: 'Mark as discussed', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
    {
      key: 'authority', group: 'Authority', label: 'Client Authority to Act',
      description: 'Client has given written authority for the adviser to act on their behalf.',
      regulatory_basis: 'FMC Act 2013',
      field: 'client_authority_obtained',
      blocking: false,
      completed: !!data.client_authority_obtained,
      smart_actions: [
        { label: 'Generate authority form', type: 'ai_generate', icon: '📄', color: '#6366f1' },
        { label: 'Mark as obtained', type: 'mark_done', icon: '✓', color: '#059669' },
      ],
    },
  ];

  async function generatePDF(docType: 'soa_full' | 'disclosure_statement' | 'needs_objectives' = 'soa_full') {
    await generate(applicationId, docType);
  }

  async function handleAction(item: ComplianceItem, action: SmartAction) {
    if (action.type === 'mark_done') {
      await toggle(item.field, true, item.date_field);
    } else if (action.label === 'Generate PDF' && aiResult?.key === item.key) {
      const typeMap: Record<string, any> = {
        disclosure: 'disclosure_statement',
        needs_objectives: 'needs_objectives',
      };
      await generatePDF(typeMap[item.key] || 'soa_full');
      return;
    } else if (action.type === 'ai_generate') {
      const featureMap: Record<string, string> = {
        'needs_objectives': 'needs_objectives_draft',
        'cccfa_affordability': 'compliance_narrative',
        'disclosure': 'compliance_narrative',
        'soa': 'advice_summary',
      };
      await runAI(item.key, featureMap[item.key] || 'compliance_narrative');
    } else if (action.type === 'create_task') {
      setSaving(item.key);
      try {
        const { error } = await supabase.from('tasks').insert({
          application_id: applicationId, firm_id: firmId, assigned_to: advisorId,
          title: item.label + ' — ' + item.regulatory_basis,
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
          priority: item.blocking ? 'high' : 'medium', status: 'pending',
        });
        if (error) throw error;
        toast.success('Task created');
        await load();
      } catch (err: any) {
        toast.error('Failed to create task: ' + (err?.message || 'Unknown error'));
      } finally {
        setSaving(null);
      }
    }
  }

  const groups = ['FMC Act', 'FAA', 'AML/CFT', 'CCCFA', 'Authority'];
  const completedCount = ITEMS.filter(i => i.completed).length;
  const blockingCount = ITEMS.filter(i => i.blocking && !i.completed).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center' }}>
      <div style={{ width: 16, height: 16, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: 13, color: '#64748b' }}>Loading compliance...</span>
    </div>
  );

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip label={completedCount + '/' + ITEMS.length + ' complete'} color="#059669" bg="#f0fdf4" border="#a7f3d0" />
          {blockingCount > 0 && <Chip label={blockingCount + ' blocking submission'} color="#dc2626" bg="#fef2f2" border="#fecaca" />}
        </div>
      </div>

      {/* AI result panel */}
      {aiResult && (
        <div style={{ padding: '14px 16px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>✨ AI Draft — Review before saving</span>
            <button onClick={() => { setAiResult(null); setAiFeedbackFeature(null); }} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Dismiss</button>
          </div>
          <p style={{ fontSize: 12, color: '#1e293b', margin: '0 0 10px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{aiResult.content}</p>
          {aiFeedbackFeature && advisorId && (
            <div style={{ marginBottom: 12 }}>
              <AIFeedbackRating
                firmId={firmId}
                advisorId={advisorId}
                applicationId={applicationId}
                feature={aiFeedbackFeature}
              />
            </div>
          )}
          <button
            disabled={!!saving}
            onClick={async () => {
              setSaving('ai_accept');
              try {
                if (aiResult?.content) {
                  const { error } = await supabase.from('application_intelligence')
                    .update({ needs_objectives_draft: aiResult.key === 'needs_objectives' ? { primary_objective: aiResult.content } : undefined })
                    .eq('application_id', applicationId);
                  if (error) throw error;
                  await load();
                }
                const fieldMap: Record<string, string> = { needs_objectives: 'needs_objectives_completed', cccfa_affordability: 'cccfa_affordability_assessed', disclosure: 'disclosure_statement_provided', soa: 'soa_prepared', authority: 'client_authority_obtained' };
                const f = fieldMap[aiResult!.key];
                if (f) await toggle(f, true);
                setAiResult(null);
                setAiFeedbackFeature(null);
              } catch (err: any) {
                toast.error('Failed to save AI result: ' + (err?.message || 'Unknown error'));
              } finally {
                setSaving(null);
              }
            }}
            style={{ fontSize: 12, fontWeight: 600, color: 'white', background: saving === 'ai_accept' ? '#818cf8' : '#6366f1', border: 'none', borderRadius: 7, padding: '6px 16px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving === 'ai_accept' ? 'Saving...' : 'Mark as complete'}
          </button>
        </div>
      )}

      {/* Groups */}
      {groups.map(group => {
        const groupItems = ITEMS.filter(i => i.group === group);
        const done = groupItems.filter(i => i.completed).length;
        return (
          <div key={group} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{group}</span>
              <span style={{ fontSize: 11, color: done === groupItems.length ? '#059669' : '#94a3b8' }}>{done}/{groupItems.length}</span>
              <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupItems.map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'white', border: '1px solid ' + (item.completed ? '#e2e8f0' : item.blocking ? '#fecaca' : '#e2e8f0'), borderRadius: 10, opacity: item.completed ? 0.75 : 1, transition: 'all 0.15s' }}>

                  {/* Checkbox */}
                  <button
                    onClick={() => toggle(item.field, !item.completed, item.date_field)}
                    disabled={saving === item.field}
                    style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid ' + (item.completed ? '#10b981' : item.blocking ? '#f87171' : '#cbd5e1'), background: item.completed ? '#10b981' : 'white', cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11 }}
                  >
                    {item.completed ? '✓' : ''}
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: item.completed ? '#64748b' : '#0f172a', textDecoration: item.completed ? 'line-through' : 'none' }}>
                        {item.label}
                      </span>
                      {item.blocking && !item.completed && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 20, border: '1px solid #fecaca' }}>Required</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px' }}>{item.description}</p>
                    <p style={{ fontSize: 10, color: '#c7d2fe', margin: 0, fontFamily: 'mono' }}>{item.regulatory_basis}</p>
                    {item.completed && item.completed_date && (
                      <p style={{ fontSize: 10, color: '#10b981', margin: '3px 0 0' }}>✓ Done {new Date(item.completed_date).toLocaleDateString('en-NZ')}</p>
                    )}
                  </div>

                  {/* Smart actions */}
                  {!item.completed && (
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 240 }}>
                      {item.smart_actions.map((action, ai) => (
                        <button
                          key={ai}
                          onClick={() => {
                            if (action.label === 'Generate PDF') {
                              const typeMap: Record<string, any> = {
                                disclosure: 'disclosure_statement',
                                needs_objectives: 'needs_objectives',
                              };
                              generatePDF(typeMap[item.key] || 'soa_full');
                            } else {
                              handleAction(item, action);
                            }
                          }}
                          disabled={
                            action.label === 'Generate PDF' ? generating :
                            action.type === 'ai_generate' ? !!aiRunning :
                            !!saving
                          }
                          style={{ fontSize: 11, fontWeight: 500, color: action.color, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: (action.label === 'Generate PDF' ? generating : action.type === 'ai_generate' ? !!aiRunning : !!saving) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', opacity: (action.label === 'Generate PDF' ? generating : action.type === 'ai_generate' ? !!aiRunning : !!saving) ? 0.6 : 1 }}
                        >
                          {(aiRunning === item.key && action.type === 'ai_generate') || (saving === item.field && action.type === 'mark_done') || (saving === item.key && action.type === 'create_task')
                            ? <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid ' + action.color, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            : action.icon}
                          {action.label === 'Generate PDF'
                            ? (generating ? 'Generating...' : '📄 Generate PDF')
                            : action.type === 'mark_done' && saving === item.field
                              ? 'Saving...'
                              : action.type === 'create_task' && saving === item.key
                                ? 'Creating...'
                                : aiRunning === item.key && action.type === 'ai_generate'
                                  ? 'Running...'
                                  : action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {preview && (
        <PdfPreviewModal
          preview={preview}
          generating={generating}
          onClose={closePreview}
          onApprove={approve}
          onDownload={download}
          onRegenerate={() => generate(applicationId, preview.docType, true)}
          feedbackMeta={
            advisorId
              ? {
                  firmId,
                  advisorId,
                  applicationId,
                  feature:
                    preview.docType === 'soa_full'
                      ? 'advice_summary'
                      : preview.docType === 'needs_objectives'
                        ? 'needs_objectives_draft'
                        : 'compliance_narrative',
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: '1px solid ' + border, padding: '3px 10px', borderRadius: 20 }}>
      {label}
    </span>
  );
}
