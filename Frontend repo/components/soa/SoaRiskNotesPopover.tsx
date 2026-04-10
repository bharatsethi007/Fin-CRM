import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

type SentencePick = { sentence_key: string; sentence: string };

type Props = {
  risks: SentencePick[];
  riskKeys: string[];
  onRiskToggle: (key: string) => void | Promise<void>;
  onRiskClear: () => void | Promise<void>;
};

/** Truncates sentence text for compact UI. */
function sentencePreview(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}

/** Popover multi-select for risk sentence bank lines + removable pills. */
export function SoaRiskNotesPopover({ risks, riskKeys, onRiskToggle, onRiskClear }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
        Risk notes
        <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">Select multiple</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-8 w-full justify-between text-xs font-normal">
            <span className="truncate">
              {riskKeys.length === 0
                ? 'Standard risks apply'
                : `${riskKeys.length} risk${riskKeys.length > 1 ? 's' : ''} selected`}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-0" align="start">
          <div className="max-h-64 overflow-y-auto p-2">
            {risks.map((sentence) => {
              const isSelected = riskKeys.includes(sentence.sentence_key);
              return (
                <label
                  key={sentence.sentence_key}
                  className="flex cursor-pointer items-start gap-2 rounded p-2 hover:bg-slate-50 dark:hover:bg-gray-800/80"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => void onRiskToggle(sentence.sentence_key)}
                    className="mt-0.5"
                    aria-label={sentencePreview(sentence.sentence, 72)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-gray-900 dark:text-gray-100">{sentence.sentence}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">risk</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-between border-t border-gray-200 p-2 dark:border-gray-700">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void onRiskClear()}>
              Clear all
            </Button>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-gray-500 dark:text-gray-400">From your Sentence Library (risk)</p>

      {riskKeys.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {riskKeys.map((key) => {
            const sentence = risks.find((s) => s.sentence_key === key);
            const short = sentence ? sentencePreview(sentence.sentence, 30) : key;
            return (
              <Badge key={key} variant="secondary" className="gap-0 pr-0.5 text-xs font-normal">
                <span className="max-w-[200px] truncate">{short}</span>
                <button
                  type="button"
                  className="ml-1 rounded p-0.5 hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => void onRiskToggle(key)}
                  aria-label={`Remove ${short}`}
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
