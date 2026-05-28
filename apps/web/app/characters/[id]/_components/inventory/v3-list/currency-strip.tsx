/**
 * CurrencyStrip — 4-column currency display (pp / gp / sp / cp).
 *
 * Server Component (pure render — no client state).
 * Reqs: WIVLS-CURRENCY-01 (spec #1063)
 * PHB p.143 — Money: pp / gp / sp / cp shown; EP de-emphasized (design DA5).
 *
 * Per-metal tint colors are inline hex (DA5 — avoid token sprawl):
 *   pp: #C8DCE8 · gp: var(--color-accent) · sp: #B8B4A4 · cp: #C28C5F
 */
import type { Currency } from '@/lib/sheet-types';

interface CurrencyStripProps {
  currency: Currency;
}

const COINS: ReadonlyArray<{ key: keyof Currency; label: string; color: string }> = [
  { key: 'pp', label: 'pp', color: '#C8DCE8' },
  { key: 'gp', label: 'gp', color: 'var(--color-accent)' },
  { key: 'sp', label: 'sp', color: '#B8B4A4' },
  { key: 'cp', label: 'cp', color: '#C28C5F' },
] as const;

export function CurrencyStrip({ currency }: CurrencyStripProps) {
  return (
    <div className="inventory-init-currency" aria-label="Monedas">
      {COINS.map(({ key, label, color }) => (
        <div key={key} className="coin">
          <span className="v" style={{ color }}>{currency[key] ?? 0}</span>
          <span className="k">{label}</span>
        </div>
      ))}
    </div>
  );
}
