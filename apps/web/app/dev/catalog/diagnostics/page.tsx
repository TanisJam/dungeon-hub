/**
 * Diagnostics view — Server Component.
 * Renders the design debt audit (from exploration sdd/dev-design-catalog/explore)
 * as a labeled checklist.
 *
 * Status legend:
 *   open    — unresolved, requires follow-up cleanup
 *   slice4  — resolved by Slice 4 (token additions + Pill rename)
 *   followup — out of scope for this SDD; tracked for future work
 */

type DebtStatus = 'open' | 'slice4' | 'followup';

interface DebtItem {
  id: string;
  title: string;
  status: DebtStatus;
  description: string;
  affectedFiles: string[];
  resolution?: string;
}

const DEBT_ITEMS: DebtItem[] = [
  {
    id: 'raw-tw-colors',
    title: '1. Forbidden raw Tailwind color classes',
    status: 'followup',
    description:
      'globals.css explicitly forbids raw Tailwind palette utilities (amber-*, red-*, green-*, zinc-*, etc.). ' +
      'Several feature components use amber-*/red-*/green-* directly instead of the semantic tokens ' +
      '(warning-*, danger-*, success-*, primary-*).',
    affectedFiles: [
      'components/ficha/hp/hp-editor.tsx        — amber-* and red-*/green-*',
      'components/ficha/spells/spell-known-editor.tsx  — green-*',
      'components/ficha/spells/spell-prep-editor.tsx   — green-*',
    ],
    resolution:
      'Follow-up cleanup SDD: replace forbidden classes with semantic tokens. ' +
      'Not in scope for this change to avoid touching feature components.',
  },
  {
    id: 'hardcoded-hex',
    title: '2. Hardcoded hex/rgba without a token',
    status: 'followup',
    description:
      'Several components hardcode color values that should be (or already are) tokens. ' +
      'Repeated #1A1208 (dark text on accent) is the highest-value target — it will get ' +
      'a token in Slice 4 (on-accent / on-secondary). The remaining hex values in gradients ' +
      'and scoped CSS are lower priority.',
    affectedFiles: [
      'components/layout/role-switcher.tsx      — text-[#1A1208] on active button (→ text-on-accent after Slice 4)',
      'components/ficha/atributos-editor.tsx    — #1A1208 text on accent bg',
      'app/encuentros/[id]/page.tsx             — #1A1208 on .encuentros-init-next button',
      'globals.css .ficha-tab-active            — color: #1A1208 (also in scoped CSS)',
      'globals.css .inventory-*                 — #E48A82 peach, #C0473E danger red (no tokens)',
      'globals.css .ficha-hero-bg               — #2A2240/#1B1428 gradient (≈ surface but different)',
      'globals.css .personajes-portrait         — #2E1A28/#1A1726 (surface-soft/surface hex)',
      'globals.css .campanas-*                  — rgba with hardcoded hex values',
    ],
    resolution:
      'Slice 4 adds --color-on-accent and --color-on-secondary. Remaining hex in scoped CSS is ' +
      'a larger follow-up that needs a scoped-CSS refactor.',
  },
  {
    id: 'pill-tone-drift',
    title: '3. Pill tone naming drift (names lied about color)',
    status: 'slice4',
    description:
      'PillTone previously used: green (= cyan primary), pink (= copper accent), coral (= magenta secondary). ' +
      'The names described visual hues that did not match the actual colors, creating confusion ' +
      'with the semantic token names.',
    affectedFiles: [
      'components/ui/pill.tsx — PillTone definition + toneClasses',
      '15 literal callsites across 11 feature files',
      '1 dynamic ternary in components/encuentros/roster-row.tsx:38',
    ],
    resolution:
      'Resolved in Slice 4: PillTone renamed to primary | accent | secondary | ink | stone | amber. ' +
      'All callsites migrated. TypeScript enforcement prevents recurrence.',
  },
  {
    id: 'missing-tokens',
    title: '4. Missing semantic tokens: on-accent, on-secondary, type-scale',
    status: 'slice4',
    description:
      'No token for "dark text on colored backgrounds" — #1A1208 was repeated raw in role-switcher, ' +
      'atributos-editor, encuentros, ficha-tab. ' +
      'Type-scale: only 2 named @utility entries (text-eyebrow at 10px, text-stat at 28px). ' +
      'All other sizes (9, 11, 13, 15, 17, 19, 22, 26, 30px) used as arbitrary text-[Npx] values.',
    affectedFiles: [
      'app/globals.css — @theme block (now includes --color-on-accent: #1A1208, --color-on-secondary: #1A1208)',
      'app/globals.css — @utility block (now includes text-micro through text-display, 9 entries)',
    ],
    resolution:
      'DONE (Slice 4): --color-on-accent: #1A1208 and --color-on-secondary: #1A1208 added to @theme (both `:root` and `[data-palette]`). ' +
      '9 @utility type-scale entries added: text-micro(9px) text-caption(11px) text-footnote(13px) text-body(15px) text-body-lg(17px) text-subhead(19px) text-title(22px) text-headline(26px) text-display(30px). ' +
      'Adoption of text-[Npx] → named utility is a follow-up.',
  },
  {
    id: 'warning-accent-dupe',
    title: '5. warning ≡ accent (exact duplicate, ambiguous semantic)',
    status: 'slice4',
    description:
      'globals.css: --color-warning: #D4A24C was the same as --color-accent: #D4A24C. ' +
      'Likewise warning-deep = accent-deep and warning-soft = accent-soft. ' +
      'This made "warning" and "decorative copper accent" visually identical, ' +
      'making it impossible to distinguish caution states from brand accents.',
    affectedFiles: [
      'app/globals.css — @theme --color-warning: now #E0A82E (hotter amber, distinct from copper accent #D4A24C)',
      'app/globals.css — @theme --color-warning-deep: now #B07A1E (was #A87528)',
      'app/globals.css — @theme --color-warning-soft: kept #3A2D17 (shared dark bg — acceptable)',
    ],
    resolution:
      'DONE (Slice 4): warning now resolves to #E0A82E (amber) vs accent #D4A24C (copper). ' +
      'warning-deep is #B07A1E. Semantically unambiguous: amber = caution, copper = decorative brand accent.',
  },
  {
    id: 'scoped-css-parallel',
    title: '6. Scoped CSS parallel layer (.inicio-*, .campanas-*, .ficha-*, etc.)',
    status: 'followup',
    description:
      'globals.css contains large blocks of scoped CSS classes (.inicio-*, .campanas-*, ' +
      '.encuentros-*, .ficha-*, .personajes-*, .inventory-*, .compendium-*). ' +
      'These bypass the Tailwind utility model and hardcode rgba/font-size values. ' +
      'Maintenance risk: two systems (utilities + scoped CSS) that can drift.',
    affectedFiles: [
      'app/globals.css — all .inicio-*, .campanas-*, .encuentros-* blocks (~800 lines)',
      'app/globals.css — .ficha-*, .inventory-*, .compendium-* blocks (~600 lines)',
    ],
    resolution:
      'Out of scope for this SDD. Tracked as follow-up: extract to colocated CSS modules ' +
      'or convert to Tailwind utilities where feasible. ' +
      'High effort, requires visual regression testing.',
  },
];

const STATUS_CONFIG: Record<DebtStatus, { label: string; className: string; icon: string }> = {
  open:    { label: 'Open',            className: 'bg-danger/10 text-danger border border-danger/20',         icon: '○' },
  slice4:  { label: 'Resolved: Slice 4', className: 'bg-primary-soft text-primary-deep border border-primary-deep/20', icon: '✓' },
  followup: { label: 'Follow-up SDD',  className: 'bg-warning-soft text-warning-deep border border-warning-deep/20', icon: '◷' },
};

export default function DiagnosticsPage() {
  const openItems    = DEBT_ITEMS.filter((d) => d.status === 'open');
  const slice4Items  = DEBT_ITEMS.filter((d) => d.status === 'slice4');
  const followupItems = DEBT_ITEMS.filter((d) => d.status === 'followup');

  return (
    <div className="space-y-2 pb-12">
      <h1 className="font-display font-bold text-xl text-ink">Design Debt Audit</h1>
      <p className="text-xs text-ink-mute">
        6 debt categories identified in the exploration phase (sdd/dev-design-catalog/explore).
        Items 3–5 are resolved by Slice 4. Items 1, 2, 6 remain open as follow-up work.
      </p>

      {/* Summary counts */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${STATUS_CONFIG.open.className}`}>
          {openItems.length} open
        </span>
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${STATUS_CONFIG.slice4.className}`}>
          {slice4Items.length} resolved (Slice 4)
        </span>
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${STATUS_CONFIG.followup.className}`}>
          {followupItems.length} follow-up SDD
        </span>
      </div>

      {/* All items */}
      <div className="space-y-4 mt-4">
        {DEBT_ITEMS.map((item) => {
          const config = STATUS_CONFIG[item.status];
          const isResolved = item.status === 'slice4';

          return (
            <div
              key={item.id}
              className={`rounded-md border p-4 space-y-2 ${
                isResolved ? 'border-primary-deep/20 bg-primary-soft/30' : 'border-line bg-surface'
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-2">
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${config.className}`}
                >
                  {config.icon} {config.label}
                </span>
                <h2
                  className={`font-display font-semibold text-sm leading-tight ${
                    isResolved ? 'line-through text-ink-mute' : 'text-ink'
                  }`}
                >
                  {item.title}
                </h2>
              </div>

              {/* Description */}
              <p className="text-xs text-ink-soft leading-relaxed">{item.description}</p>

              {/* Affected files */}
              <details className="text-[10px]">
                <summary className="cursor-pointer text-ink-mute hover:text-ink-soft font-mono">
                  Affected files ({item.affectedFiles.length})
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-2">
                  {item.affectedFiles.map((f) => (
                    <li key={f} className="font-mono text-ink-mute break-all">{f}</li>
                  ))}
                </ul>
              </details>

              {/* Resolution note */}
              {item.resolution && (
                <div
                  className={`text-[10px] px-2 py-1.5 rounded ${
                    isResolved
                      ? 'bg-primary-soft text-primary-deep'
                      : 'bg-surface-soft text-ink-mute'
                  }`}
                >
                  <span className="font-bold">Resolution: </span>
                  {item.resolution}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
