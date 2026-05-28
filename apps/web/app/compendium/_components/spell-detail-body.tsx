import { Icon } from '@/components/ui';
import type { SpellDetail } from './types';

interface SpellDetailBodyProps {
  spell: SpellDetail;
}

/**
 * SpellDetailBody — pure presentational spell detail.
 * WCDS-FIREBALL-01: renders all PHB-validated Fireball fields.
 * WCDS-CTA-04: Preparar + Favorito ghost button stubs.
 */
export function SpellDetailBody({ spell }: SpellDetailBodyProps) {
  return (
    <div className="compendium-init-detail spell">
      <div className="lvl-stamp">{spell.level}</div>
      <div className="eyebrow">{spell.eyebrow}</div>
      <div className="name">{spell.name}</div>
      <div className="school">{spell.school}</div>

      <div className="grid">
        {spell.meta.map((m) => (
          <div key={m.k} className="meta-row">
            <div className="k">{m.k}</div>
            <div className="v">{m.v}</div>
          </div>
        ))}
      </div>

      <div className="desc">
        {spell.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'none',
            border: '1px solid var(--color-line)',
            borderRadius: '0.375rem',
            color: 'var(--color-ink-soft)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={14} />
          Preparar
        </button>
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'none',
            border: '1px solid var(--color-line)',
            borderRadius: '0.375rem',
            color: 'var(--color-ink-soft)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <Icon name="star" size={14} />
          Favorito
        </button>
      </div>
    </div>
  );
}
