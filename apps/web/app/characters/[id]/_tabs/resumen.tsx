import type { CharacterSheet } from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { AbilityScoreGrid } from '@/components/sheet/ability-score-grid';

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
  return (
    <div className="space-y-4">
      {/* Atributos */}
      <Card variant="surface" className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
            Atributos
          </p>
          <span className="text-[10px] font-semibold text-ink-soft">
            Comp. {fmtMod(sheet.proficiencyBonus)}
          </span>
        </div>
        <AbilityScoreGrid scores={sheet.abilityScores} />
      </Card>

      {/* Salvaciones — 2-col grid of cards */}
      <Card variant="surface" className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Salvaciones
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sheet.savingThrows.map((st) => (
            <div
              key={st.ability}
              className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2"
            >
              {/* Proficiency dot */}
              <span
                className={[
                  'h-3 w-3 flex-shrink-0 rounded-full border',
                  st.proficient
                    ? 'bg-primary border-primary-deep'
                    : 'bg-surface border-line',
                ].join(' ')}
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink leading-tight">
                  {ABILITY_LONG_ES[st.ability] ?? st.ability}
                </span>
                <span className="text-[9px] text-ink-mute">{ABILITY_ES[st.ability] ?? st.ability.toUpperCase()}</span>
              </div>
              <span
                className={[
                  'text-xs font-bold flex-shrink-0',
                  st.proficient ? 'text-primary-deep' : 'text-ink-soft',
                ].join(' ')}
              >
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
      {(sheet.proficiencies.languages.length > 0 ||
        sheet.proficiencies.armor.length > 0 ||
        sheet.proficiencies.weapons.length > 0 ||
        sheet.proficiencies.tools.length > 0) && (
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

      {/* Rasgos de clase */}
      <RasgosSection sheet={sheet} />
    </div>
  );
}

function RasgosSection({ sheet }: { sheet: CharacterSheet }) {
  const { classes } = sheet.identity;
  if (classes.length === 0) return null;

  // Collect subclass labels for the section subtitle
  const subclassSlugs = classes
    .flatMap((c) => (c.subclass ? [titleCase(c.subclass.slug)] : []));
  const sectionSubtitle = subclassSlugs.length > 0 ? subclassSlugs.join(', ') : null;

  return (
    <Card variant="surface" className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Rasgos de clase
        </p>
        {sectionSubtitle && (
          <span className="text-[10px] text-ink-soft truncate ml-2">
            {sectionSubtitle}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {classes.map((cls) => (
          <div
            key={cls.slug}
            className="rounded-sm border border-line bg-surface px-3 py-3"
          >
            <p className="text-sm font-semibold text-ink">
              {titleCase(cls.slug)}{' '}
              <span className="font-normal text-ink-mute">nivel {cls.level}</span>
            </p>
            {cls.subclass && (
              <p className="mt-0.5 text-xs text-ink-soft">
                Subclase: {titleCase(cls.subclass.slug)}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-mute italic">
              Próximamente: descripciones detalladas de rasgos.
            </p>
          </div>
        ))}
      </div>
    </Card>
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
