import { COMPONENT_REGISTRY } from './_registry';
import type { ComponentGroup } from './_registry-types';
import { buildMatrix } from './_matrix';
import { Frame375 } from './_frame-375';

const GROUP_LABELS: Record<ComponentGroup, string> = {
  ui:          'ui/ primitives',
  layout:      'layout/ components',
  sheet:       'sheet/ components',
  wizard:      'wizard/ components',
  form:        'form/ primitives',
  encuentros:  'encuentros/ organisms',
  ficha:       'ficha/ organisms',
  campanas:    'campanas/ components',
  inicio:      'inicio/ components',
  compendium:  'compendium/ renderers',
  world:       'world/ components',
};

const GROUP_ORDER: ComponentGroup[] = ['ui', 'layout', 'sheet', 'wizard', 'form', 'encuentros', 'ficha', 'campanas', 'inicio', 'compendium', 'world'];

/**
 * Components gallery — renders every ComponentEntry × buildMatrix combos inside Frame375.
 * DEV-COMP-01: all ui/ + layout/ components are present via the central registry.
 * DEV-COMP-02: each example is constrained to 375px via Frame375.
 * DEV-COMP-03: touch-target probe flags interactive elements < 44px.
 * REQ-A0-02: variantAxes summary rendered above each variant grid.
 * REQ-A0-03: propsSchema rendered as a props table below each entry header.
 * REQ-A0-08: no live controls — fully static Server Component render.
 */
export default function ComponentsPage() {
  const grouped = GROUP_ORDER.reduce<Record<ComponentGroup, typeof COMPONENT_REGISTRY>>(
    (acc, g) => {
      acc[g] = COMPONENT_REGISTRY.filter((e) => e.group === g);
      return acc;
    },
    { ui: [], layout: [], sheet: [], wizard: [], form: [], encuentros: [], ficha: [], campanas: [], inicio: [], compendium: [], world: [] }
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

            {entries.map((entry) => {
              const combos = buildMatrix(entry);
              const schemaEntries = Object.entries(entry.propsSchema);
              const axisNames = entry.variantAxes ? Object.keys(entry.variantAxes) : [];

              // 'bare' entries manage their own framing (e.g. islands that render
              // their own 375px frames internally). Skip the Frame375 matrix wrap.
              if (entry.preview === 'bare') {
                return (
                  <div key={entry.id} className="space-y-2">
                    <div>
                      <h3 className="font-display font-semibold text-sm text-ink">{entry.name}</h3>
                      {entry.notes && (
                        <p className="text-[10px] text-ink-mute font-mono mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                    {entry.render(
                      (entry.fixedProps ?? {}) as Parameters<typeof entry.render>[0]
                    )}
                  </div>
                );
              }

              return (
                <div key={entry.id} className="space-y-2">
                  {/* Component header */}
                  <div>
                    <h3 className="font-display font-semibold text-sm text-ink">{entry.name}</h3>
                    {entry.notes && (
                      <p className="text-[10px] text-ink-mute font-mono mt-0.5">{entry.notes}</p>
                    )}
                  </div>

                  {/* REQ-A0-03: Props schema table */}
                  {schemaEntries.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-line text-ink-mute">
                            <th className="text-left py-0.5 pr-3 font-semibold">prop</th>
                            <th className="text-left py-0.5 pr-3 font-semibold">type</th>
                            <th className="text-left py-0.5 pr-3 font-semibold">default</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schemaEntries.map(([name, spec]) => (
                            <tr key={name} className="border-b border-line/50">
                              <td className="py-0.5 pr-3 text-ink">{name}</td>
                              <td className="py-0.5 pr-3 text-primary-deep">
                                {spec.kind === 'enum'
                                  ? spec.options.join(' | ')
                                  : spec.kind}
                              </td>
                              <td className="py-0.5 pr-3 text-ink-mute">
                                {spec.default !== undefined ? String(spec.default) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* REQ-A0-02: Variant axes summary */}
                  {axisNames.length > 0 && (
                    <p className="text-[10px] text-ink-mute font-mono">
                      axes: {axisNames.join(' × ')}
                    </p>
                  )}

                  {/* Variant matrix — each combo in its own Frame375 */}
                  <div className="space-y-2">
                    {combos.map((combo, i) => (
                      <Frame375 key={`${combo.label}-${i}`} label={combo.label}>
                        <div className="p-3">
                          {entry.render(entry.fixedProps
                            ? { ...entry.fixedProps, ...combo.props } as Parameters<typeof entry.render>[0]
                            : combo.props as Parameters<typeof entry.render>[0]
                          )}
                        </div>
                      </Frame375>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
