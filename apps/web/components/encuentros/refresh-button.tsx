'use client';

// REQ-WCO-WEB-07 — "Actualizar" refresh affordance.
// A minimal 'use client' island that calls router.refresh() so the player
// can manually pull the latest encounter state without a full page reload.
// Fulfils the "promised but unimplemented" refresh requirement from the verify report.

import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="min-h-[44px] px-4 text-sm font-semibold rounded border border-line"
      aria-label="Actualizar estado del encuentro"
    >
      Actualizar
    </button>
  );
}
