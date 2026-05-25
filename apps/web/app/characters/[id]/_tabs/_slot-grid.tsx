'use client';

/**
 * SP-05 — Tap-to-consume slot bubbles + short rest button.
 * Mobile-first: 375px baseline. Tap targets ≥ 44px (CLAUDE.md §2).
 * PHB p.201 — expend a spell slot. PHB p.107 — pact magic: separate pool.
 */
import { useTransition } from 'react';
import { useSpellSlot } from '../actions';

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
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, i) => {
        const isFilled = i < max - used;
        return (
          <button
            key={i}
            type="button"
            aria-label={isFilled ? `Gastar slot nivel ${level}` : `Slot nivel ${level} gastado`}
            disabled={!isFilled || isPending}
            onClick={() => handleTap(i)}
            className={[
              'inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors',
              isFilled ? 'cursor-pointer hover:bg-amber-100/60 active:bg-amber-100' : 'cursor-default',
              isPending && 'opacity-60 cursor-wait',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className={[
                'block h-6 w-6 rounded-full border-2 transition-colors',
                isFilled
                  ? 'border-amber-500 bg-amber-400'
                  : 'border-amber-300/50 bg-transparent',
              ].join(' ')}
            />
          </button>
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
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, i) => {
        const isFilled = i < max - used;
        return (
          <button
            key={i}
            type="button"
            aria-label={isFilled ? `Gastar slot de pacto nivel ${pactLevel}` : `Slot de pacto nivel ${pactLevel} gastado`}
            disabled={!isFilled || isPending}
            onClick={() => handleTap(i)}
            className={[
              'inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors',
              isFilled ? 'cursor-pointer hover:bg-purple-100/60 active:bg-purple-100' : 'cursor-default',
              isPending && 'opacity-60 cursor-wait',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className={[
                'block h-6 w-6 rounded-full border-2 transition-colors',
                isFilled
                  ? 'border-purple-600 bg-purple-500'
                  : 'border-purple-300/50 bg-transparent',
              ].join(' ')}
            />
          </button>
        );
      })}
    </div>
  );
}

