'use client';

/**
 * Character-wide rest actions — Short Rest + Long Rest.
 * Transversal to all tabs: short/long rest affect HP, hit dice, spell slots, and
 * other class resources, so the buttons live in the sheet header, not in any one tab.
 *
 * PHB p.186 — Short Rest: 1 hour, spend hit dice. Long Rest: 8 hours, full HP +
 * half total hit dice + all expended spell slots (except warlock pact slots,
 * which recover on short rest per PHB p.107).
 */
import { useTransition } from 'react';
import { shortRest, longRest } from './actions';

interface RestActionsProps {
  charId: string;
}

export function RestActions({ charId }: RestActionsProps) {
  const [isShortPending, startShort] = useTransition();
  const [isLongPending, startLong] = useTransition();
  const isPending = isShortPending || isLongPending;

  function handleShort() {
    if (isPending) return;
    startShort(async () => {
      await shortRest(charId);
    });
  }

  function handleLong() {
    if (isPending) return;
    const confirmed = window.confirm(
      'Descanso largo: recupera HP al máximo, mitad de los dados de golpe y todos los espacios de hechizo. ¿Continuar?',
    );
    if (!confirmed) return;
    startLong(async () => {
      await longRest(charId);
    });
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="Acciones de descanso">
      <button
        type="button"
        onClick={handleShort}
        disabled={isPending}
        className="flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-semibold text-ink-mute hover:bg-paper-muted hover:text-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
      >
        {isShortPending ? 'Descansando…' : 'Descanso corto'}
      </button>
      <button
        type="button"
        onClick={handleLong}
        disabled={isPending}
        className="flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-semibold text-ink-mute hover:bg-paper-muted hover:text-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed sm:flex-none"
      >
        {isLongPending ? 'Descansando…' : 'Descanso largo'}
      </button>
    </div>
  );
}
