import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { LenderPolicySchema, type LenderPolicyFormValues } from '../useKnowledgeBank';

type Props = {
  open: boolean;
  initialValues: LenderPolicyFormValues;
  mode: 'add' | 'edit';
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: LenderPolicyFormValues) => Promise<void>;
};

const numberFields = [
  'min_deposit_owner_pct',
  'min_deposit_investor_pct',
  'new_build_deposit_pct',
  'max_dti',
  'test_rate',
  'max_term_years',
  'clawback_months',
  'commission_upfront_pct',
  'commission_trail_pct',
] as const;

/** Renders add/edit lender policy form in a dialog. */
export function LenderPolicyDialog({ open, initialValues, mode, saving, onClose, onSubmit }: Props) {
  const form = useForm<LenderPolicyFormValues>({
    resolver: zodResolver(LenderPolicySchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues, open]);

  return (
    <Dialog open={open} onOpenChange={(state) => !state && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Lender Policy' : 'Edit Lender Policy'}</DialogTitle>
          <DialogDescription>Fill policy fields and save to your firm knowledge bank.</DialogDescription>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="md:col-span-2 space-y-2">
            <Label>Lender Name</Label>
            <Input {...form.register('lender_name')} />
          </div>
          {numberFields.map((field) => (
            <div key={field} className="space-y-2">
              <Label>{field.replace(/_/g, ' ')}</Label>
              <Input type="number" step="0.01" {...form.register(field, { setValueAs: (v) => (v === '' ? null : Number(v)) })} />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Income shading self employed</Label>
            <Input
              type="number"
              step="0.01"
              {...form.register('income_shading.self_employed', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Income shading rental</Label>
            <Input type="number" step="0.01" {...form.register('income_shading.rental', { setValueAs: (v) => (v === '' ? null : Number(v)) })} />
          </div>
          <div className="space-y-2">
            <Label>Income shading boarder</Label>
            <Input type="number" step="0.01" {...form.register('income_shading.boarder', { setValueAs: (v) => (v === '' ? null : Number(v)) })} />
          </div>
          <div className="space-y-2">
            <Label>Construction policy</Label>
            <Input {...form.register('construction_policy')} />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Adviser notes</Label>
            <Textarea {...form.register('adviser_notes')} />
          </div>
          <div className="flex items-center justify-between rounded border p-3 md:col-span-2">
            <Label>Accepts boarder income</Label>
            <Switch checked={form.watch('accepts_boarder_income')} onCheckedChange={(checked) => form.setValue('accepts_boarder_income', checked)} />
          </div>
          <div className="flex items-center justify-between rounded border p-3 md:col-span-2">
            <Label>Accepts gifted deposit</Label>
            <Switch checked={form.watch('accepts_gifted_deposit')} onCheckedChange={(checked) => form.setValue('accepts_gifted_deposit', checked)} />
          </div>
          <div className="flex items-center justify-between rounded border p-3 md:col-span-2">
            <Label>Cashback available</Label>
            <Switch checked={form.watch('cashback_available')} onCheckedChange={(checked) => form.setValue('cashback_available', checked)} />
          </div>
          <DialogFooter className="md:col-span-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
