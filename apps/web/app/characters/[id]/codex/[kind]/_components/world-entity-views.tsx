/**
 * Stub RowView and Header for world-knowledge kinds not yet wired in Slice 1.
 *
 * ADR-2 Option A (#1946): npcs/factions/locations/lore return gated-EMPTY from the API
 * in Slice 1 — these stubs will rarely render since rows=[] is the expected payload.
 * They are defined here so TypeScript is satisfied and CodexList can compile cleanly.
 *
 * TODO: replace stubs when per-kind UUID-resolver is wired (codex-knowledge #1946).
 */

export function WorldEntityRowView({ row }: { row: unknown }) {
  const r = row as Record<string, unknown>;
  return (
    <div className="py-3 text-sm text-ink">
      {String(r.name ?? r.id ?? '—')}
    </div>
  );
}

export function WorldEntityHeader() {
  return (
    <div className="py-4 text-sm text-ink-soft">
      Detalle no disponible en esta versión.
    </div>
  );
}
