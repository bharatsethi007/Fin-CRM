import { useEffect, useState } from 'react';

import { PropertyCardLight, type PropertyCardMinimalProperty } from '@/components/property/PropertyCardLight';
import { supabase } from '@/lib/supabase';
import { logger } from '../../../utils/logger';

type Row = PropertyCardMinimalProperty & Record<string, unknown>;

/** Window event name; dispatch after saving/updating `application_properties` to refresh this card. */
export const PROPERTY_UPDATED_EVENT = 'property-updated';

/** Fires `property-updated` on `window` (e.g. after address verify or upsert). */
export function notifyApplicationPropertyUpdated(): void {
  window.dispatchEvent(new Event(PROPERTY_UPDATED_EVENT));
}

type Props = { applicationId: string; refreshKey?: number };

export function PropertyInformationSection({ applicationId, refreshKey = 0 }: Props) {
  const [property, setProperty] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  /** Re-fetch when `notifyApplicationPropertyUpdated()` runs (parent need not pass `refreshKey`). */
  const [eventTick, setEventTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setEventTick((t) => t + 1);
    window.addEventListener(PROPERTY_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PROPERTY_UPDATED_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    const id = applicationId?.trim();
    if (!id) {
      setProperty(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('application_properties')
        .select('*')
        .eq('application_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        logger.log('PropertyInformationSection: fetch failed', error.message);
        setProperty(null);
        setLoading(false);
        return;
      }
      logger.log('Property loaded:', data?.address_full);
      setProperty(data != null ? (data as Row) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, refreshKey, eventTick]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white p-6" />;
  }
  if (!property) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        No property — select an address above
      </div>
    );
  }
  return <PropertyCardLight property={property} />;
}
