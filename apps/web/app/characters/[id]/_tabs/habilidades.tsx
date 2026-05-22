import type { CharacterSheet, SkillView } from '@/lib/sheet-types';
import { Card } from '@/components/ui';

const ABILITY_ES: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

interface HabilidadesTabProps {
  sheet: CharacterSheet;
}

export function HabilidadesTab({ sheet }: HabilidadesTabProps) {
  return (
    <Card variant="surface" className="p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Habilidades
      </p>
      <div className="space-y-1.5">
        {sheet.skills.map((skill: SkillView) => (
          <SkillRow key={skill.name} skill={skill} />
        ))}
      </div>
    </Card>
  );
}

function SkillRow({ skill }: { skill: SkillView }) {
  const indicator = skill.expertise
    ? 'bg-primary-deep'
    : skill.proficient
    ? 'bg-primary-soft border border-primary'
    : 'bg-paper-soft border border-line';

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`h-3 w-3 flex-shrink-0 rounded-full ${indicator}`}
          title={skill.expertise ? 'Maestría' : skill.proficient ? 'Competencia' : 'Sin competencia'}
        />
        <span className="truncate text-sm text-ink">{skill.name}</span>
        <span className="text-[10px] font-bold text-ink-mute flex-shrink-0">
          {ABILITY_ES[skill.ability] ?? skill.ability.toUpperCase()}
        </span>
      </div>
      <span className={['flex-shrink-0 text-sm font-semibold', skill.proficient ? 'text-primary-deep' : 'text-ink-soft'].join(' ')}>
        {fmtMod(skill.modifier)}
      </span>
    </div>
  );
}
