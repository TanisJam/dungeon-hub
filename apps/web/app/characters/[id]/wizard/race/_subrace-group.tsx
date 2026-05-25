'use client';

import { useEffect, useState } from 'react';
import { ChoiceCard } from '@/components/wizard/choice-card';
import type { ChoiceOption } from '@/components/wizard/choice-list';

export interface SubraceGroupProps {
  parentName: string;
  parentSlug: string;
  subraces: ChoiceOption<string>[];
  selectedSubraceKey: string | null;
  /**
   * When true, the group expands. Responds to prop changes: if a search query causes
   * defaultOpen to flip from false to true, the group opens. If the user manually
   * collapsed it and defaultOpen goes back to false, it collapses.
   */
  defaultOpen?: boolean;
  onSelect: (key: string | null) => void;
  /**
   * When true, the parent itself is selectable as a PHB-base race (Half-Elf, Half-Orc,
   * Tiefling, Human, etc. — races whose subraces are optional variants, not required).
   * In that case the header is rendered as a ChoiceCard for the parent, with a separate
   * "Mostrar variantes" toggle below.
   *
   * When false (default), the header is a non-selectable group toggle — used for
   * RACES_REQUIRING_SUBRACE (Elf/Dwarf/Gnome/Halfling/Dragonborn PHB).
   */
  parentSelectable?: boolean;
  /** Parent's ChoiceOption — required when parentSelectable is true. */
  parentOption?: ChoiceOption<string>;
}

export function SubraceGroup({
  parentName,
  parentSlug,
  subraces,
  selectedSubraceKey,
  defaultOpen = false,
  onSelect,
  parentSelectable = false,
  parentOption,
}: SubraceGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Sync with external defaultOpen changes (e.g. search query auto-expand / auto-collapse)
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const count = subraces.length;

  if (parentSelectable && parentOption) {
    const isParentSelected = parentOption.key === selectedSubraceKey;
    // When the active parent variant has no subraces (e.g. multi-source merged parent where
    // the active source is a base race without subraces), render just the ChoiceCard — no
    // variants toggle, no expanded section.
    if (count === 0) {
      return (
        <ChoiceCard
          id={parentOption.key}
          title={parentOption.title}
          subtitle={parentOption.subtitle ?? parentOption.sub}
          pills={parentOption.pills ?? parentOption.metaPills}
          iconName={parentOption.iconName}
          selected={isParentSelected}
          onClick={() => onSelect(isParentSelected ? null : parentOption.key)}
          detail={parentOption.detail}
        />
      );
    }
    return (
      <div
        className={[
          'rounded-md border overflow-hidden transition-all',
          isParentSelected
            ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
            : 'border-line',
        ].join(' ')}
      >
        {/* Parent ChoiceCard — borderless so the outer wrapper provides the border */}
        <div className="[&>div]:!border-0 [&>div]:!rounded-none [&>div]:!shadow-none">
          <ChoiceCard
            id={parentOption.key}
            title={parentOption.title}
            subtitle={parentOption.subtitle ?? parentOption.sub}
            pills={parentOption.pills ?? parentOption.metaPills}
            iconName={parentOption.iconName}
            selected={isParentSelected}
            onClick={() => onSelect(isParentSelected ? null : parentOption.key)}
            detail={parentOption.detail}
          />
        </div>

        {/* Variants toggle — visually attached to the parent card */}
        <button
          type="button"
          data-testid={`subrace-group-${parentSlug}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 border-t border-line bg-surface/60 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-ink-mute transition hover:bg-accent-soft/30"
        >
          <span className="flex items-center gap-1.5">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {count} variante{count !== 1 ? 's' : ''} opcional{count !== 1 ? 'es' : ''} ({open ? 'ocultar' : 'mostrar'})
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={['transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Variants list — inside the same outer container, indented to signal nesting */}
        {open && (
          <div className="space-y-2 border-t border-line bg-paper px-2 py-2 pl-4">
            {subraces.map((opt) => {
              const isSelected = opt.key === selectedSubraceKey;
              return (
                <ChoiceCard
                  key={opt.key}
                  id={opt.key}
                  title={opt.title}
                  subtitle={opt.subtitle ?? opt.sub}
                  pills={opt.pills ?? opt.metaPills}
                  iconName={opt.iconName}
                  selected={isSelected}
                  onClick={() => onSelect(isSelected ? null : opt.key)}
                  detail={opt.detail}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface overflow-hidden">
      {/* Group header — NOT selectable, only toggles expand/collapse (required-subrace races) */}
      <button
        type="button"
        data-testid={`subrace-group-${parentSlug}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-accent-soft/30"
      >
        {/* Icon square — same size as ChoiceCard but subdued tone */}
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,var(--color-secondary-soft),var(--color-secondary))]"
          aria-hidden="true"
        >
          {/* Simple shield/group icon via SVG */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-paper opacity-90"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </span>

        {/* Middle: parent name + counter */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold leading-tight text-ink">
            {parentName}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-mute">
            {count} sublinaje{count !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Right: chevron */}
        <span className="flex shrink-0 items-center justify-center text-ink-mute" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={['transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Expanded body: subrace ChoiceCards */}
      {open && (
        <div className="border-t border-line bg-paper px-2 pb-2 pt-2 space-y-2">
          {subraces.map((opt) => {
            const isSelected = opt.key === selectedSubraceKey;
            return (
              <ChoiceCard
                key={opt.key}
                id={opt.key}
                title={opt.title}
                subtitle={opt.subtitle ?? opt.sub}
                pills={opt.pills ?? opt.metaPills}
                iconName={opt.iconName}
                selected={isSelected}
                onClick={() => onSelect(isSelected ? null : opt.key)}
                detail={opt.detail}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
