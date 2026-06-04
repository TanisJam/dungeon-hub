'use client';

// NOTE: mirrors RefreshButton (apps/web/components/encuentros/refresh-button.tsx)
// Dev-only catalog island — calls no-op instead of router.refresh() so the catalog
// page doesn't actually navigate away during visual inspection.

import { useState } from 'react';

export function RefreshButtonIsland() {
  const [refreshed, setRefreshed] = useState(false);

  function handleClick() {
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 1200);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        className="min-h-[44px] px-4 text-sm font-semibold rounded border border-line"
        aria-label="Actualizar estado del encuentro"
      >
        Actualizar
      </button>
      {refreshed && (
        <p className="text-[10px] text-ink-soft text-center">
          (Catálogo) router.refresh() → stub en el catálogo
        </p>
      )}
    </div>
  );
}
