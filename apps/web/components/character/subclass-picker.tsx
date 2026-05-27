'use client';

/**
 * Shared subclass card picker — used in both the wizard (class/_picker.tsx)
 * and the level-up flow (_subclass-step.tsx).
 *
 * Lifted from apps/web/app/characters/[id]/wizard/class/_picker.tsx:319-370.
 * NO behavior change — pure file move + new export.
 *
 * REQ-CLU-SUB-UI-MOBILE: full-width radio-card pattern, ≥80px cards, ≥44px tap target.
 */

// Re-export SubclassRow type from the source to avoid duplication.
// The canonical type definition stays in the wizard picker.
export type { SubclassRow } from '@/app/characters/[id]/wizard/class/_picker';

export function SubclassPicker({
  title,
  options,
  selectedKey,
  onSelect,
}: {
  title: string;
  options: Array<{ id: string; slug: string; source: string; name: string; classSlug: string; classSource: string }>;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-md border border-warning-soft bg-warning-soft/30 p-2.5">
        <p className="text-xs text-warning-deep">
          {title} requerida, pero no hay opciones en el compendium.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        {title} — elegí 1
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        {options.map((sc) => {
          const k = `${sc.slug}|${sc.source}`;
          const isOn = k === selectedKey;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(isOn ? null : k)}
              className={[
                // Mobile-first: ≥80px height for accessible tap target (CLAUDE.md §2)
                'min-h-[80px] rounded-md border px-3 py-2 text-left text-xs transition',
                isOn
                  ? 'border-accent bg-accent-soft text-accent-deep'
                  : 'border-line bg-paper-soft text-ink-soft hover:border-accent-soft',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{sc.name}</span>
                <span className="shrink-0 text-[9px] uppercase text-ink-mute">{sc.source}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
