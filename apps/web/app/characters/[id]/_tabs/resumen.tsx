import type { CharacterSheet } from '@/lib/sheet-types';
import { Card } from '@/components/ui';

const ABILITY_ES: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

const ABILITY_LONG_ES: Record<string, string> = {
  str: 'Fuerza', dex: 'Destreza', con: 'Constitución', int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma',
};

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

interface ResumenTabProps {
  sheet: CharacterSheet;
}

export function ResumenTab({ sheet }: ResumenTabProps) {
  const abilityEntries = Object.entries(sheet.abilityScores) as Array<[string, { score: number; modifier: number }]>;

  return (
    <div className="space-y-4">
      {/* Ability scores */}
      <Card variant="surface" className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Atributos
        </p>
        <div className="grid grid-cols-3 gap-2">
          {abilityEntries.map(([key, view]) => (
            <div
              key={key}
              className="flex flex-col items-center rounded-md bg-paper-soft p-2.5 text-center"
            >
              <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
                {ABILITY_ES[key] ?? key.toUpperCase()}
              </span>
              <span className="font-display text-2xl font-bold text-ink leading-tight">
                {view.score}
              </span>
              <span className="text-xs text-ink-soft">{fmtMod(view.modifier)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Saving throws */}
      <Card variant="surface" className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Salvaciones
        </p>
        <div className="space-y-1.5">
          {sheet.savingThrows.map((st) => (
            <div key={st.ability} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'h-3.5 w-3.5 rounded-full border flex-shrink-0',
                    st.proficient
                      ? 'bg-primary border-primary-deep'
                      : 'bg-paper-soft border-line',
                  ].join(' ')}
                />
                <span className="text-sm text-ink">
                  {ABILITY_LONG_ES[st.ability] ?? st.ability}
                </span>
              </div>
              <span className={['text-sm font-semibold', st.proficient ? 'text-primary-deep' : 'text-ink-soft'].join(' ')}>
                {fmtMod(st.modifier)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Secondary stats */}
      <Card variant="surface" className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Secundarios
        </p>
        <div className="grid grid-cols-2 gap-3">
          <StatRow label="Percepción Pasiva" value={String(sheet.passivePerception)} />
          <StatRow label="Bonif. Competencia" value={fmtMod(sheet.proficiencyBonus)} />
          <StatRow label="Vel. de Movimiento" value={`${sheet.speed.walk}ft`} />
          <StatRow label="Tamaño" value={sheet.size} />
          {sheet.hitDice && Object.entries(sheet.hitDice).map(([die, count]) => (
            <StatRow key={die} label="Dados de Golpe" value={`${count}${die}`} />
          ))}
        </div>
      </Card>

      {/* Proficiencies */}
      {(sheet.proficiencies.languages.length > 0 || sheet.proficiencies.tools.length > 0) && (
        <Card variant="surface" className="p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Competencias
          </p>
          <div className="space-y-2">
            {sheet.proficiencies.languages.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-ink-mute">Idiomas</span>
                <p className="text-sm text-ink">
                  {sheet.proficiencies.languages.map(titleCase).join(', ')}
                </p>
              </div>
            )}
            {sheet.proficiencies.armor.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-ink-mute">Armaduras</span>
                <p className="text-sm text-ink">
                  {sheet.proficiencies.armor.map(titleCase).join(', ')}
                </p>
              </div>
            )}
            {sheet.proficiencies.weapons.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-ink-mute">Armas</span>
                <p className="text-sm text-ink">
                  {sheet.proficiencies.weapons.map(titleCase).join(', ')}
                </p>
              </div>
            )}
            {sheet.proficiencies.tools.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase text-ink-mute">Herramientas</span>
                <p className="text-sm text-ink">
                  {sheet.proficiencies.tools.map(titleCase).join(', ')}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase text-ink-mute">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
