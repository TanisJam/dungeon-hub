'use client';

import { useState, useTransition } from 'react';
import { saveSpellKnown } from './save-spell-known-action';

interface AvailableSpell {
  slug: string;
  source: string;
  name: string;
  level: number;
}

interface SpellKnownEditorProps {
  characterId: string;
  classSlug: string;
  /** Full list from GET /options — cantrips are filtered defensively here. */
  availableSpells: AvailableSpell[];
  /** Currently known spell slugs (pre-selected state). */
  currentKnownSlugs: ReadonlySet<string>;
  onClose: () => void;
}

/**
 * SpellKnownEditor — DM-only toggle list for setting the 'known' spells.
 * Filters cantrips (level 0) defensively. No RAW cap enforcement.
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component.
 */
export function SpellKnownEditor({
  characterId,
  classSlug,
  availableSpells,
  currentKnownSlugs,
  onClose,
}: SpellKnownEditorProps) {
  // Filter out cantrips defensively
  const leveledSpells = availableSpells.filter((s) => s.level > 0);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(Array.from(currentKnownSlugs).filter((slug) => leveledSpells.some((s) => s.slug === slug))),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSpell(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const known = leveledSpells
      .filter((s) => selected.has(s.slug))
      .map((s) => ({ slug: s.slug, source: s.source }));

    startTransition(async () => {
      const result = await saveSpellKnown({ characterId, classSlug, known });
      if (result.ok) {
        onClose();
      } else {
        setError(result.message ?? 'Error al guardar.');
      }
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

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
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
