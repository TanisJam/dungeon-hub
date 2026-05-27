'use client';

/**
 * SpellsStep — level-up spell selection step.
 *
 * Wraps `SpellsPicker` from the wizard. Receives limits at the NEW class level
 * (computed server-side in page.tsx via computeSpellLimits at toLevel).
 * Pre-seeds `value` with the character's existing spells so the counter shows
 * "X/Y" and the player only picks the delta.
 *
 * CTA is gated by validateSpellsPick from domain.
 * Mobile-first: sticky bottom CTA ≥44px per CLAUDE.md §2.
 *
 * REQ-CLU-SPL-STEP-CONDITION, REQ-CLU-SPL-KNOWN-CASTERS,
 * REQ-CLU-SPL-WIZARD-SPELLBOOK, REQ-CLU-SPL-CANTRIP-DELTA,
 * REQ-CLU-SPL-DOMAIN-VALIDATION, REQ-CLU-XCUT-MOBILE.
 */

import { useState } from 'react';
import {
  SpellsPicker,
  validateSpellsPick,
  type SpellLimitsView,
  type AvailableSpell,
  type AppliedClassSpells,
} from '@/app/characters/[id]/wizard/spells/_picker';

interface SpellsStepProps {
  classSlug: string;
  classSource: string;
  limits: SpellLimitsView;
  /** Available spells to pick from. null = loading. */
  availableSpells: AvailableSpell[] | null;
  subclassGrantedSlugs: string[];
  /** Pre-seeded with existing character spell picks. */
  initialValue: AppliedClassSpells;
  onContinue: (value: AppliedClassSpells) => void;
}

export function SpellsStep({
  classSlug,
  classSource,
  limits,
  availableSpells,
  subclassGrantedSlugs,
  initialValue,
  onContinue,
}: SpellsStepProps) {
  const [value, setValue] = useState<AppliedClassSpells>(initialValue);

  if (availableSpells === null) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-ink-mute">Cargando hechizos...</p>
      </div>
    );
  }

  const validationError = validateSpellsPick(limits, subclassGrantedSlugs, value);
  const isValid = validationError === null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-ink">Elegí tus hechizos</h2>
        <p className="mt-1 text-xs text-ink-mute">
          Seleccioná los hechizos que ganás al subir de nivel.
        </p>
      </div>

      <SpellsPicker
        classSlug={classSlug}
        classSource={classSource}
        limits={limits}
        availableSpells={availableSpells}
        subclassGrantedSlugs={subclassGrantedSlugs}
        value={value}
        onChange={setValue}
      />

      {validationError && (
        <p className="text-xs text-red-600">{validationError}</p>
      )}

      {/* Sticky bottom CTA — mobile-first */}
      <div className="sticky bottom-0 pb-safe bg-paper pt-2">
        <button
          type="button"
          onClick={() => onContinue(value)}
          disabled={!isValid}
          className="min-h-[44px] w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          aria-label="Confirmar hechizos"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
