import { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  AlertDialog,
  AlertDialogCancelButton,
  AlertDialogContent,
  AlertDialogDestructiveAction,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { slugify, type SentenceCategory, useAddSentence, useDeleteSentence, useSentences, useUpdateSentence } from './useSentenceBank';

type Props = { firmId: string; category: SentenceCategory };

/** Renders sentence table editor for one category. */
export function SentenceCategoryPanel({ firmId, category }: Props) {
  const toast = useToast();
  const { data: rows = [] } = useSentences(firmId, category);
  const updateSentence = useUpdateSentence();
  const addSentence = useAddSentence(firmId);
  const deleteSentence = useDeleteSentence(firmId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [newSentence, setNewSentence] = useState('');
  const [newKey, setNewKey] = useState('');

  /** Saves inline edited sentence text on blur. */
  async function saveEdit(id: string) {
    if (!editingText.trim()) return;
    try {
      await updateSentence.mutateAsync({ id, values: { sentence: editingText }, firmId, category });
      setEditingId(null);
    } catch {
      toast.error('Failed to update sentence');
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Sentence</TableHead><TableHead>Active</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.sentence_key} {row.is_default && <Badge className="ml-2">Default</Badge>}</TableCell>
              <TableCell onClick={() => { setEditingId(row.id); setEditingText(row.sentence); }}>
                {editingId === row.id ? (
                  <Input
                    value={editingText}
                    autoFocus
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => void saveEdit(row.id)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveEdit(row.id)}
                  />
                ) : row.sentence}
              </TableCell>
              <TableCell>
                <Switch checked={row.is_active} onCheckedChange={(checked) => void updateSentence.mutateAsync({ id: row.id, values: { is_active: checked }, firmId, category })} />
              </TableCell>
              <TableCell>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={row.is_default}>Delete</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete sentence?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancelButton>Cancel</AlertDialogCancelButton>
                      <AlertDialogDestructiveAction onClick={() => void deleteSentence.mutateAsync({ id: row.id, isDefault: row.is_default, category })}>Delete</AlertDialogDestructiveAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell><Input value={newKey} placeholder="sentence_key" onChange={(e) => setNewKey(e.target.value)} /></TableCell>
            <TableCell>
              <Input
                value={newSentence}
                placeholder="Add sentence"
                onChange={(e) => { const value = e.target.value; setNewSentence(value); if (!newKey) setNewKey(slugify(value)); }}
              />
            </TableCell>
            <TableCell>—</TableCell>
            <TableCell>
              <Button
                size="sm"
                onClick={() => void addSentence.mutateAsync({ sentence: newSentence, sentence_key: newKey || slugify(newSentence), category }).then(() => { setNewSentence(''); setNewKey(''); })}
              >
                Save
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
