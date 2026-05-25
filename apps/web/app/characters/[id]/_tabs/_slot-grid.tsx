'use client';

/**
 * SP-05 — Tap-to-consume slot bubbles + short rest button.
 * Mobile-first: 375px baseline. Tap targets ≥ 44px (CLAUDE.md §2).
 * PHB p.201 — expend a spell slot. PHB p.107 — pact magic: separate pool.
 */
import { useTransition } from 'react';
import { useSpellSlot, shortRest } from '../actions';

// ── SlotGrid ─────────────────────────────────────────────────────────────────

interface SlotGridProps {
  /** Character ID (UUID). Passed to Server Action. */
  charId: string;
  /** Spell level (1–9). */
  level: number;
  /** Maximum slots available at this level. */
  max: number;
  /** Slots already used (consumed) at this level. */
  used: number;
}

/**
 * Regular spell slot bubble grid for a single level.
 * Filled bubble (available): tap to consume.
 * Empty bubble (used): no-op tap target.
 * Mobile layout: 6 per row at 375px, 9 on md+.
 */
export function SlotGrid({ charId, level, max, used }: SlotGridProps) {
  const [isPending, startTransition] = useTransition();

  function handleTap(bubbleIdx: number) {
    // Only filled bubbles (index < max - used) are interactive.
    if (bubbleIdx >= max - used) return;
    if (isPending) return;
    startTransition(async () => {
      await useSpellSlot(charId, level, 'regular');
    });
  }

  return (
    <div className="grid grid-cols-6 gap-1 md:grid-cols-9">
      {Array.from({ length: max }, (_, i) => {
        const isFilled = i < max - used;
        return (
          <div key={i} className="p-1">
            <button
              type="button"
              aria-label={isFilled ? `Gastar slot nivel ${level}` : `Slot nivel ${level} gastado`}
              disabled={!isFilled || isPending}
              onClick={() => handleTap(i)}
              className={[
                'w-10 h-10 rounded-full transition-opacity',
                isFilled
                  ? 'bg-amber-400 hover:bg-amber-500'
                  : 'bg-transparent border border-zinc-600',
                !isFilled || isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── PactSlotGrid ─────────────────────────────────────────────────────────────

interface PactSlotGridProps {
  charId: string;
  /** The warlock's single pact slot level. */
  pactLevel: number;
  /** Total pact slots (slotCount from pactMagic). */
  max: number;
  /** Pact slots already used. */
  used: number;
}

/**
 * Warlock pact magic slot bubbles.
 * Purple tint to visually distinguish from regular slots.
 * Tap to consume; empty bubble is no-op.
 */
export function PactSlotGrid({ charId, pactLevel, max, used }: PactSlotGridProps) {
  const [isPending, startTransition] = useTransition();

  function handleTap(bubbleIdx: number) {
    if (bubbleIdx >= max - used) return;
    if (isPending) return;
    startTransition(async () => {
      await useSpellSlot(charId, pactLevel, 'pact');
    });
  }

  return (
    <div className="grid grid-cols-6 gap-1 md:grid-cols-9">
      {Array.from({ length: max }, (_, i) => {
        const isFilled = i < max - used;
        return (
          <div key={i} className="p-1">
            <button
              type="button"
              aria-label={isFilled ? `Gastar slot de pacto nivel ${pactLevel}` : `Slot de pacto nivel ${pactLevel} gastado`}
              disabled={!isFilled || isPending}
              onClick={() => handleTap(i)}
              className={[
                'w-10 h-10 rounded-full transition-opacity',
                isFilled
                  ? 'bg-purple-500 hover:bg-purple-600'
                  : 'bg-transparent border border-purple-400',
                !isFilled || isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── ShortRestButton ───────────────────────────────────────────────────────────

interface ShortRestButtonProps {
  charId: string;
}

/**
 * "Descanso Corto" button that calls POST /rest/short.
 * PHB p.107 — short rest resets warlock pact slots.
 * PHB p.186 — short rest does NOT reset regular spell slots.
 */
export function ShortRestButton({ charId }: ShortRestButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;
    startTransition(async () => {
      await shortRest(charId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="w-full md:w-auto rounded-lg bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? 'Descansando…' : 'Descanso Corto'}
    </button>
  );
}
