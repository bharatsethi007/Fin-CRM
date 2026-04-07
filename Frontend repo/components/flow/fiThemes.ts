/** Flow Intelligence chat background themes (persisted to localStorage). */

export const FI_THEME_STORAGE_KEY = 'fi_theme';

export type FiTheme = {
  id: string;
  name: string;
  bg: string;
  gradient: string | null;
};

export const FI_THEMES: FiTheme[] = [
  { id: 'default', name: 'Default', bg: '#f9fafb', gradient: null },
  {
    id: 'aurora',
    name: 'Aurora',
    bg: '#f9fafb',
    gradient: 'linear-gradient(135deg, #e0e7ff 0%, #f0abfc 50%, #fda4af 100%)',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    bg: '#f9fafb',
    gradient: 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 40%, #c4b5fd 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    bg: '#f9fafb',
    gradient: 'linear-gradient(135deg, #fde68a 0%, #fca5a5 50%, #f9a8d4 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    bg: '#f9fafb',
    gradient: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 40%, #6ee7b7 100%)',
  },
];

/** SVG noise overlay (subtle texture on themed backgrounds). */
export const FI_NOISE_DATA_URL =
  "data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E";

/** Returns persisted theme id or `default`. */
export function getStoredFiThemeId(): string {
  try {
    const v = localStorage.getItem(FI_THEME_STORAGE_KEY);
    if (v && FI_THEMES.some((t) => t.id === v)) return v;
  } catch {
    /* ignore */
  }
  return 'default';
}

/** Persists theme id to localStorage. */
export function saveFiThemeId(id: string): void {
  try {
    localStorage.setItem(FI_THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Resolves a theme by id (falls back to default). */
export function getFiTheme(id: string): FiTheme {
  return FI_THEMES.find((t) => t.id === id) ?? FI_THEMES[0];
}
