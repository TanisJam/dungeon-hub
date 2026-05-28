import type { PendingFichaSummary } from '../dm-mock-data';

interface PendingFichasCardProps {
  fichas: PendingFichaSummary[];
  oldestAge: string;
  onClick: () => void;
}

/**
 * PendingFichasCard — DM hero card showing pending character approvals.
 *
 * Wired via PendingFichasCardTrigger client island that opens the V3Sheet.
 * REQ-IDM-PENDING-CARD-02 | REQ-PS-CARD-BUTTON-API-01
 */
export function PendingFichasCard({ fichas, oldestAge, onClick }: PendingFichasCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inicio-pending-bg block w-full text-left rounded-2xl p-4"
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
    </button>
  );
}
