import { useState, useEffect, useRef } from 'react';

/** Reveals `text` gradually when `active`; otherwise shows full text immediately. */
export function useStreamingText(text: string, active: boolean, speedMs = 8) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !text) {
      setDisplayed(text);
      return;
    }
    indexRef.current = 0;
    setDisplayed('');
    intervalRef.current = setInterval(() => {
      indexRef.current += 3;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speedMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, active, speedMs]);

  const isComplete = displayed.length >= text.length;
  return { displayed, isComplete };
}
