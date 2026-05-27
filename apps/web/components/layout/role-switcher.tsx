'use client';

import { useRole } from '@/lib/use-role';

/**
 * RoleSwitcher — animated pill toggling between Jugador and DM.
 * Thumb slides via `left` transition; gradient + glow swap by role.
 */
export function RoleSwitcher() {
  const [role, setRole] = useRole();

  const thumbClass =
    role === 'player'
      ? 'left-[3px] bg-gradient-to-b from-accent to-accent-deep shadow-glow-accent'
      : 'left-1/2 bg-gradient-to-b from-secondary to-secondary-deep shadow-glow-secondary';

  return (
    <div
      data-value={role}
      className="relative inline-flex p-[3px] rounded-pill border border-line bg-surface"
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] bottom-[3px] w-[calc(50%-3px)] rounded-pill transition-[left] duration-300 ease-out ${thumbClass}`}
      />
      <button
        type="button"
        onClick={() => setRole('player')}
        aria-pressed={role === 'player'}
        className={`relative z-10 px-[11px] py-[5px] rounded-pill font-sans font-bold text-[9px] uppercase tracking-[0.08em] whitespace-nowrap transition-colors duration-300 ease-out ${
          role === 'player' ? 'text-[#1A1208]' : 'text-ink-mute'
        }`}
      >
        Jugador
      </button>
      <button
        type="button"
        onClick={() => setRole('dm')}
        aria-pressed={role === 'dm'}
        className={`relative z-10 px-[11px] py-[5px] rounded-pill font-sans font-bold text-[9px] uppercase tracking-[0.08em] whitespace-nowrap transition-colors duration-300 ease-out ${
          role === 'dm' ? 'text-[#1A1208]' : 'text-ink-mute'
        }`}
      >
        DM
      </button>
    </div>
  );
}
