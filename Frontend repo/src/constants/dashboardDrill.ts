/**
 * Presets for filtering the Applications list when drilling down from Dashboard.
 */
export type AppListPreset = 'pipeline_active' | 'settled_this_month' | 'live_files' | 'all';

/**
 * Presets for filtering the Commission list when drilling down from Dashboard.
 */
export type CommissionListPreset = 'expected' | 'received' | 'overdue' | 'clawback' | 'all';

export const APP_LIST_PRESET_KEY = 'fi_app_list_preset';
export const COMMISSION_LIST_PRESET_KEY = 'fi_commission_list_preset';

/**
 * Stashes a preset in session storage to be picked up by the Applications page.
 */
export function stashApplicationsListPreset(preset: AppListPreset) {
  sessionStorage.setItem(APP_LIST_PRESET_KEY, preset);
}

/**
 * Stashes a preset in session storage to be picked up by the Commission page.
 */
export function stashCommissionListPreset(preset: CommissionListPreset) {
  sessionStorage.setItem(COMMISSION_LIST_PRESET_KEY, preset);
}
