import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { logger } from '../../../utils/logger';

const CALLBACK_NAME = '__advisorflowGooglePlacesReady';

let placesLoadPromise: Promise<void> | null = null;

/** Injects the Maps JS script once; resolves when `google.maps.places` is available. */
function loadGooglePlacesScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (typeof google !== 'undefined' && google.maps?.places) return Promise.resolve();
  if (placesLoadPromise) return placesLoadPromise;

  placesLoadPromise = new Promise<void>((resolve, reject) => {
    const w = globalThis as typeof globalThis & { [CALLBACK_NAME]?: () => void };
    w[CALLBACK_NAME] = () => {
      resolve();
      delete w[CALLBACK_NAME];
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => {
      placesLoadPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(script);
  });

  return placesLoadPromise;
}

/** Ensures Places dropdown appears above modals/dialogs. */
function ensurePacZIndexStyle(): void {
  if (document.getElementById('advisorflow-pac-zindex')) return;
  const style = document.createElement('style');
  style.id = 'advisorflow-pac-zindex';
  style.textContent = '.pac-container{z-index:99999!important;}';
  document.head.appendChild(style);
}

type Props = {
  id?: string;
  /** Controlled value (preferred for forms synced to parent). */
  value?: string;
  /** Used when `value` is omitted (uncontrolled mount). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSelect: (address: string) => void;
  placeholder?: string;
  className?: string;
};

/** NZ address field using Google Maps JS API + Places (`VITE_GOOGLE_MAPS_KEY`). */
export function AddressAutocomplete({
  id,
  value,
  defaultValue = '',
  onValueChange,
  onSelect,
  placeholder,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const onSelectRef = useRef(onSelect);
  const onValueChangeRef = useRef(onValueChange);

  onSelectRef.current = onSelect;
  onValueChangeRef.current = onValueChange;

  const isControlled = value !== undefined;
  const [inner, setInner] = useState(() => (isControlled ? (value as string) : defaultValue));

  useEffect(() => {
    if (isControlled) setInner(value as string);
  }, [isControlled, value]);

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined)?.trim();

  useEffect(() => {
    if (!apiKey) {
      logger.log('AddressAutocomplete: VITE_GOOGLE_MAPS_KEY missing');
      return;
    }

    const inputEl = inputRef.current;
    if (!inputEl) return;

    ensurePacZIndexStyle();

    let cancelled = false;

    void loadGooglePlacesScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || acRef.current) return;

        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'nz' },
          fields: ['formatted_address'],
          types: ['address'],
        });

        acRef.current = ac;
        listenerRef.current = ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const addr = place.formatted_address;
          if (addr) {
            setInner(addr);
            onValueChangeRef.current?.(addr);
            onSelectRef.current(addr);
          }
        });
      })
      .catch((err: unknown) => {
        logger.error('AddressAutocomplete: Places init failed', err);
      });

    return () => {
      cancelled = true;
      if (listenerRef.current) {
        google.maps.event.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      acRef.current = null;
    };
  }, [apiKey]);

  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      value={inner}
      onChange={(e) => {
        const v = e.target.value;
        setInner(v);
        onValueChange?.(v);
      }}
      placeholder={placeholder ?? 'Start typing NZ address...'}
      className={cn(
        'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500',
        className,
      )}
    />
  );
}
