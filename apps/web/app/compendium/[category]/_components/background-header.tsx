// BackgroundHeader — per-type detail header for backgrounds (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns + data JSONB.
// JSONB shape (5etools backgrounds.json): skillProficiencies[], toolProficiencies[],
//   languageProficiencies[], entries[] (feature entry has data.isFeature = true).
//
// PHB 2014 p.125-141 — background meta fields: skill profs, tool profs, languages, feature.

// ---------------------------------------------------------------------------
// Skill proficiency formatter
// PHB p.174 — 18 skills, each tied to an ability score.
// skillProficiencies: [{insight: true, religion: true}] — keys are skill names.
// ---------------------------------------------------------------------------
function skillProfsLabel(skillProficiencies: Array<Record<string, unknown>> | undefined): string {
  if (!skillProficiencies || skillProficiencies.length === 0) return '—';
  const skills: string[] = [];
  for (const entry of skillProficiencies) {
    for (const [key, val] of Object.entries(entry)) {
      if (key === 'choose') {
        const c = val as { from?: string[]; count?: number };
        const count = c.count ?? 1;
        const from = c.from ? ` (from ${c.from.join(', ')})` : '';
        skills.push(`${count} of your choice${from}`);
      } else if (val === true) {
        // Capitalize each word
        skills.push(key.replace(/\b\w/g, (l) => l.toUpperCase()));
      }
    }
  }
  return skills.length > 0 ? skills.join(', ') : '—';
}

// ---------------------------------------------------------------------------
// Tool proficiency formatter
// toolProficiencies: [{"disguise kit": true}] or [{"musical instrument": {"choose":...}}]
// ---------------------------------------------------------------------------
function toolProfsLabel(toolProficiencies: Array<Record<string, unknown>> | undefined): string {
  if (!toolProficiencies || toolProficiencies.length === 0) return 'None';
  const tools: string[] = [];
  for (const entry of toolProficiencies) {
    for (const [key, val] of Object.entries(entry)) {
      if (val === true) {
        tools.push(key.replace(/\b\w/g, (l) => l.toUpperCase()));
      } else if (typeof val === 'object' && val !== null) {
        tools.push(key.replace(/\b\w/g, (l) => l.toUpperCase()) + ' (choose)');
      }
    }
  }
  return tools.length > 0 ? tools.join(', ') : 'None';
}

// ---------------------------------------------------------------------------
// Language proficiency formatter
// languageProficiencies: [{anyStandard: 2}] or [{elvish: true}]
// ---------------------------------------------------------------------------
function languageProfsLabel(
  languageProficiencies: Array<Record<string, unknown>> | undefined,
): string {
  if (!languageProficiencies || languageProficiencies.length === 0) return 'None';
  const langs: string[] = [];
  for (const entry of languageProficiencies) {
    for (const [key, val] of Object.entries(entry)) {
      if (key === 'anyStandard' && typeof val === 'number') {
        langs.push(`${val} language${val !== 1 ? 's' : ''} of your choice`);
      } else if (key === 'any' && typeof val === 'number') {
        langs.push(`${val} language${val !== 1 ? 's' : ''} of your choice`);
      } else if (val === true) {
        langs.push(key.replace(/\b\w/g, (l) => l.toUpperCase()));
      }
    }
  }
  return langs.length > 0 ? langs.join(', ') : 'None';
}

// ---------------------------------------------------------------------------
// Feature name extractor
// entries[] — the feature entry has data: {isFeature: true} and a name property.
// PHB p.127 — "Each background gives a character a background feature..."
// ---------------------------------------------------------------------------
function featureName(entries: unknown[] | undefined): string {
  if (!entries) return '—';
  for (const entry of entries) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'data' in entry &&
      typeof (entry as Record<string, unknown>).data === 'object' &&
      ((entry as Record<string, unknown>).data as Record<string, unknown>)?.isFeature === true
    ) {
      const name = (entry as Record<string, unknown>).name;
      if (typeof name === 'string') {
        // Strip "Feature: " prefix if present (PHB formatting)
        return name.replace(/^Feature:\s*/i, '');
      }
    }
  }
  return '—';
}

// ---------------------------------------------------------------------------
// MetaRow helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API row shape
// ---------------------------------------------------------------------------

interface BackgroundDetailRow {
  slug: string;
  source: string;
  name: string;
  data: {
    skillProficiencies?: Array<Record<string, unknown>>;
    toolProficiencies?: Array<Record<string, unknown>>;
    languageProficiencies?: Array<Record<string, unknown>>;
    entries?: unknown[];
    [key: string]: unknown;
  };
}

interface BackgroundHeaderProps {
  data: BackgroundDetailRow;
}

/**
 * BackgroundHeader — per-type detail header for backgrounds (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.125 — background meta: skill profs, tool profs, languages, feature name.
 */
export function BackgroundHeader({ data }: BackgroundHeaderProps) {
  const feature = featureName(data.data.entries);

  return (
    <div className="compendium-init-detail background">
      <div className="name">{data.name}</div>

      <div className="grid">
        <MetaRow
          label="Habilidades"
          value={skillProfsLabel(data.data.skillProficiencies)}
          field="skill-profs"
        />
        <MetaRow
          label="Herramientas"
          value={toolProfsLabel(data.data.toolProficiencies)}
          field="tool-profs"
        />
        <MetaRow
          label="Idiomas"
          value={languageProfsLabel(data.data.languageProficiencies)}
          field="languages"
        />
        <MetaRow label="Rasgo" value={feature} field="feature" />
      </div>
    </div>
  );
}
