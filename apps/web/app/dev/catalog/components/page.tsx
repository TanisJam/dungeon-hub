import { COMPONENT_REGISTRY, type ComponentGroup } from './_registry';
import { Frame375 } from './_frame-375';
import { DomainContentIsland } from './_islands/domain-content-island';

const GROUP_LABELS: Record<ComponentGroup, string> = {
  ui:     'ui/ primitives',
  layout: 'layout/ components',
  sheet:  'sheet/ components',
  wizard: 'wizard/ components',
};

const GROUP_ORDER: ComponentGroup[] = ['ui', 'layout', 'sheet', 'wizard'];

/**
 * Components gallery — renders every ComponentEntry × variants inside Frame375.
 * DEV-COMP-01: all ui/ + layout/ components are present via the central registry.
 * DEV-COMP-02: each example is constrained to 375px via Frame375.
 * DEV-COMP-03: touch-target probe flags interactive elements < 44px.
 */
export default function ComponentsPage() {
  // Group entries by their group field
  const grouped = GROUP_ORDER.reduce<Record<ComponentGroup, typeof COMPONENT_REGISTRY[0][]>>(
    (acc, g) => {
      acc[g] = COMPONENT_REGISTRY.filter((e) => e.group === g);
      return acc;
    },
    { ui: [], layout: [], sheet: [], wizard: [] }
  );

  return (
    <div className="space-y-2 pb-12">
      <h1 className="font-display font-bold text-xl text-ink">Components</h1>
      <p className="text-xs text-ink-mute">
        Every exported <code className="font-mono text-ink-soft">ui/</code> and{' '}
        <code className="font-mono text-ink-soft">layout/</code> component rendered in all
        documented variants. Each example is constrained to 375px. Interactive elements below
        44×44px are flagged by the touch-target probe.
      </p>

      {GROUP_ORDER.map((group) => {
        const entries = grouped[group];
        if (entries.length === 0) return null;

        return (
          <section key={group} className="mt-6 space-y-4">
            <h2 className="font-mono text-xs font-bold text-ink-mute uppercase tracking-widest border-b border-line pb-1">
              {GROUP_LABELS[group]}
            </h2>

            {entries.map((entry) => (
              <div key={entry.id} className="space-y-2">
                {/* Component header */}
                <div>
                  <h3 className="font-display font-semibold text-sm text-ink">{entry.name}</h3>
                  {entry.notes && (
                    <p className="text-[10px] text-ink-mute font-mono mt-0.5">{entry.notes}</p>
                  )}
                </div>

                {/* Variants — each in its own Frame375 */}
                <div className="space-y-2">
                  {entry.variants.map((variant) => (
                    <Frame375 key={variant.label} label={variant.label}>
                      <div className="p-3">
                        {variant.node}
                      </div>
                    </Frame375>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}

      {/* Domain content — compendium renderers with fixture data */}
      <DomainContentIsland />
    </div>
  );
}
