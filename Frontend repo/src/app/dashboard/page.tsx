import React from 'react';
import { BriefingStrip } from '@/components/dashboard/BriefingStrip';
import { FlowBriefing, type FlowBriefingMetric, type FlowBriefingSuggestion } from '@/components/dashboard/FlowBriefing';
import { FlowIntelligenceCard } from '@/components/dashboard/FlowIntelligenceCard';
import { KPICards, type DashboardKpiDeckProps } from '@/components/dashboard/KPICards';
import { PriorityQueue, type ApplicationRow } from '@/components/dashboard/PriorityQueue';

const PAGE_TITLE = 'text-[14px] font-semibold leading-[20px] tracking-tight text-slate-900 dark:text-slate-100';

/** Props for the firm command-centre shell wrapping dashboard widgets. */
export interface FirmDashboardPageProps {
  loading: boolean;
  briefingDateLabel: string;
  /** Subtitle under the date (e.g. Firm pipeline vs Your pipeline). */
  briefingPipelineSubtitle: string;
  briefingActiveCount: number;
  briefingAnomalyCount: number;
  briefingPipelineDisplay: string;
  onBriefingDrillActive: () => void;
  onBriefingDrillAttention: () => void;
  onBriefingDrillPipeline: () => void;
  flowReviewedApplications: number;
  flowNeedAttentionCount: number;
  flowRefixCount: number;
  flowRefixNextDays: number | null;
  briefingMetrics: FlowBriefingMetric[];
  suggestions: FlowBriefingSuggestion[];
  onNavigateFI: () => void;
  onNavigateFIWithMessage: (message: string) => void;
  kpiDeck: DashboardKpiDeckProps;
  firmId: string;
  /** When set, Flow Briefing anomalies are limited to applications assigned to this adviser. */
  anomalyScopeAdviserId?: string | null;
  priorityQueueLoading: boolean;
  priorityQueueApplications: ApplicationRow[];
  firmView: boolean;
  onApplicationOpen: (applicationId: string) => void;
  /** Keeps briefing strip in sync when Flow Briefing refetches open anomaly count. */
  onBriefingAnomalyCountChange?: (count: number) => void;
  children: React.ReactNode;
}

/** Firm-level dashboard shell: briefing strip, Flow card, KPI strip, priority queue, then bottom widgets. */
export function FirmDashboardPage({
  loading,
  briefingDateLabel,
  briefingPipelineSubtitle,
  briefingActiveCount,
  briefingAnomalyCount,
  briefingPipelineDisplay,
  onBriefingDrillActive,
  onBriefingDrillAttention,
  onBriefingDrillPipeline,
  flowReviewedApplications,
  flowNeedAttentionCount,
  flowRefixCount,
  flowRefixNextDays,
  briefingMetrics,
  suggestions,
  onNavigateFI,
  onNavigateFIWithMessage,
  kpiDeck,
  firmId,
  anomalyScopeAdviserId,
  priorityQueueLoading,
  priorityQueueApplications,
  firmView,
  onApplicationOpen,
  onBriefingAnomalyCountChange,
  children,
}: FirmDashboardPageProps) {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-sm text-slate-900 dark:bg-[var(--bg-primary)] dark:text-[var(--text-primary)]">
      <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8">
        <BriefingStrip
          loading={loading}
          dateLabel={briefingDateLabel}
          pipelineSubtitle={briefingPipelineSubtitle}
          activeCount={briefingActiveCount}
          needAttentionCount={briefingAnomalyCount}
          pipelineValueDisplay={briefingPipelineDisplay}
          onDrillActive={onBriefingDrillActive}
          onDrillAttention={onBriefingDrillAttention}
          onDrillPipeline={onBriefingDrillPipeline}
        />
      </div>

      <div className="mx-auto max-w-[1600px]">
        <div className="border-b border-slate-200 px-4 pb-3 pt-4 dark:border-slate-700/50 lg:px-8">
          <h1 className={PAGE_TITLE}>Firm command</h1>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4 lg:px-8 lg:py-5">
          <FlowIntelligenceCard
            loading={loading}
            reviewedApplications={flowReviewedApplications}
            needAttentionCount={flowNeedAttentionCount}
            refixCount={flowRefixCount}
            refixNextDays={flowRefixNextDays}
            briefingMetrics={briefingMetrics}
            suggestions={suggestions}
            onOpenFlow={onNavigateFI}
            onOpenFlowWithMessage={onNavigateFIWithMessage}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <KPICards {...kpiDeck} />
            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
              <PriorityQueue
                loading={priorityQueueLoading}
                applications={priorityQueueApplications}
                firmView={firmView}
                onApplicationOpen={onApplicationOpen}
              />
              <FlowBriefing
                firmId={firmId}
                scopeAdviserId={anomalyScopeAdviserId ?? undefined}
                onOpenIssueCountChange={onBriefingAnomalyCountChange}
              />
            </div>
          </div>
        </div>

        <div className="px-4 pb-8 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
