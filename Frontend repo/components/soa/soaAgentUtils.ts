/** Maps backend step codes to readable labels. */
export function humanizeStepName(stepName: string, fallbackNumber: number): string {
  const map: Record<string, string> = {
    filter_lenders: 'Step 1: Filter Lenders',
    policy_rag: 'Step 2: Policy Evidence',
    quant_matrix: 'Step 3: Cost Matrix',
    narrative: 'Step 4: Draft Narrative',
    self_critique: 'Step 5: Compliance Check',
  };
  if (map[stepName]) return map[stepName];
  return `Step ${fallbackNumber}: ${stepName.replace(/_/g, ' ')}`;
}

/** Formats elapsed seconds while a step is running (start → now). */
export function elapsedSeconds(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  return `${Math.round((end - start) / 1000)}s`;
}

/** Returns elapsed seconds label only when both ISO timestamps exist (finished step). */
export function stepElapsedSecondsLabel(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt || !completedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  return `${Math.round((end - start) / 1000)}s`;
}

/** Formats unknown scalar values for readable UI output. */
export function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value || '—';
  return JSON.stringify(value);
}

/** Coerces unknown list value to a string array safely. */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Coerces jsonb list fields that may be an array or an object map into an array for safe iteration. */
export function jsonbArray<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data !== null && typeof data === 'object') return Object.values(data as Record<string, T>);
  return [];
}

/** Returns val when it is an array; otherwise [] (safe before .map). */
export function safeArray<T = unknown>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

/** Coerces SOA layer jsonb `{ text }` or a plain string to a string for forms and display. */
export function layerText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) {
    const t = (value as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  return '';
}

/** Reads a numeric field from unknown object payload. */
export function pickNumber(source: Record<string, unknown> | null | undefined, key: string): number | null {
  const raw = source?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** Reads a string field from unknown object payload. */
export function pickString(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const raw = source?.[key];
  return typeof raw === 'string' ? raw : null;
}
