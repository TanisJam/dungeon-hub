import type { CharacterSheet, SpellcastingView } from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { RacialSpellsBlock } from './_racial-spells-block';

const ABILITY_ES: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

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

  return (
    <div className="space-y-4">
      {/* Hechizos raciales — rendered before class spells (racial spells are always available) */}
      {hasRacialSpells && <RacialSpellsBlock racialSpells={sheet.racialSpells} />}
      {hasClassSpells && sheet.spellcasting.map((sc: SpellcastingView) => (
        <Card key={`${sc.classSlug}-${sc.classSource}`} variant="surface" className="p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            {sc.classSlug} <span className="normal-case text-ink-mute/60">· {sc.classSource}</span>
          </p>
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
        </Card>
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
