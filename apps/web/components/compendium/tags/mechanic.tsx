import type { TagHandler } from '../inline';
import { takeFirstSegment } from '../inline';

/**
 * Mechanic tags render as monospace badges so dice / DCs / damage stand out
 * from prose. These tags do NOT emit data-compendium-ref — they're roll
 * triggers, not entity references. A future "click-to-roll" SDD can wire them.
 */
const badge = (children: React.ReactNode) => (
  <span className="font-mono bg-paper-soft border border-line rounded-sm px-1 text-ink">
    {children}
  </span>
);

/** Attack code map for `{@atk mw}` / `{@atkr ms}` etc. */
const ATTACK_LABELS: Record<string, string> = {
  mw: 'Melee Weapon Attack:',
  rw: 'Ranged Weapon Attack:',
  ms: 'Melee Spell Attack:',
  rs: 'Ranged Spell Attack:',
  mw_rw: 'Melee or Ranged Weapon Attack:',
  ms_rs: 'Melee or Ranged Spell Attack:',
};

export const MECHANIC_TAGS: Record<string, TagHandler> = {
  dc: (args) => badge(`DC ${takeFirstSegment(args)}`),
  dice: (args) => badge(takeFirstSegment(args)),
  damage: (args) => badge(takeFirstSegment(args)),
  hit: (args) => badge(`+${takeFirstSegment(args)}`),
  d20: (args) => badge(takeFirstSegment(args)),
  chance: (args) => badge(`${takeFirstSegment(args)}%`),
  recharge: (args) => {
    const v = takeFirstSegment(args);
    return (
      <span className="text-ink-mute text-sm italic">
        (Recharge {v || '6'})
      </span>
    );
  },
  scaledamage: (args) => {
    // `{@scaledamage baseDice|levels|formula}` — show formula (last segment)
    const parts = args.split('|');
    return badge(parts[2] || parts[0] || '');
  },
  scaledice: (args) => {
    const parts = args.split('|');
    return badge(parts[2] || parts[0] || '');
  },
  atk: (args) => (
    <em className="font-semibold text-ink">{ATTACK_LABELS[takeFirstSegment(args)] ?? takeFirstSegment(args)}</em>
  ),
  atkr: (args) => (
    <em className="font-semibold text-ink">{ATTACK_LABELS[takeFirstSegment(args)] ?? takeFirstSegment(args)}</em>
  ),
  // Save outcomes are bold-italic labels in 5etools prose
  actSave: (args) => <em className="font-semibold text-ink">{takeFirstSegment(args)} Save:</em>,
  actSaveFail: () => <em className="font-semibold text-ink">Failure:</em>,
  actSaveSuccess: () => <em className="font-semibold text-ink">Success:</em>,
};
