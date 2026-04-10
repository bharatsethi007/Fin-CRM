import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AgentCanvas } from './AgentCanvas';
import { EvidencePanel } from './EvidencePanel';
import { SOALayersPreview } from './SOALayersPreview';
import { soaLenderCodeToName } from './soaLenderCatalog';
import { supabase } from '../../src/lib/supabase';
import type { SoaClientDnaView } from './soaClientDnaTypes';
import { useSOAGenerateWorkspace } from './useSOAGenerateWorkspace';

/** Re-export for callers that configure DNA situation tags alongside the SOA popup. */
export { SITUATION_OPTIONS } from './soaDnaSituations';

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Card-shaped SOA summary passed when opening the editor (`View`). */
export type SoaPopupInitialData = {
  id?: string;
  status?: string;
  version?: number;
  updated_at?: string | null;
  recommended_lender?: string;
  content?: unknown;
} | null;

type Props = {
  open: boolean;
  /** @deprecated Prefer `onOpenChange` for controlled dialogs. */
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  applicationId?: string;
  /** Alias for `applicationId` (deal / application row id). */
  dealId?: string;
  firmId: string;
  /** Reserved for future fact-find linkage; accepted for API parity. */
  factFindId?: string | null;
  /** When set without `initialData.id`, opens workspace for this SOA row. */
  focusSoaId?: string | null;
  /** When `mode="edit"`, `initialData.id` selects the SOA to load. */
  initialData?: SoaPopupInitialData;
  /** `edit` = all layers as textareas + Save version; `run` = agent entry + workspace. */
  mode?: 'run' | 'edit';
};

type Phase = 'idle' | 'running' | 'done' | 'error';

type WorkspaceProps = {
  soaId: string;
  firmId: string;
  applicationId: string;
  onWorkspaceClose: () => void;
  mode: 'run' | 'edit';
  selectedSituations: string[];
  onSelectedSituationsChange: Dispatch<SetStateAction<string[]>>;
  persistedDnaAnalysis: SoaClientDnaView | null;
  persistedDnaUpdatedAt: string | null;
  dnaLoading: boolean;
  onClientDnaRefresh: () => void | Promise<void>;
};

/** Three-column SOA workspace: agent timeline, editable layers, evidence & approve. */
function SOAPopupWorkspace({
  soaId,
  firmId,
  applicationId,
  onWorkspaceClose,
  mode,
  selectedSituations,
  onSelectedSituationsChange,
  persistedDnaAnalysis,
  persistedDnaUpdatedAt,
  dnaLoading,
  onClientDnaRefresh,
}: WorkspaceProps) {
  const ws = useSOAGenerateWorkspace({
    soaId,
    firmId,
    applicationId,
    onClose: onWorkspaceClose,
    selectedSituations,
    persistedDnaAnalysis,
    persistedDnaUpdatedAt,
    onClientDnaRefresh,
  });
  const isEdit = mode === 'edit';

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="h-full min-h-0 basis-1/4 border-r border-gray-200">
        <AgentCanvas
          soaId={soaId}
          firmId={firmId}
          clientDna={ws.clientDnaView}
          dnaUpdatedAt={ws.clientDnaUpdatedAt}
          dnaLoading={dnaLoading}
        />
      </div>
      <div className="flex h-full min-h-0 min-w-0 basis-[45%] flex-col border-r border-gray-200">
        {isEdit ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <Button
              type="button"
              size="sm"
              disabled={ws.savingVersion}
              onClick={() => void ws.saveSoaVersionSnapshot()}
            >
              {ws.savingVersion ? 'Saving…' : 'Save version'}
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
          <SOALayersPreview
            soa={ws.soa ?? undefined}
            steps={ws.steps}
            register={ws.register}
            onLayerBlur={ws.onLayerBlur}
            allLayersEditable={isEdit}
            clientDna={ws.clientDnaView}
            onRunDna={ws.handleRunDna}
            runningDna={ws.runningDna}
            selectedDnaSituations={selectedSituations}
            onSelectedDnaSituationsChange={onSelectedSituationsChange}
            applicationId={applicationId}
            lenderSelection={{
              allLenders: ws.soaLenderCatalog,
              agentShortlistCodes: ws.agentShortlistCodes,
              selectedLenders: ws.selectedLenderCodes,
              onSelectedChange: ws.setSelectedLenderCodes,
              needsRecalc: ws.needsLenderRecalc,
              onMarkNeedsRecalc: () => ws.setNeedsLenderRecalc(true),
              onRecalcCosts: ws.handleRecalcCosts,
              recalcBusy: ws.recalcBusy,
            }}
          />
          </div>
        </div>
      </div>
      <div className="h-full min-h-0 basis-[30%]">
        <EvidencePanel
          applicationId={applicationId}
          soaId={soaId}
          firmId={firmId}
          steps={ws.steps}
          reasons={ws.reasons}
          risks={ws.risks}
          structures={ws.structures}
          reasonKey={ws.reasonKey}
          riskKeys={ws.riskKeys}
          structureKey={ws.structureKey}
          onReasonSelect={ws.handleReasonSelect}
          onRiskToggle={ws.toggleRiskKey}
          onRiskClear={ws.clearRiskKeys}
          onStructureSelect={ws.handleStructureSelect}
          onRecommendedLenderChange={ws.handleRecommendedLenderSelect}
          recommendedLenderValue={ws.lenderOverrideCode ? ws.lenderOverrideCode : '__agent__'}
          selectedLenderCodes={ws.selectedLenderCodes}
          lenderCodeToName={soaLenderCodeToName}
          onApprove={ws.handleApprove}
          approving={ws.approving}
          compliancePct={ws.compliancePct}
        />
      </div>
    </div>
  );
}

/** Hosts the SOA agent run flow and 3-column live workspace with live layer saves. */
export function GenerateSOAPopup({
  open,
  onClose,
  onOpenChange,
  applicationId,
  dealId,
  firmId,
  factFindId: _factFindId = null,
  focusSoaId = null,
  initialData = null,
  mode = 'run',
}: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const appId = (dealId ?? applicationId ?? '').trim();
  const [phase, setPhase] = useState<Phase>('idle');
  const [soaId, setSoaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSituations, setSelectedSituations] = useState<string[]>([]);
  const [dna, setDna] = useState<SoaClientDnaView | null>(null);
  const [dnaUpdatedAt, setDnaUpdatedAt] = useState<string | null>(null);
  const [dnaLoading, setDnaLoading] = useState(true);

  /** Loads `soa_client_dna` for the application so Agent Canvas + Step 0 stay in sync with the DB row. */
  const loadDna = useCallback(async () => {
    const id = (dealId ?? applicationId ?? '').trim();
    if (!id) {
      setDna(null);
      setDnaUpdatedAt(null);
      setDnaLoading(false);
      return;
    }
    setDnaLoading(true);
    try {
      const { data, error } = await supabase
        .from('soa_client_dna')
        .select('analysis, updated_at')
        .eq('deal_id', id)
        .maybeSingle();
      if (error) {
        setDna(null);
        setDnaUpdatedAt(null);
        return;
      }
      if (data?.analysis != null && typeof data.analysis === 'object') {
        setDna(data.analysis as SoaClientDnaView);
      } else {
        setDna(null);
      }
      setDnaUpdatedAt(typeof data?.updated_at === 'string' ? data.updated_at : null);
    } finally {
      setDnaLoading(false);
    }
  }, [applicationId, dealId]);

  /** Resets popup state and notifies parent (controlled `open`). */
  const dismiss = useCallback(() => {
    setPhase('idle');
    setSoaId(null);
    setError(null);
    onOpenChange?.(false);
    onClose?.();
  }, [onClose, onOpenChange]);

  /** Runs live SOA agent and opens the workspace. */
  async function runAgent() {
    if (!appId) {
      toast.error('Missing application id');
      return;
    }
    setError(null);
    setPhase('running');
    try {
      const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/run-soa-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ application_id: appId, firm_id: firmId }),
      });
      const data = (await res.json()) as { success?: boolean; soa_id?: string; error?: string };
      if (!res.ok || !data.success || !data.soa_id) throw new Error(data.error || 'Failed to start SOA agent');
      setSoaId(data.soa_id);
      setPhase('done');
      toast.success('SOA agent started');
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Failed to run SOA agent');
    }
  }

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setSoaId(null);
      setError(null);
      return;
    }
    const fromInitial = initialData?.id?.trim() || null;
    const focus = fromInitial || focusSoaId || null;
    if (mode === 'edit' && focus) {
      setSoaId(focus);
      setPhase('done');
      return;
    }
    if (mode === 'run' && focusSoaId) {
      setSoaId(focusSoaId);
      setPhase('done');
      return;
    }
    setSoaId(null);
    setPhase('idle');
  }, [open, focusSoaId, initialData?.id, mode]);

  /** Refetch saved Client DNA when the dialog opens so reopen shows latest analysis. */
  useEffect(() => {
    if (!open || !appId) return;
    void queryClient.invalidateQueries({ queryKey: ['soa-client-dna', appId] });
  }, [open, appId, queryClient]);

  /** Popup-local DNA row — persists across workspace mount and refreshes after edge save. */
  useEffect(() => {
    if (!open) {
      setDna(null);
      setDnaUpdatedAt(null);
      setDnaLoading(true);
      return;
    }
    if (!appId.trim()) {
      setDna(null);
      setDnaUpdatedAt(null);
      setDnaLoading(false);
      return;
    }
    void loadDna();
  }, [open, appId, loadDna]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? dismiss() : undefined)}>
      <DialogContent className="h-[90vh] w-[1400px] max-w-[95vw] overflow-hidden p-0">
        {!soaId ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
            <DialogHeader className="mb-0 space-y-3">
              <DialogTitle className="text-2xl">Generate Statement of Advice</DialogTitle>
              <DialogDescription className="max-w-2xl text-base">
                The AI agent will scan your Knowledge Bank, run RBNZ compliance checks, calculate a 5-year cost
                comparison, and draft a full FMA-ready SOA.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => void runAgent()} disabled={phase === 'running'} className="min-w-44">
              {phase === 'running' ? 'Starting Agent...' : 'Run SOA Agent'}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <SOAPopupWorkspace
            soaId={soaId}
            firmId={firmId}
            applicationId={appId}
            onWorkspaceClose={dismiss}
            mode={mode}
            selectedSituations={selectedSituations}
            onSelectedSituationsChange={setSelectedSituations}
            persistedDnaAnalysis={dna}
            persistedDnaUpdatedAt={dnaUpdatedAt}
            dnaLoading={dnaLoading}
            onClientDnaRefresh={loadDna}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
