import React from 'react';
import { Icon } from '../../../components/common/Icon';

export interface BriefingStripProps {
  loading: boolean;
  dateLabel: string;
  pipelineSubtitle: string;
  activeCount: number;
  needAttentionCount: number;
  pipelineValueDisplay: string;
  onDrillActive: () => void;
  onDrillAttention: () => void;
  onDrillPipeline: () => void;
}

export const BriefingStrip: React.FC<BriefingStripProps> = ({
  loading,
  dateLabel,
  pipelineSubtitle,
  activeCount,
  needAttentionCount,
  pipelineValueDisplay,
  onDrillActive,
  onDrillAttention,
  onDrillPipeline,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 lg:px-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{dateLabel}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Today's Briefing</span>
        </div>
        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
        <div className="flex items-center gap-6">
          <button onClick={onDrillActive} className="flex flex-col items-start group">
            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">
              {loading ? '...' : activeCount}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-tight font-bold">Active files</span>
          </button>
          <button onClick={onDrillAttention} className="flex flex-col items-start group">
            <span className="text-sm font-bold text-amber-600 dark:text-amber-500 group-hover:text-amber-700 transition-colors flex items-center gap-1">
              {loading ? '...' : needAttentionCount}
              {needAttentionCount > 0 && <Icon name="AlertCircle" className="h-3 w-3" />}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-tight font-bold">Needs attention</span>
          </button>
        </div>
      </div>

      <button onClick={onDrillPipeline} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 px-4 py-2 rounded-xl transition-colors border border-slate-200 dark:border-slate-700/50">
        <div className="flex flex-col items-end">
          <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
            {loading ? '...' : pipelineValueDisplay}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-tighter font-bold">{pipelineSubtitle}</span>
        </div>
        <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
          <Icon name="ArrowRight" className="h-4 w-4" />
        </div>
      </button>
    </div>
  );
};
