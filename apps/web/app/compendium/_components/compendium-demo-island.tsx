'use client';

// REQ-CBROWSE-10: CompendiumSearchTrigger no-op replaced with an honest Link
// to the spells browse (default category). ADR-7.
// If no campaignId, renders a non-navigating trigger (still not a no-op — shows intent).

import Link from 'next/link';

interface CompendiumDemoIslandProps {
  /** Active campaign UUID for the search trigger href. REQ-CBROWSE-10. */
  campaignId: string | null;
}

/**
 * CompendiumDemoIsland — converts the old no-op search trigger to a real nav link.
 * REQ-CBROWSE-10: trigger MUST NOT remain a no-op after this change lands.
 * ADR-7: honest minimal V1 = navigate to /compendium/spells?campaign=...
 */
export function CompendiumDemoIsland({ campaignId }: CompendiumDemoIslandProps) {
  const href = campaignId ? `/compendium/spells?campaign=${campaignId}` : '/compendium/spells';

  return (
    <Link
      href={href}
      className="compendium-init-search"
      aria-label="Buscar en el compendium"
    >
      <span className="ph">Hechizo, item, monstruo…</span>
      <span className="kbd hidden md:inline-flex">⌘K</span>
    </Link>
  );
}
