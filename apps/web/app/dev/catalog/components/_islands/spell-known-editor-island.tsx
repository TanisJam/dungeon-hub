'use client';

// NOTE: mirrors SpellKnownEditor (apps/web/components/ficha/spells/spell-known-editor.tsx)
// Dev-only catalog island — supplies fixture spell list + stub/no-op handlers.
// saveSpellKnown server action is NOT called; save simulates locally.
// PAIR ANALYSIS: SpellKnownEditor is the form body (checkbox list).
// SpellKnownSectionEditor is the wand-button + lazy-fetch + V3Sheet wrapper.
// Structural difference: SpellKnownSectionEditor has a LAZY FETCH (GET /options)
// when the sheet opens — more complex wrapper than AtributosSectionEditor/HPSectionEditor.

import { useState, useTransition } from 'react';
import { FormErrorAlert } from '@/components/ui/form-error-alert';

interface AvailableSpell {
  slug: string;
  name: string;
  level: number;
}

interface Props {
  availableSpells: AvailableSpell[];
  currentKnownSlugs: string[];
}

export function SpellKnownEditorIsland({ availableSpells, currentKnownSlugs }: Props) {
  const leveledSpells = availableSpells.filter((s) => s.level > 0);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentKnownSlugs.filter((slug) => leveledSpells.some((s) => s.slug === slug))),
  );
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleSpell(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 300));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <p className="text-xs text-amber-400 font-medium">
        {selected.size} hechizo{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}
      </p>

      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {leveledSpells.map((spell) => (
          <label
            key={spell.slug}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-surface"
          >
            <input
              type="checkbox"
              checked={selected.has(spell.slug)}
              onChange={() => toggleSpell(spell.slug)}
              className="rounded border-line accent-amber-400"
              aria-label={spell.name}
            />
            <span className="text-sm text-ink">{spell.name}</span>
            <span className="ml-auto text-[10px] text-ink-mute">Nv. {spell.level}</span>
          </label>
        ))}
      </div>

      <FormErrorAlert message={saved ? '(Catálogo) Guardado localmente — sin servidor real.' : null} />

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-md border border-line px-4 py-2 text-sm text-ink-soft"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
