// PHB 2014 p.201 — spell meta fields: casting time, range, components, duration.
// Mobile-first key/value grid @375px — reuses .compendium-init-detail.spell CSS pattern.

import type { SpellApiRow } from './types.js';

// ---------------------------------------------------------------------------
// School label lookup — PHB 2014 p.203 magic school abbreviations
// ---------------------------------------------------------------------------
const SCHOOL_LABELS: Record<string, string> = {
  A: 'Abjuración',
  C: 'Conjuración',
  D: 'Adivinación',
  E: 'Evocación',
  I: 'Ilusión',
  N: 'Nigromancia',
  T: 'Transmutación',
  EN: 'Encantamiento',
};

function schoolLabel(code: string): string {
  return SCHOOL_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Casting time — normalizes SpellTimeEntry into a readable string
// PHB 2014 p.202 — casting time units: action, bonus action, reaction, minute, hour
// ---------------------------------------------------------------------------
function castingTimeLabel(time: SpellApiRow['data']['time']): string {
  const first = time?.[0];
  if (!first) return '—';
  const { number, unit } = first;
  const unitMap: Record<string, string> = {
    action: 'acción',
    'bonus action': 'acción adicional',
    bonusAction: 'acción adicional',
    reaction: 'reacción',
    minute: 'minuto',
    minutes: 'minutos',
    hour: 'hora',
    hours: 'horas',
    day: 'día',
  };
  const unitStr = unitMap[unit] ?? unit;
  return `${number} ${unitStr}${number > 1 && !unitStr.endsWith('s') ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// Range — PHB 2014 p.202: "Touch", "Self", distances
// ---------------------------------------------------------------------------
function rangeLabel(range: SpellApiRow['data']['range']): string {
  if (!range) return '—';
  const { type, distance } = range;
  if (type === 'touch') return 'Toque';
  if (type === 'self') return 'Personal';
  if (type === 'unlimited') return 'Ilimitado';
  if (type === 'sight') return 'Vista';
  if (type === 'special') return 'Especial';
  if (type === 'point' && distance) {
    const distMap: Record<string, string> = {
      feet: 'pies',
      miles: 'millas',
      self: 'personal',
      touch: 'toque',
      unlimited: 'ilimitado',
    };
    const unit = distMap[distance.type] ?? distance.type;
    return distance.amount !== undefined ? `${distance.amount} ${unit}` : unit;
  }
  return type;
}

// ---------------------------------------------------------------------------
// Components — PHB 2014 p.203: V (verbal), S (somatic), M (material)
// ---------------------------------------------------------------------------
function componentsLabel(comps: SpellApiRow['data']['components']): string {
  if (!comps) return '—';
  const parts: string[] = [];
  if (comps.v) parts.push('V');
  if (comps.s) parts.push('S');
  if (comps.m) {
    const mText = typeof comps.m === 'string' ? comps.m : comps.m.text;
    parts.push(`M (${mText})`);
  }
  return parts.join(', ') || '—';
}

// ---------------------------------------------------------------------------
// Duration — PHB 2014 p.203: instantaneous, concentration, time spans
// ---------------------------------------------------------------------------
function durationLabel(dur: SpellApiRow['data']['duration']): string {
  const first = dur?.[0];
  if (!first) return '—';
  const { type, duration, concentration } = first;
  let label = '';
  if (type === 'instant') {
    label = 'Instantánea';
  } else if (type === 'permanent') {
    label = 'Permanente';
  } else if (type === 'special') {
    label = 'Especial';
  } else if (type === 'timed' && duration) {
    const unitMap: Record<string, string> = {
      round: 'asalto',
      rounds: 'asaltos',
      minute: 'minuto',
      minutes: 'minutos',
      hour: 'hora',
      hours: 'horas',
      day: 'día',
      days: 'días',
    };
    const u = unitMap[duration.type] ?? duration.type;
    const amount = duration.amount ?? 1;
    label = `${amount} ${u}${amount > 1 && !u.endsWith('s') ? 's' : ''}`;
  } else {
    label = type;
  }
  return concentration ? `Concentración, hasta ${label.toLowerCase()}` : label;
}

// ---------------------------------------------------------------------------
// Component
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

interface SpellHeaderProps {
  data: SpellApiRow;
}

/**
 * SpellHeader — per-type detail header for spells (ADR-5, REQ-CBROWSE-07).
 * Reads the REAL API shape: extracted columns (level, school) + data JSONB fields
 * (time[], range, components, duration[]). Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.201–203 — all 6 meta fields are required.
 */
export function SpellHeader({ data }: SpellHeaderProps) {
  const levelLabel = data.level === 0 ? 'Truco' : `Nivel ${data.level}`;

  return (
    <div className="compendium-init-detail spell">
      <div className="lvl-stamp" data-field="level">{data.level === 0 ? '∗' : data.level}</div>
      <div className="name">{data.name}</div>
      <div className="school" data-field="school">{schoolLabel(data.school)}</div>
      <div className="eyebrow">{levelLabel} · {schoolLabel(data.school)}</div>

      <div className="grid">
        <MetaRow label="Tiempo" value={castingTimeLabel(data.data.time)} field="casting-time" />
        <MetaRow label="Rango" value={rangeLabel(data.data.range)} field="range" />
        <MetaRow label="Componentes" value={componentsLabel(data.data.components)} field="components" />
        <MetaRow label="Duración" value={durationLabel(data.data.duration)} field="duration" />
      </div>
    </div>
  );
}
