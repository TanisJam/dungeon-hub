import Link from 'next/link';

const sections = [
  {
    group: 'Design System Catalog',
    links: [
      { href: '/dev/catalog/tokens',      label: 'Tokens',      desc: 'Color swatches, typography scale, radii, shadows, motion' },
      { href: '/dev/catalog/components',  label: 'Components',  desc: 'All ui/ + layout/ components in a 375px Frame' },
      { href: '/dev/catalog/diagnostics', label: 'Diagnostics', desc: 'Design debt audit: forbidden colors, hardcoded hex, Pill drift, etc.' },
    ],
  },
  {
    group: 'Existing Previews',
    links: [
      { href: '/dev/token',              label: 'Access Token',       desc: 'Copy the current user JWT for API scripts' },
      { href: '/dev/compendium-preview', label: 'Compendium Preview', desc: 'Visual QA for <CompendiumEntries> rendering' },
      { href: '/dev/engine-preview',     label: 'Engine Preview',     desc: 'Character engine breakdown tree' },
    ],
  },
];

export default function DevIndexPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-8 space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Dev Tools</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Development-only utilities. Not accessible in production.
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.group} className="space-y-3">
          <h2 className="font-display text-base font-semibold text-ink-soft uppercase tracking-widest text-[11px]">
            {section.group}
          </h2>
          <ul className="space-y-2">
            {section.links.map(({ href, label, desc }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block px-4 py-3 rounded-md bg-surface border border-line hover:bg-surface-soft transition-colors"
                >
                  <span className="font-display font-semibold text-sm text-ink block">{label}</span>
                  <span className="text-xs text-ink-mute mt-0.5 block">{desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
