// REQ-WCO-WEB-03 — ConditionBadges: inline badges for PHB conditions + spell effects.
//
// Condition names come from the API verbatim; they are PHB Appendix A canonical names
// (Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated,
//  Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious
//  — PHB Appendix A p.290-292). Effect names are spell names (e.g. Bless PHB p.219,
//  Hex PHB p.251, Hunter's Mark PHB p.251).
//
// Presentational Server Component — no 'use client' needed.
// B2: migrated from raw inline span to <Pill> (tone amber + secondary, size sm).
//   Note: minor shape change rounded→rounded-pill, px-1.5→px-2 (Pill sm baseline).

import { Pill } from '@/components/ui/pill';

type Props = {
  conditions: string[];
  effects: string[];
};

export function ConditionBadges({ conditions, effects }: Props) {
  if (conditions.length === 0 && effects.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-1">
      {conditions.map((name) => (
        <Pill key={`cond-${name}`} tone="amber" size="sm">
          {name}
        </Pill>
      ))}
      {effects.map((name) => (
        <Pill key={`effect-${name}`} tone="secondary" size="sm">
          {name}
        </Pill>
      ))}
    </span>
  );
}
