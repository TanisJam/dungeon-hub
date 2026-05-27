// TODO sdd/pendientes-sheet — wire real approval flow
import type { PendingFichaSummary } from '../dm-mock-data';

interface PendingFichasCardProps {
  fichas: PendingFichaSummary[];
  oldestAge: string;
}

/**
 * PendingFichasCard — DM hero card showing pending character approvals.
 *
 * v1 stub: entire card is a non-navigating anchor (aria-disabled).
 * REQ-IDM-PENDING-CARD-02 | REQ-IDM-PENDING-CARD-STUB-03
 */
export function PendingFichasCard({ fichas, oldestAge }: PendingFichasCardProps) {
  return (
    <a
      href="#"
      aria-disabled="true"
      onClick={(e) => e.preventDefault()}
      className="inicio-pending-bg block rounded-2xl p-4 cursor-not-allowed"
    >
      {/* Eyebrow */}
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-mute mb-2">
        Necesitan tu mirada
      </p>

      {/* Avatar stack */}
      <div className="flex mb-3" style={{ gap: '-4px' }}>
        {fichas.map((ficha) => (
          <span
            key={ficha.id}
            className="inicio-pending-stack-av inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white -ml-1 first:ml-0"
          >
            {ficha.portraitInitial}
          </span>
        ))}
      </div>

      {/* Title */}
      <p className="text-[17px] font-display font-semibold text-ink leading-tight">
        {fichas.length} fichas pendientes
      </p>

      {/* Sub */}
      <p className="text-xs text-ink-mute mt-0.5">
        Más antigua: {oldestAge}
      </p>

      {/* CTA */}
      <span className="inicio-pending-cta mt-3 inline-block px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full">
        Revisar
      </span>
    </a>
  );
}
