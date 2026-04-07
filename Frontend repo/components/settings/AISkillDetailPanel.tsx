import React, { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';
import { invokeOpenAIProxy } from '../../services/openaiProxy';
import { Icon } from '../common/Icon';
import { AI_DEFAULT_TONES } from './aiSkillPresets';
import { invokeFunction } from '../../src/lib/api';

const DOC_ROLES = ['Example', 'Template', 'Knowledge', 'Style Guide', 'Negative Example'] as const;
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export interface AISkillDetailPanelProps {
  skillType: string;
  skillName: string;
  description: string;
  firmId: string;
  advisorId: string;
  onClose: () => void;
  onSaved: () => void;
}

type SkillRow = {
  id: string;
  skill_type: string;
  skill_name: string;
  is_active: boolean | null;
  last_processed_at: string | null;
  system_instructions: string | null;
  style_notes: string | null;
  tone: string | null;
  extracted_content: string | null;
};

type DocRow = {
  id: string;
  file_name: string;
  file_url: string;
  document_role: string;
  processing_status: string | null;
  ai_summary: string | null;
  file_type: string | null;
};

export const AISkillDetailPanel: React.FC<AISkillDetailPanelProps> = ({
  skillType,
  skillName,
  description,
  firmId,
  advisorId,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [skill, setSkill] = useState<SkillRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [styleNotes, setStyleNotes] = useState('');
  const [tone, setTone] = useState('Professional');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [usageMonth, setUsageMonth] = useState<number | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSkill = useCallback(async () => {
    const { data: row } = await supabase
      .from('ai_skill_library')
      .select('*')
      .eq('firm_id', firmId)
      .eq('skill_type', skillType)
      .maybeSingle();

    if (row) {
      setSkill(row as SkillRow);
      setInstructions(row.system_instructions || '');
      setStyleNotes(row.style_notes || '');
      setTone(row.tone || 'Professional');
      const { data: dlist } = await supabase
        .from('ai_skill_documents')
        .select('id, file_name, file_url, document_role, processing_status, ai_summary, file_type')
        .eq('skill_id', row.id)
        .order('created_at', { ascending: false });
      setDocs((dlist || []) as DocRow[]);

      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('ai_skill_usage_log')
        .select('*', { count: 'exact', head: true })
        .eq('firm_id', firmId)
        .eq('skill_id', row.id)
        .gte('created_at', start.toISOString());
      setUsageMonth(typeof count === 'number' ? count : null);
    } else {
      setSkill(null);
      setDocs([]);
      setUsageMonth(null);
    }
    setLoading(false);
  }, [firmId, skillType]);

  useEffect(() => {
    void loadSkill();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadSkill]);

  async function ensureSkill(): Promise<string | null> {
    if (skill?.id) return skill.id;
    const { data: created, error } = await supabase
      .from('ai_skill_library')
      .insert({
        firm_id: firmId,
        skill_type: skillType,
        skill_name: skillName,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) {
      logger.error(error);
      toast.error('Failed to create skill: ' + error.message);
      return null;
    }
    const id = created?.id as string;
    if (id) {
      await loadSkill();
    }
    return id;
  }

  async function saveInstructions() {
    if (!skill?.id) return;
    setSaving(true);
    const { error: err } = await supabase
      .from('ai_skill_library')
      .update({
        system_instructions: instructions || null,
        style_notes: styleNotes || null,
        tone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', skill.id);
    setSaving(false);
    if (err) {
      toast.error('Failed to save instructions: ' + err.message);
      return;
    }
    await loadSkill();
    toast.success('Instructions saved');
    onSaved();
  }

  function startPollingDoc(docId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('ai_skill_documents')
        .select('processing_status, ai_summary')
        .eq('id', docId)
        .single();
      const st = data?.processing_status;
      if (st === 'completed' || st === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        await loadSkill();
        onSaved();
      }
    }, 3000);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const sid = await ensureSkill();
    if (!sid) {
      alert('Could not create skill record.');
      return;
    }
    if (docs.length >= MAX_FILES) {
      alert(`Maximum ${MAX_FILES} reference documents per skill.`);
      return;
    }
    const remaining = MAX_FILES - docs.length;
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      for (const file of list) {
        if (file.size > MAX_BYTES) {
          alert(`${file.name} exceeds 10MB.`);
          continue;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const allowed = ['pdf', 'docx', 'txt'];
        if (!allowed.includes(ext)) {
          alert(`${file.name}: only PDF, DOCX, and TXT are allowed.`);
          continue;
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${firmId}/ai-skills/${skillType}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
        if (upErr) {
          logger.error(upErr);
          alert('Upload failed: ' + upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage.from('documents').getPublicUrl(path);
        const fileUrl = pub.publicUrl;

        let extractedText: string | null = null;
        if (ext === 'txt') {
          extractedText = await file.text();
        }

        const { data: ins, error: insErr } = await supabase
          .from('ai_skill_documents')
          .insert({
            skill_id: sid,
            file_name: file.name,
            file_url: fileUrl,
            file_type: file.type || null,
            document_role: 'Example',
            processing_status: 'pending',
            extracted_text: extractedText,
          })
          .select('id')
          .single();

        if (insErr || !ins?.id) {
          logger.error(insErr);
          alert('Could not save document record.');
          continue;
        }

        const { error: fnErr } = await invokeFunction('process-skill-document', {
          skill_document_id: ins.id,
        });
        if (fnErr) logger.warn('process-skill-document:', fnErr);

        startPollingDoc(ins.id);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function updateDocRole(docId: string, role: string) {
    const { error: err } = await supabase.from('ai_skill_documents').update({ document_role: role }).eq('id', docId);
    if (err) {
      toast.error('Failed to update role: ' + err.message);
      return;
    }
    await loadSkill();
    toast.success('Document role updated');
  }

  async function deleteDoc(doc: DocRow) {
    if (!confirm('Remove this reference document?')) return;
    try {
      const u = new URL(doc.file_url);
      const parts = u.pathname.split('/documents/');
      if (parts[1]) {
        await supabase.storage.from('documents').remove([decodeURIComponent(parts[1])]);
      }
    } catch {
      /* ignore path parse */
    }
    const { error: delErr } = await supabase.from('ai_skill_documents').delete().eq('id', doc.id);
    if (delErr) {
      toast.error('Failed to delete document: ' + delErr.message);
      return;
    }
    await loadSkill();
    toast.success('Document removed');
    onSaved();
  }

  async function toggleActive(next: boolean) {
    if (!skill?.id) return;
    const { error: err } = await supabase.from('ai_skill_library').update({ is_active: next }).eq('id', skill.id);
    if (err) {
      toast.error('Failed to toggle skill: ' + err.message);
      return;
    }
    setSkill((s) => (s ? { ...s, is_active: next } : s));
    toast.success(next ? 'Skill activated' : 'Skill deactivated');
    onSaved();
  }

  async function generateSample() {
    setPreviewLoading(true);
    setPreview('');
    try {
      const ctx = [
        skill?.extracted_content,
        instructions && `Instructions: ${instructions}`,
        styleNotes && `Style: ${styleNotes}`,
        `Tone: ${tone}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const { content: text } = await invokeOpenAIProxy(
        {
          model: 'gpt-4o-mini',
          temperature: 0.4,
          max_tokens: 400,
          messages: [
            {
              role: 'system',
              content:
                'You are a NZ mortgage broker drafting a short introductory paragraph for a Statement of Advice. Match the firm voice described. Plain text only.',
            },
            {
              role: 'user',
              content: `Write one introductory paragraph (3–5 sentences) for an SOA using this firm context:\n\n${ctx || 'Professional, compliant, client-first.'}`,
            },
          ],
        },
        { feature: 'ai_skill_preview', firmId },
      );
      setPreview(text || 'No output.');
    } catch (e: unknown) {
      setPreview(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2100] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close panel" onClick={onClose} />
      <aside
        className="relative w-full max-w-[600px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">{skillType}</p>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{skillName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <Icon name="X" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-8">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Skill setup</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
                {!skill ? (
                  <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-amber-900 dark:text-amber-100">
                    <strong>Get started</strong> — upload a reference document to create this skill for your firm.
                  </p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skill.is_active !== false}
                        onChange={(e) => void toggleActive(e.target.checked)}
                      />
                      <span>Active</span>
                    </label>
                    <p className="text-gray-500">
                      Last processed:{' '}
                      {skill.last_processed_at
                        ? new Date(skill.last_processed_at).toLocaleString('en-NZ')
                        : '—'}
                    </p>
                    <p className="text-gray-500">
                      Times used this month: {usageMonth != null ? usageMonth : '—'}
                    </p>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Instructions (manual override)</h3>
                <label className="block text-xs text-gray-500">System instructions for this skill</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Always include a section on interest rate risk. Use formal language..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-3"
                />
                <label className="block text-xs text-gray-500">Style notes</label>
                <textarea
                  value={styleNotes}
                  onChange={(e) => setStyleNotes(e.target.value)}
                  placeholder="e.g. Write in second person. Use client's first name in greetings..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-3"
                />
                <label className="block text-xs text-gray-500">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm p-2"
                >
                  {AI_DEFAULT_TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !skill}
                  onClick={() => void saveInstructions()}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2"
                >
                  {saving ? 'Saving…' : 'Save instructions'}
                </button>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reference documents</h3>
                <p className="text-xs text-gray-500">Up to {MAX_FILES} files, 10MB each. PDF, DOCX, or TXT.</p>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleFiles(e.dataTransfer.files);
                  }}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFiles(e.target.files)}
                  />
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Upload reference documents</p>
                  <p className="text-xs text-gray-500 mt-1">Drag SOA examples, templates, or style guides here</p>
                  {uploading && <p className="text-xs text-indigo-600 mt-2">Uploading…</p>}
                </div>

                <ul className="space-y-3">
                  {docs.map((d) => {
                    const st = d.processing_status || 'pending';
                    const badge =
                      st === 'completed'
                        ? { label: '✓ Extracted', className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' }
                        : st === 'failed'
                          ? { label: '✗ Failed', className: 'text-red-600 bg-red-50 dark:bg-red-950/50' }
                          : { label: '⏳ Processing', className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50' };
                    return (
                      <li
                        key={d.id}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2"
                      >
                        <div className="flex justify-between gap-2 items-start">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.file_name}</p>
                          <button
                            type="button"
                            onClick={() => void deleteDoc(d)}
                            className="text-xs text-red-600 hover:underline flex-shrink-0"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            value={d.document_role}
                            onChange={(e) => void updateDocRole(d.id, e.target.value)}
                            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 px-2"
                          >
                            {DOC_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
                        </div>
                        {d.ai_summary && (
                          <div>
                            <button
                              type="button"
                              className="text-xs text-indigo-600"
                              onClick={() =>
                                setExpandedSummary((m) => ({ ...m, [d.id]: !m[d.id] }))
                              }
                            >
                              {expandedSummary[d.id] ? 'Hide' : 'Show'} AI summary
                            </button>
                            {expandedSummary[d.id] && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{d.ai_summary}</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="space-y-3 pb-8">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Preview</h3>
                <p className="text-xs text-gray-500">Test this skill with a sample SOA intro paragraph.</p>
                <button
                  type="button"
                  disabled={previewLoading}
                  onClick={() => void generateSample()}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {previewLoading ? 'Generating…' : 'Generate sample SOA intro paragraph'}
                </button>
                {preview && (
                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/80 p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {preview}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
