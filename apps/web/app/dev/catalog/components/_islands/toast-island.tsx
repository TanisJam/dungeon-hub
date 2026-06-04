'use client';

import { Toast } from '@/components/ui/toast';
import { useToast } from '@/lib/use-toast';
import { useEffect } from 'react';

/**
 * Dev-only client island for Toast demo.
 * Auto-fires showToast on mount so the catalog visitor sees it immediately.
 * Passes through durationMs so the catalog can show "auto-clear" behavior.
 */
export function ToastIsland(props: { message: string; durationMs?: number }) {
  const { message: toastMsg, showToast } = useToast();

  useEffect(() => {
    showToast(props.message, props.durationMs ?? 3500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.message]);

  return <Toast message={toastMsg} />;
}
