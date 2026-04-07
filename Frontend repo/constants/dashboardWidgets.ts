export type WidgetId =
  | 'pipeline'
  | 'commission'
  | 'applications'
  | 'calendar'
  | 'insights'
  | 'refix'
  | 'tasks'
  | 'rates'
  | 'leads';

export type WidgetSize = 'large' | 'medium' | 'small';

export interface WidgetLayoutItem {
  id: WidgetId;
  title: string;
  order: number;
  visible: boolean;
  size: WidgetSize;
}

/** Default column span (of 12) for each size tier. */
export function sizeToSpan(size: WidgetSize): number {
  if (size === 'large') return 12;
  if (size === 'medium') return 6;
  return 4;
}

/** Default layout order and sizes. */
export const WIDGET_DEFAULT_SIZE: Record<WidgetId, WidgetSize> = {
  pipeline: 'medium',
  commission: 'medium',
  applications: 'medium',
  calendar: 'medium',
  insights: 'medium',
  refix: 'medium',
  tasks: 'small',
  rates: 'small',
  leads: 'small',
};

/** Order in customise panel and default drag order. */
export const WIDGET_CUSTOMISE_ORDER: WidgetId[] = [
  'pipeline',
  'commission',
  'applications',
  'calendar',
  'insights',
  'refix',
  'tasks',
  'rates',
  'leads',
];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  pipeline: 'Pipeline',
  commission: 'Commission',
  applications: 'Active Applications',
  calendar: 'Calendar',
  insights: 'AI Insights',
  refix: 'Rate Refixes',
  tasks: 'Tasks Due',
  rates: 'Market Rates',
  leads: 'Recent Leads',
};

export function defaultWidgetLayout(): WidgetLayoutItem[] {
  return [
    { id: 'pipeline',     title: 'Pipeline',           visible: true,  order: 1, size: 'medium' },
    { id: 'commission',   title: 'Commission',          visible: true,  order: 2, size: 'medium' },
    { id: 'applications', title: 'Active Applications', visible: true,  order: 3, size: 'medium' },
    { id: 'calendar',     title: 'Calendar',            visible: true,  order: 4, size: 'medium' },
    { id: 'insights',     title: 'AI Insights',         visible: true,  order: 5, size: 'medium' },
    { id: 'refix',        title: 'Rate Refixes',        visible: true,  order: 6, size: 'medium' },
    { id: 'tasks',        title: 'Tasks Due',           visible: true,  order: 7, size: 'small'  },
    { id: 'rates',        title: 'Market Rates',        visible: true,  order: 8, size: 'small'  },
    { id: 'leads',        title: 'Recent Leads',        visible: false, order: 9, size: 'small'  },
  ];
}

function isWidgetId(id: string): id is WidgetId {
  return (WIDGET_CUSTOMISE_ORDER as string[]).includes(id);
}

/** Merge saved JSON from DB with current schema (drops removed widgets, fills size). */
export function mergeWidgetLayout(saved: unknown): WidgetLayoutItem[] {
  const base = defaultWidgetLayout();
  if (!Array.isArray(saved)) return base;
  const byId = new Map<string, Partial<WidgetLayoutItem>>();
  for (const row of saved) {
    if (row && typeof row === 'object' && 'id' in row) {
      const r = row as WidgetLayoutItem;
      if (isWidgetId(r.id)) byId.set(r.id, r);
    }
  }
  return base.map((d) => {
    const s = byId.get(d.id);
    if (!s) return d;
    const sz = s.size;
    const size: WidgetSize =
      sz === 'large' || sz === 'medium' || sz === 'small' ? sz : d.size;
    return {
      id: d.id,
      title: d.title,
      order: typeof s.order === 'number' ? s.order : d.order,
      visible: typeof s.visible === 'boolean' ? s.visible : d.visible,
      size,
    };
  });
}

/** Normalize order: visible widgets first (by order), then hidden; assign 1..n. Preserves size. */
export function normalizeWidgetOrder(layout: WidgetLayoutItem[]): WidgetLayoutItem[] {
  const vis = layout.filter((w) => w.visible).sort((a, b) => a.order - b.order);
  const inv = layout.filter((w) => !w.visible).sort((a, b) => a.order - b.order);
  const ordered = [...vis, ...inv];
  return ordered.map((w, i) => ({ ...w, order: i + 1 }));
}
