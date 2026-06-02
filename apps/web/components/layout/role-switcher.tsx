'use client';

import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/use-role';
import { useRole } from '@/lib/use-role';

interface RoleSwitcherProps {
  /**
   * Initial/default role when no stored value is found in localStorage.
   * Pass 'dm' for GM users so the switcher shows DM selected on first visit.
   * Defaults to 'player'.
   */
  defaultRole?: Role;
}

/**
 * RoleSwitcher — animated pill toggling between Jugador and DM.
 * Thumb slides via `left` transition; gradient + glow swap by role.
 */
export function RoleSwitcher({ defaultRole = 'player' }: RoleSwitcherProps) {
  // `defaultRole` is the SERVER's per-world effectiveView (authoritative). We display
  // THAT — not useRole()'s localStorage value, which can go stale and desync from the
  // server (a stale localStorage='player' previously made the toggle a no-op). We still
  // use setRole to dual-write the dh:role cookie + localStorage + sync event.
  const [, setRole] = useRole(defaultRole);
  const router = useRouter();
  const role = defaultRole;

  // Toggling writes the dh:role cookie (in setRole). Server Components gated on
  // that cookie (e.g. the /inicio player/DM trees) only re-render on a refresh,
  // so trigger one here — otherwise the view stays stale until navigation.
  const select = (next: Role) => {
    if (next === role) return;
    setRole(next);
    router.refresh();
  };

  // Small + discreet: tight padding, micro label, no glow (subtle gradient thumb only).
  const thumbClass =
    role === 'player'
      ? 'left-[2px] bg-gradient-to-b from-accent to-accent-deep'
      : 'left-1/2 bg-gradient-to-b from-secondary to-secondary-deep';

  return (
    <div
      data-value={role}
      className="relative inline-grid grid-cols-2 p-[2px] rounded-pill border border-line-soft bg-surface/80"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-[2px] bottom-[2px] w-[calc(50%-2px)] rounded-pill transition-[left] duration-200 ease-out ${thumbClass}`}
      />
      <button
        type="button"
        onClick={() => select('player')}
        aria-pressed={role === 'player'}
        className={`relative z-10 px-[7px] py-[2px] rounded-pill font-sans font-semibold text-[8px] uppercase tracking-[0.06em] whitespace-nowrap text-center transition-colors duration-200 ease-out ${
          role === 'player' ? 'text-on-accent' : 'text-ink-mute'
        }`}
      >
        Jugador
      </button>
      <button
        type="button"
        onClick={() => select('dm')}
        aria-pressed={role === 'dm'}
        className={`relative z-10 px-[7px] py-[2px] rounded-pill font-sans font-semibold text-[8px] uppercase tracking-[0.06em] whitespace-nowrap text-center transition-colors duration-200 ease-out ${
          role === 'dm' ? 'text-on-secondary' : 'text-ink-mute'
        }`}
      >
        DM
      </button>
    </div>
  );
}
