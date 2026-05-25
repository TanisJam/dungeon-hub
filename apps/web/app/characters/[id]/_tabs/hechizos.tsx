import type { CharacterSheet, SpellcastingView, ClassSpellSummary, SpellSheetRef } from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { RacialSpellsBlock } from './_racial-spells-block';
import { SpellBadges } from '@/app/_components/spells/badges';

const ABILITY_ES: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

// ── SpellRow ────────────────────────────────────────────────────────────────
// Single spell row: name (left, truncated) + level chip + badges (right).
// Min-height 44px for touch target (CLAUDE.md §2).

function SpellRow({ spell }: { spell: SpellSheetRef }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2 py-2">
      <span className="min-w-0 truncate text-sm text-ink">{spell.name}</span>
      <div className="flex shrink-0 items-center gap-1">
        {spell.level === 0 ? (
          <span className="rounded bg-paper-soft px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">
            Truco
          </span>
        ) : (
          <span className="rounded bg-paper-soft px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">
            Nv {spell.level}
          </span>
        )}
        <SpellBadges
          ritual={spell.ritual}
          concentration={spell.concentration}
          componentsM={spell.componentsM}
          componentsMCost={spell.componentsMCost}
        />
      </div>
    </div>
  );
}

// ── SpellGroup ───────────────────────────────────────────────────────────────
// Group header (Trucos / Preparados / Conocidos) + list of spell rows.

function SpellGroup({ label, spells }: { label: string; spells: SpellSheetRef[] }) {
  if (spells.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-ink-mute">
        {label}
      </p>
      <div className="divide-y divide-line">
        {spells.map((spell) => (
          <SpellRow key={`${spell.slug}|${spell.source}`} spell={spell} />
        ))}
      </div>
    </div>
  );
}

// ── ClassSpellSection ────────────────────────────────────────────────────────
// Per-class spell section — stat grid (DC/attack/ability) + spell groups.
// Defensively treats missing `spells` field as empty arrays (design §9 rollback safety).

function ClassSpellSection({
  sc,
  summary,
}: {
  sc: SpellcastingView;
  summary: ClassSpellSummary | undefined;
}) {
  // Defensive fallback: if summary or spells field is absent (legacy rollback).
  const spells = summary?.spells ?? { cantrips: [], leveled: [] };
  const isEmpty = spells.cantrips.length === 0 && spells.leveled.length === 0;

  // Label mapping: prepared casters → "Preparados"; known casters → "Conocidos".
  // Driven by ClassSpellSummary.spellsPrepared !== null (design §6).
  const leveledLabel = summary?.spellsPrepared !== null ? 'Preparados' : 'Conocidos';

  return (
    <Card variant="surface" className="p-4">
      {/* Class header */}
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        {sc.classSlug}{' '}
        <span className="normal-case text-ink-mute/60">· {sc.classSource}</span>
      </p>

      {/* Spellcasting stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
            CD Hechizo
          </span>
          <span className="text-base font-bold text-ink">{sc.saveDC}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
            Ataque
          </span>
          <span className="text-base font-bold text-ink">{fmtMod(sc.attackBonus)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
            Habilidad
          </span>
          <span className="text-base font-bold text-ink">
            {ABILITY_ES[sc.ability] ?? sc.ability.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Spell groups — or empty state (REQ-SP04-11) */}
      {isEmpty ? (
        <div className="mt-3 rounded-md bg-paper-soft px-3 py-4 text-center">
          <p className="text-xs text-ink-mute">Sin hechizos seleccionados</p>
        </div>
      ) : (
        <>
          <SpellGroup label="Trucos" spells={spells.cantrips} />
          <SpellGroup label={leveledLabel} spells={spells.leveled} />
        </>
      )}
    </Card>
  );
}

// ── HechizosTab ──────────────────────────────────────────────────────────────

interface HechizosTabProps {
  sheet: CharacterSheet;
}

export function HechizosTab({ sheet }: HechizosTabProps) {
  const hasClassSpells = sheet.spellcasting && sheet.spellcasting.length > 0;
  const hasRacialSpells = sheet.racialSpells && sheet.racialSpells.length > 0;

  if (!hasClassSpells && !hasRacialSpells) {
    return (
      <Card variant="surface" className="px-4 py-10 text-center">
        <p className="text-sm text-ink-mute">Tu clase no usa magia.</p>
      </Card>
    );
  }

  const slots = sheet.spellSlots?.slots ?? null;
  const pact = sheet.spellSlots?.pactMagic ?? null;

  // Build summary lookup by classSlug for O(1) access.
  const summaryByClass = new Map<string, ClassSpellSummary>(
    (sheet.spellsByClass ?? []).map((s) => [s.classSlug, s]),
  );

  return (
    <div className="space-y-4">
      {/* Hechizos raciales — rendered before class spells (racial spells are always available) */}
      {hasRacialSpells && <RacialSpellsBlock racialSpells={sheet.racialSpells} />}

      {/* Per-class caster sections (SP-04) */}
      {hasClassSpells &&
        sheet.spellcasting.map((sc: SpellcastingView) => (
          <ClassSpellSection
            key={`${sc.classSlug}-${sc.classSource}`}
            sc={sc}
            summary={summaryByClass.get(sc.classSlug)}
          />
        ))}

      {/* Spell slots */}
      {slots && (
        <Card variant="surface" className="p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Espacios de Hechizo
          </p>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((count, idx) =>
              count > 0 ? (
                <div key={idx} className="flex flex-col items-center gap-0.5 rounded-md bg-paper-soft p-2">
                  <span className="text-[9px] font-bold text-ink-mute">Nv {idx + 1}</span>
                  <span className="text-base font-bold text-ink">{count}</span>
                </div>
              ) : null,
            )}
          </div>
        </Card>
      )}

      {pact && (
        <Card variant="surface" className="p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Magia de Pacto
          </p>
          <p className="text-sm text-ink">
            {pact.slotCount} espacio{pact.slotCount !== 1 ? 's' : ''} de nivel {pact.slotLevel}
          </p>
        </Card>
      )}
    </div>
  );
}
