'use client';

type TabItem = {
  classSlug: string;
  label: string;
  isComplete: boolean;
};

type TabBarProps = {
  tabs: TabItem[];
  activeSlug: string;
  onTabChange: (slug: string) => void;
};

export function TabBar({ tabs, activeSlug, onTabChange }: TabBarProps) {
  return (
    <div
      className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 whitespace-nowrap"
      role="tablist"
      aria-label="Clases"
    >
      {tabs.map((tab) => {
        const isActive = tab.classSlug === activeSlug;
        return (
          <button
            key={tab.classSlug}
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.classSlug)}
            type="button"
            className={[
              'inline-flex items-center gap-1 min-h-11 px-3 py-2 text-sm rounded-t transition-colors',
              isActive
                ? 'font-semibold border-b-2 border-[var(--color-accent)] text-ink'
                : 'text-ink-mute hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
            {!tab.isComplete && (
              <span
                className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500 inline-block"
                aria-label="incomplete"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
