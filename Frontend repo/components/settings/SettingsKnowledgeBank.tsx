import { useMemo, useState } from 'react';
import { Icon } from '../common/Icon';
import { useToast } from '../../hooks/useToast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogCancelButton,
  AlertDialogDestructiveAction,
} from '../ui/alert-dialog';
import { Input } from '../ui/input';
import { LenderPolicyDialog } from './knowledge-bank/LenderPolicyDialog';
import { type LenderPolicyFormValues, useAddLenderPolicy, useDeleteLenderPolicy, useExtractPolicy, useLenderPolicies, useUpdateLenderPolicy } from './useKnowledgeBank';

const emptyValues: LenderPolicyFormValues = {
  lender_name: null,
  min_deposit_owner_pct: null,
  min_deposit_investor_pct: null,
  new_build_deposit_pct: null,
  max_dti: null,
  test_rate: null,
  income_shading: { self_employed: null, rental: null, boarder: null },
  accepts_boarder_income: false,
  accepts_gifted_deposit: false,
  max_term_years: null,
  construction_policy: null,
  cashback_available: false,
  clawback_months: null,
  commission_upfront_pct: null,
  commission_trail_pct: null,
  adviser_notes: null,
};

type Props = { firmId: string };

/** Renders lender policy management page for the firm knowledge bank. */
export function SettingsKnowledgeBank({ firmId }: Props) {
  const toast = useToast();
  const { data: policies = [] } = useLenderPolicies(firmId);
  const addPolicy = useAddLenderPolicy(firmId);
  const updatePolicy = useUpdateLenderPolicy();
  const deletePolicy = useDeleteLenderPolicy(firmId);
  const extractPolicy = useExtractPolicy(firmId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<LenderPolicyFormValues>(emptyValues);
  const [uploadLenderName, setUploadLenderName] = useState('');

  const selectedPolicy = useMemo(() => policies.find((row) => row.id === selectedId), [policies, selectedId]);

  /** Opens blank add dialog state. */
  function openAddDialog() {
    setMode('add');
    setSelectedId(null);
    setInitialValues(emptyValues);
    setDialogOpen(true);
  }

  /** Handles form save for add and edit modes. */
  async function handleSave(values: LenderPolicyFormValues) {
    try {
      if (mode === 'edit' && selectedPolicy) await updatePolicy.mutateAsync({ id: selectedPolicy.id, values, firmId });
      else await addPolicy.mutateAsync(values);
      toast.success('Lender policy saved');
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save lender policy');
    }
  }

  /** Handles extraction upload and opens pre-filled dialog. */
  async function handleUpload(file?: File | null) {
    if (!file) return;
    try {
      const extracted = await extractPolicy.mutateAsync({ file, lenderName: uploadLenderName });
      setMode('add');
      setSelectedId(null);
      setInitialValues({ ...emptyValues, ...extracted });
      setDialogOpen(true);
      toast.success('Policy extracted. Please review before saving.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to extract policy');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">Knowledge Bank</h2>
        <div className="flex items-center gap-2">
          <Input placeholder="Lender name (for upload path)" value={uploadLenderName} onChange={(e) => setUploadLenderName(e.target.value)} className="w-56" />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Icon name="Upload" className="h-4 w-4" /> Upload PDF
            <input type="file" accept=".pdf" className="hidden" onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)} />
          </label>
          <Button onClick={openAddDialog}>Add Lender</Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {['Lender', 'OO Deposit%', 'Inv Deposit%', 'Max DTI', 'Test Rate', 'Cashback', 'Clawback', 'Version', 'Actions'].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.lender_name} {row.is_current && <Badge className="ml-2">Current</Badge>}</TableCell>
              <TableCell>{row.min_deposit_owner_pct ?? '—'}</TableCell><TableCell>{row.min_deposit_investor_pct ?? '—'}</TableCell>
              <TableCell>{row.max_dti ?? '—'}</TableCell><TableCell>{row.test_rate ?? '—'}</TableCell>
              <TableCell>{row.cashback_available ? 'Yes' : 'No'}</TableCell><TableCell>{row.clawback_months ?? '—'}</TableCell>
              <TableCell>{row.version ?? '—'}</TableCell>
              <TableCell className="space-x-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setMode('edit');
                    setSelectedId(row.id);
                    setInitialValues({ ...emptyValues, ...row });
                    setDialogOpen(true);
                  }}
                >
                  <Icon name="Pencil" className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="destructive"><Icon name="Trash2" className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete lender policy?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancelButton>Cancel</AlertDialogCancelButton>
                      <AlertDialogDestructiveAction onClick={() => void deletePolicy.mutateAsync(row.id)}>Delete</AlertDialogDestructiveAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <LenderPolicyDialog
        open={dialogOpen}
        mode={mode}
        initialValues={initialValues}
        saving={addPolicy.isPending || updatePolicy.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSave}
      />
    </div>
  );
}
