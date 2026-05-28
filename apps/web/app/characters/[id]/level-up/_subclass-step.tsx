'use client';

/**
 * SubclassStep — level-up subclass selection step.
 *
 * Data source: rows prop (pre-fetched server-side in page.tsx, no client fetch on mount).
 * Mobile-first: full-width cards, ≥80px per card, sticky bottom CTA ≥44px.
 *
 * REQ-CLU-SUB-UNLOCK-CONDITION: shown only when step-graph includes 'subclass'.
 * REQ-CLU-SUB-UI-MOBILE: radio-card pattern, min-h-[80px] cards, min-h-[44px] CTA.
 */

import { useState } from 'react';
import { SubclassPicker } from '@/components/character/subclass-picker';
import type { SubclassRow } from '@/app/characters/[id]/wizard/class/_picker';

interface ClassRef {
  slug: string;
  source: string;
}

interface SubclassStepProps {
  selectedClass: ClassRef;
  subclassTitle: string;
  /** Pre-fetched from server. Null while loading (should not happen with server pre-fetch). */
  rows: SubclassRow[] | null;
  onContinue: (sub: ClassRef) => void;
}

export function SubclassStep({
  selectedClass,
  subclassTitle,
  rows,
  onContinue,
}: SubclassStepProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (rows === null) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-ink-mute">Cargando opciones...</p>
      </div>
    );
  }

  function handleContinue() {
    if (!selectedKey) return;
    const [slug, source] = selectedKey.split('|');
    if (!slug || !source) return;
    onContinue({ slug, source });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-ink">Elegí tu {subclassTitle}</h2>
        <p className="mt-1 text-xs text-ink-mute">
          Esta elección determina las características especiales de tu {selectedClass.slug}.
        </p>
      </div>

      <SubclassPicker
        title={subclassTitle}
        options={rows}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
      />

      {/* Sticky bottom CTA — mobile-first */}
      <div className="sticky bottom-0 pb-safe bg-paper pt-2">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedKey}
          className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          aria-label="Confirmar subclase"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
