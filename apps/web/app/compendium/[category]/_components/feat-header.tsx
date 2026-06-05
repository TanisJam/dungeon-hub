// FeatHeader — per-type detail header for feats (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns + data JSONB.
// The feat's benefit text lives in data.entries (rendered by the generic body);
// the only distinctive meta a feat carries is its prerequisite.
//
// PHB 2014 p.165 — feats are an optional rule; a feat may have a prerequisite
// you must meet to take it.

import { formatPrerequisites } from './row-views';

interface FeatDetailRow {
  slug: string;
  source: string;
  name: string;
  prerequisites?: unknown;
  data: {
    prerequisite?: unknown;
    [key: string]: unknown;
  };
}

interface FeatHeaderProps {
  data: FeatDetailRow;
}

interface MetaRowProps {
  label: string;
  value: string;
  field: string;
}

function MetaRow({ label, value, field }: MetaRowProps) {
  return (
    <div className="meta-row">
      <div className="k">{label}</div>
      <div className="v" data-field={field}>{value}</div>
    </div>
  );
}

/**
 * FeatHeader — per-type detail header for feats (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.165 — feat prerequisite is the gating meta field.
 */
export function FeatHeader({ data }: FeatHeaderProps) {
  // The detail row carries `prerequisites` as a projected column; the raw 5etools
  // shape also lives under data.prerequisite. Prefer the column, fall back to data.
  const prereq = formatPrerequisites(data.prerequisites ?? data.data?.prerequisite) ?? 'Ninguno';

  return (
    <div className="compendium-init-detail feat">
      <div className="name">{data.name}</div>

      <div className="grid">
        <MetaRow label="Requisito" value={prereq} field="prerequisite" />
      </div>
    </div>
  );
}
