import Link from 'next/link';
import type { ReactNode } from 'react';

const tabs = [
  { href: '/dev/catalog/tokens',      label: 'Tokens' },
  { href: '/dev/catalog/components',  label: 'Components' },
  { href: '/dev/catalog/diagnostics', label: 'Diagnostics' },
];

/**
 * Catalog layout — sticky top nav with sub-route Links.
 * No client state: active styling is handled via CSS :has or pathname comparison.
 * This is a server component; tab links are plain <Link> elements.
 */
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Sticky catalog header */}
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-line">
        <div className="mx-auto max-w-sm px-4 pt-3 pb-0">
          <div className="flex items-center gap-2 mb-3">
            <Link
              href="/dev"
              className="text-xs text-ink-mute hover:text-ink-soft transition-colors"
            >
              ← Dev
            </Link>
            <span className="text-ink-mute text-xs">/</span>
            <span className="text-xs text-ink font-semibold">Catalog</span>
          </div>
          <nav aria-label="Catalog sections" className="flex gap-1">
            {tabs.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 text-xs font-semibold font-sans rounded-t-md border border-b-0 border-transparent text-ink-mute hover:text-ink hover:bg-surface transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-sm px-4 py-6">
        {children}
      </div>
    </div>
  );
}
