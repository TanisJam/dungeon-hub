'use client';

/**
 * useToast — C5 web-component-catalog
 * Owns the toast message state + auto-clear timer.
 * Clears any pending timer on re-show (prevents stale clears) and on unmount (no leak).
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseToastReturn {
  message: string | null;
  showToast: (msg: string, durationMs?: number) => void;
}

export function useToast(): UseToastReturn {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((msg: string, durationMs = 3500) => {
    // Cancel any in-flight timer before starting a new one
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setMessage(msg);
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, durationMs);
  }, []);

  return { message, showToast };
}
