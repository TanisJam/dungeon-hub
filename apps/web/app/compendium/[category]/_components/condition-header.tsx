// ConditionHeader — per-type detail header for conditions/statuses (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns + data JSONB.
// The condition's rules text lives in data.entries (rendered by the generic body);
// the only distinctive meta is whether it is a condition or a status.
//
// PHB 2014 p.290 (Appendix A: Conditions) — conditions alter a creature's
// capabilities. "Status" covers engine-level states (Concentration, Surprised).

interface ConditionDetailRow {
  slug: string;
  source: string;
  name: string;
  kind?: 'condition' | 'status';
  data: {
    [key: string]: unknown;
  };
}

interface ConditionHeaderProps {
  data: ConditionDetailRow;
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
 * ConditionHeader — per-type detail header for conditions (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.290 — conditions vs engine statuses.
 */
export function ConditionHeader({ data }: ConditionHeaderProps) {
  const kindLabel = data.kind === 'status' ? 'Estado' : 'Condición';

  return (
    <div className="compendium-init-detail condition">
      <div className="name">{data.name}</div>

      <div className="grid">
        <MetaRow label="Tipo" value={kindLabel} field="kind" />
      </div>
    </div>
  );
}
