import { V3Empty } from '@/components/ui/empty';

/**
 * CompendiumRecentsList — "Más consultado" section.
 * No view-history endpoint exists yet. Renders an honest empty state.
 * A real implementation requires a user view-history table + API endpoint.
 */
export function CompendiumRecentsList() {
  return (
    <V3Empty
      size="inline"
      glyph="book"
      title="Aún no consultaste ninguna entrada"
      sub="Consultá una entrada del compendio para que aparezca acá."
    />
  );
}
