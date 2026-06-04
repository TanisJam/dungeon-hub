'use client';

// NOTE: mirrors SpellPrepEditor (apps/web/components/ficha/spells/spell-prep-editor.tsx)
// Dev-only catalog island — supplies fixture spell list + stub/no-op handlers.
// saveSpellPrepForClass server action is NOT called; save simulates locally.
// PAIR ANALYSIS: SpellPrepEditor is the form body (counter + toggle list + save button).
// SpellPrepSectionEditor is the pencil + lazy-fetch + V3Sheet wrapper.
// SpellPrepEditor is MORE COMPLEX than SpellKnownEditor:
//   - prepLimit enforcement (counter pill with green/amber/danger tones)
//   - subclassGrantedSlugs (always-prepared, read-only checkboxes)
//   - filterPrepUniverse helper for Wizard/EK/AT spellbook intersection
//   - over-limit error path in saveSpellPrepForClass response

import { useState, useTransition } from 'react';

interface Spell {
  slug: string;
  source: string;
  name: string;
  level: number;
}

interface Props {
  availableSpells: Spell[];
  subclassGrantedSlugs: string[];
  initialPreparedSlugs: string[];
  prepLimit: number;
}

export function SpellPrepEditorIsland({
  availableSpells,
  subclassGrantedSlugs,
  initialPreparedSlugs,
  prepLimit,
}: Props) {
  const grantedSet = new Set(subclassGrantedSlugs);
  const leveledSpells = availableSpells.filter((s) => s.level > 0);
  const selectableSpells = leveledSpells.filter((s) => !grantedSet.has(s.slug));

  const [preparedSlugs, setPreparedSlugs] = useState<Set<string>>(
    () => new Set(initialPreparedSlugs.filter((slug) => !grantedSet.has(slug))),
  );
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const count = preparedSlugs.size;
  const atLimit = count >= prepLimit;
  const overLimit = count > prepLimit;
  const counterTone = overLimit ? 'danger' : atLimit ? 'amber' : 'green';
  const counterColors: Record<string, string> = {
    green: 'text-green-700 bg-green-50 border-green-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    danger: 'text-red-700 bg-red-50 border-red-200',
  };

  function handleToggle(slug: string) {
    setPreparedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (!atLimit || prev.has(slug)) {
        next.add(slug);
      }
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 300));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${counterColors[counterTone]}`}
      >
        <span>
          {count}/{prepLimit} preparados
        </span>
      </div>

      {atLimit && !overLimit && (
        <p className="text-xs text-amber-600">Límite alcanzado</p>
      )}

      {saved && (
        <div
          role="alert"
          className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
        >
          (Catálogo) Guardado localmente — sin servidor real.
        </div>
      )}

      {subclassGrantedSlugs.length > 0 && (
        <div className="space-y-1">
          {subclassGrantedSlugs.map((slug) => {
            const spell = leveledSpells.find((s) => s.slug === slug);
            if (!spell) return null;
            return (
              <div key={slug} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked disabled readOnly aria-label={spell.name} />
                <span className="text-sm text-ink">{spell.name}</span>
                <span className="ml-auto text-xs text-ink-mute">Siempre preparado</span>
              </div>
            );
          })}
        </div>
      )}

      {selectableSpells.length === 0 ? (
        <p className="text-sm text-ink-mute">Aprendé hechizos al subir de nivel</p>
      ) : (
        <div className="space-y-1 divide-y divide-line">
          {selectableSpells.map((spell) => {
            const checked = preparedSlugs.has(spell.slug);
            const disabledByLimit = atLimit && !checked;
            return (
              <div
                key={`${spell.slug}|${spell.source}`}
                className="flex items-center gap-2 py-2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabledByLimit}
                  aria-label={spell.name}
                  onChange={() => handleToggle(spell.slug)}
                />
                <span className={`text-sm ${disabledByLimit ? 'text-ink-mute' : 'text-ink'}`}>
                  {spell.name}
                </span>
                <span className="ml-auto text-xs text-ink-mute">Nv {spell.level}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
