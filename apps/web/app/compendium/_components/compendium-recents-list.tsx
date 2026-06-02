/**
 * CompendiumRecentsList — "Más consultado" section.
 * No view-history endpoint exists yet. Renders an honest empty state.
 * A real implementation requires a user view-history table + API endpoint.
 */
export function CompendiumRecentsList() {
  return (
    <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', padding: '8px 0' }}>
      Aún no consultaste ninguna entrada.
    </p>
  );
}
