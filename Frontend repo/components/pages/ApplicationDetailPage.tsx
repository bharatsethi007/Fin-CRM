import React, { useState, useEffect, useMemo } from 'react';
import type { Application, Client } from '../../types';
import { Button } from '../common/Button';
import { Icon, IconName } from '../common/Icon';
import { Card } from '../common/Card';
import { NeedsObjectivesTab } from '../applications/NeedsObjectivesTab';
import { applicationService, type Asset } from '../../services/api';
import ApplicantsTab from '../application/tabs/ApplicantsTab';
import AssetsTab from '../application/tabs/AssetsTab';
import LiabilitiesTab from '../application/tabs/LiabilitiesTab';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { OverviewTab } from '../applications/OverviewTab';
import { ServiceabilityTab } from '../applications/ServiceabilityTab';
import { DocumentChecklistTab } from '../applications/DocumentChecklistTab';
import { SubmissionTab } from '../applications/SubmissionTab';
import { LenderMatchTab } from '../applications/LenderMatchTab';
import { ApplicationIntelligence } from '../applications/ApplicationIntelligence';
import { SmartComplianceTab } from '../applications/SmartComplianceTab';
import FinancialProfileTab from '../applications/FinancialProfileTab';
import {
  FlowIntelligencePanel,
  type FlowOpenDetail,
} from '../flow/FlowIntelligencePanel';
import { AffordabilityCalculatorProvider } from '../common/AffordabilityCalculator';
import { IntelligenceTab } from '@/components/deals/IntelligenceTab';
import type { IssuesPanelAnomaly } from '@/components/deals/IssuesPanel';
import { IssuesPanel } from '@/components/deals/IssuesPanel';
import { useIntelligence } from '@/hooks/useIntelligence';

const TABS: { id: string; name: string; icon: IconName }[] = [
  { id: 'overview', name: 'Overview', icon: 'FileText' },
  { id: 'intelligence', name: 'Intelligence', icon: 'BarChart3' },
  { id: 'Agents', name: 'AI copilot', icon: 'Bot' },
  { id: 'financial', name: 'Financial Profile', icon: 'Wallet' },
  { id: 'assets', name: 'Assets', icon: 'Gem' },
  { id: 'liabilities', name: 'Liabilities', icon: 'Landmark' },
  { id: 'documents', name: 'Documents', icon: 'FilePlus2' },
  { id: 'needs', name: 'Needs & Objectives', icon: 'Target' },
  { id: 'compliance', name: 'Compliance', icon: 'Shield' },
  { id: 'serviceability', name: 'Serviceability', icon: 'Activity' },
  { id: 'lender-match', name: 'Lender Match', icon: 'Scale' },
  { id: 'submission', name: 'Submission', icon: 'Send' },
];

const WORKFLOW_PILL_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  conditional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  unconditional: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  settled: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
};

const STATUS_TO_WORKFLOW_STAGE: Record<string, string> = {
  'Draft': 'draft',
  'Application Submitted': 'submitted',
  'Conditional Approval': 'conditional',
  'Unconditional Approval': 'unconditional',
  'Settled': 'settled',
  'Declined': 'declined',
};

const WorkflowPill: React.FC<{ stage: string }> = ({ stage }) => {
  const normalized = (stage || 'draft').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const classes = WORKFLOW_PILL_CLASSES[normalized] ?? WORKFLOW_PILL_CLASSES.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
};


interface ApplicationDetailPageProps {
  application: Application;
  client: Client;
  onBack: () => void;
  onUpdate: () => void;
  onEditDraft?: () => void;
}

export const ApplicationDetailPage: React.FC<ApplicationDetailPageProps> = ({
  application,
  client,
  onBack,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [financialRealtimeTick, setFinancialRealtimeTick] = useState(0);
  const [documentsRealtimeTick, setDocumentsRealtimeTick] = useState(0);
  const [notesRefreshTick, setNotesRefreshTick] = useState(0);
  const currentUser = null as { id?: string } | null;



  // assets is kept for the liabilities tab dropdown (linked_asset_id selects)
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    if (activeTab === 'liabilities' && application.id) {
      applicationService.getAssets(application.id).then((data) => setAssets(data || [])).catch(() => setAssets([]));
    }
  }, [activeTab, application.id]);


  useEffect(() => {
    setNotesRefreshTick(0);
  }, [application.id]);

  const applicationId = application.id;

  const { data: intel } = useIntelligence(applicationId);

  const readiness = intel?.readiness as Record<string, unknown> | null | undefined;
  const score = Number(readiness?.total_score) || 0;
  const grade = (readiness?.score_grade as string | undefined) ?? 'F';

  const anomalies: IssuesPanelAnomaly[] = useMemo(() => {
    const rows = intel?.anomalies ?? [];
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      severity: String(row.severity ?? 'medium'),
      title: (row.title as string) ?? undefined,
      description: (row.description as string) ?? undefined,
      check_name: (row.flag_code as string) ?? undefined,
    }));
  }, [intel?.anomalies]);


  const renderOverview = () => (
    <OverviewTab
      application={application}
      client={client}
      advisorId={currentUser?.id}
      onUpdate={onUpdate}
      notesRefreshTick={notesRefreshTick}
    />
  );



  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            {renderOverview()}
          </ErrorBoundary>
        );
      case 'intelligence':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <IntelligenceTab applicationId={application.id} />
          </ErrorBoundary>
        );
      case 'Agents':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <>
              {activeTab === 'Agents' && (
                <ApplicationIntelligence
                  applicationId={application.id}
                  firmId={application.firmId ?? (application as { firm_id?: string }).firm_id ?? ''}
                  onNavigateToTab={(tab) => {
                    const map: Record<string, string> = {
                      Overview: 'overview',
                      Income: 'financial',
                      Expenses: 'financial',
                      Documents: 'documents',
                      Serviceability: 'serviceability',
                      Compliance: 'compliance',
                    };
                    setActiveTab(map[tab] ?? tab.toLowerCase());
                  }}
                />
              )}
            </>
          </ErrorBoundary>
        );
      case 'financial':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <FinancialProfileTab
              key={`financial-${application.id}-${financialRealtimeTick}`}
              applicationId={application.id}
              firmId={application.firmId ?? (application as { firm_id?: string }).firm_id ?? ''}
            />
          </ErrorBoundary>
        );
      case 'assets':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <AssetsTab application={application} currentUser={currentUser} onUpdate={onUpdate} />
          </ErrorBoundary>
        );
      case 'liabilities':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <LiabilitiesTab application={application} currentUser={currentUser} assets={assets} onUpdate={onUpdate} />
          </ErrorBoundary>
        );
      case 'documents':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <DocumentChecklistTab key={`documents-${application.id}-${documentsRealtimeTick}`} applicationId={application.id} />
          </ErrorBoundary>
        );
      case 'needs':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <NeedsObjectivesTab applicationId={application.id} firmId={application.firmId ?? (application as { firm_id?: string }).firm_id ?? ''} />
          </ErrorBoundary>
        );
      case 'compliance':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <>
              {activeTab === 'compliance' && (
                <SmartComplianceTab
                  applicationId={application.id}
                  firmId={application.firmId ?? (application as { firm_id?: string }).firm_id ?? ''}
                  advisorId={currentUser?.id}
                />
              )}
            </>
          </ErrorBoundary>
        );
      case 'serviceability':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <ServiceabilityTab applicationId={application.id} />
          </ErrorBoundary>
        );
      case 'lender-match':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <LenderMatchTab applicationId={application.id} />
          </ErrorBoundary>
        );
      case 'submission':
        return (
          <ErrorBoundary fallbackMessage="Failed to load this tab">
            <SubmissionTab applicationId={application.id} />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  const currentStage = STATUS_TO_WORKFLOW_STAGE[application.status?.toString() || ''] ?? (application.status || 'draft').toString().toLowerCase();

  const loanMeta = application as Application & { loan_purpose?: string; loanPurpose?: string };
  const loanPurposeLabel =
    loanMeta.loan_purpose?.trim() || loanMeta.loanPurpose?.trim() || 'Purchase';
  const loanK =
    application.loanAmount != null && application.loanAmount > 0
      ? `$${(application.loanAmount / 1000).toFixed(0)}k`
      : '—';

  return (
    <div className="text-gray-900 dark:text-gray-100">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button onClick={onBack} variant="secondary" leftIcon="ArrowLeft" className="flex-shrink-0">
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {client.name || 'Unknown'}
              </h1>
              <WorkflowPill stage={currentStage} />
              <IssuesPanel score={score} grade={grade} anomalies={anomalies} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {application.referenceNumber ?? '—'} · {loanPurposeLabel} · {loanK}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent<FlowOpenDetail>('flow:open', {
                detail: {
                  context: { applicationId: application.id, score, grade },
                },
              }),
            )
          }
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
        >
          ✨ Ask Flow Intelligence
        </button>
      </div>

      {/* Tabs */}
      <Card className="p-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-1 p-2 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon name={tab.icon} className="h-4 w-4 flex-shrink-0" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <main className="p-6 bg-white dark:bg-gray-800 min-h-[400px]">
          <AffordabilityCalculatorProvider>
            {renderTabContent()}
          </AffordabilityCalculatorProvider>
        </main>
      </Card>

      <FlowIntelligencePanel applicationId={application.id} />
    </div>
  );
};
