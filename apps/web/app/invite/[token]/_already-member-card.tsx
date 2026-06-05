/**
 * AlreadyMemberCard — server-safe presentational component.
 *
 * Branches on worldRole to render the correct CTA for the alreadyMember state:
 * - worldRole === 'gm'  → GM-aware panel: "Sos el DM de esta campaña" + two links.
 * - worldRole !== 'gm'  → Existing player dead-end: "Ya sos parte de esta campaña".
 *
 * No 'use client' — only renders links (REQ-DPPM-A-INV-06 mobile-first, server-safe).
 *
 * SDD: dm-player-play-model Slice A, REQ-DPPM-A-INV-01..04, REQ-DPPM-A-INV-06.
 */
import Link from 'next/link';

type Props = {
  worldRole: 'gm' | 'player' | null;
  campaignId: string;
  campaignName: string;
  worldName: string;
};

const buttonClass =
  'inline-flex items-center justify-center w-full min-h-[44px] rounded-[12px] border bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(111,134,201,0.35),0_1px_2px_rgba(39,30,51,0.08)] transition-all hover:brightness-105 border-transparent';

export function AlreadyMemberCard({ worldRole, campaignId, campaignName, worldName }: Props) {
  if (worldRole === 'gm') {
    return (
      <div>
        <p className="font-semibold text-ink">Sos el DM de esta campaña</p>
        <p className="mt-1 text-sm text-ink-soft">
          Ya administrás <strong>{campaignName}</strong> ({worldName}). Podés correr sesiones o
          traer un personaje propio a la mesa.
        </p>
        <div className="mt-6">
          <Link href={`/campanas/${campaignId}`} className={buttonClass}>
            Ir a las sesiones
          </Link>
        </div>
        <div className="mt-3 text-center">
          <Link
            href="/characters/new"
            className="text-sm text-ink-soft hover:text-ink transition-colors"
          >
            Crear un personaje
          </Link>
        </div>
      </div>
    );
  }

  // Non-GM path: existing player dead-end (unchanged behavior)
  return (
    <div>
      <p className="text-ink-soft">Ya sos parte de esta campaña</p>
      <div className="mt-6">
        <Link href={`/campanas/${campaignId}`} className={buttonClass}>
          Ir a la campaña
        </Link>
      </div>
    </div>
  );
}
