'use client';

/**
 * StatusTabs — segmented control for the DM world landing filter.
 *
 * REQ-WDCL-WEB-LANDING (spec #857). Mobile-first: tap targets ≥44px height,
 * full-width horizontal segmented control that fits at 375px without overflow.
 *
 * Tab → query param mapping:
 *   Pendientes → ?status=pending_approval
 *   Activos    → ?status=active
 *   Todos      → omit ?status= (URL has no `status` key)
 */
import { useRouter } from 'next/navigation';

type TabKey = 'pendientes' | 'activos' | 'todos';

const TABS: ReadonlyArray<{ key: TabKey; label: string; statusParam: string | null }> = [
  { key: 'pendientes', label: 'Pendientes', statusParam: 'pending_approval' },
  { key: 'activos', label: 'Activos', statusParam: 'active' },
  { key: 'todos', label: 'Todos', statusParam: null },
];

function statusToTabKey(statusParam: string | undefined): TabKey {
  if (statusParam === undefined || statusParam === '') return 'pendientes';
  if (statusParam === 'active') return 'activos';
  if (statusParam === 'pending_approval') return 'pendientes';
  return 'todos';
}

interface StatusTabsProps {
  worldId: string;
  /** The raw `?status=` value currently in the URL (undefined if absent). */
  currentStatusParam: string | undefined;
}

export function StatusTabs({ worldId, currentStatusParam }: StatusTabsProps) {
  const router = useRouter();
  const activeKey = statusToTabKey(currentStatusParam);

  function handleClick(statusParam: string | null) {
    const target = statusParam
      ? `/worlds/${worldId}?status=${statusParam}`
      : `/worlds/${worldId}`;
    router.replace(target);
  }

  return (
    <div
      role="tablist"
      aria-label="Filtro de personajes"
      className="flex w-full gap-1 rounded-md bg-paper-soft p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleClick(tab.statusParam)}
            className={`min-h-[44px] flex-1 rounded px-2 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-ink text-paper'
                : 'text-ink-mute hover:bg-paper-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
