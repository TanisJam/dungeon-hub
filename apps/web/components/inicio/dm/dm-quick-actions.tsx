import Link from 'next/link';
import { SectionHead } from '@/components/ui/section-head';
import { Icon } from '@/components/ui/icon';

/**
 * DMQuickActions — DM home screen quick action grid.
 *
 * Biblioteca W1 (REQ-NAV-02, REQ-DMTOOLS-01):
 *   - Iniciativa: Link → /encuentros (functional)
 *   - Herramientas del DM: Link → /herramientas/facciones (DM authoring tools home)
 *   - Mesa / Campañas: Link → /campanas (Mesa tab removed from TabBar; reachable here)
 *   - Nuevo NPC: stub button, aria-disabled (TODO future SDD)
 *   - Loot: stub button, aria-disabled (TODO future SDD)
 *
 * REQ-IDM-QUICK-ACTIONS-05
 */
export function DMQuickActions() {
  return (
    <section>
      <SectionHead title="Atajos DM" />
      <div className="grid grid-cols-3 gap-3 mt-3">
        {/* Iniciativa — functional link */}
        <Link
          href="/encuentros"
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-surface-raised text-center"
        >
          <span className="inicio-quick-iniciativa-ic flex items-center justify-center w-9 h-9 rounded-full text-accent">
            <Icon name="sword" size={18} />
          </span>
          <span className="text-xs font-semibold text-ink">Iniciativa</span>
        </Link>

        {/* Herramientas del DM — functional link (Biblioteca W1, REQ-DMTOOLS-01) */}
        <Link
          href="/herramientas/facciones"
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-surface-raised text-center"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-raised text-accent">
            <Icon name="hammer" size={18} />
          </span>
          <span className="text-xs font-semibold text-ink">Herramientas</span>
        </Link>

        {/* Mesa / Campañas — functional link (Biblioteca W1 — Mesa tab absorbed, REQ-NAV-02) */}
        <Link
          href="/campanas"
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-surface-raised text-center"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-raised text-accent">
            <Icon name="compass" size={18} />
          </span>
          <span className="text-xs font-semibold text-ink">Mesa</span>
        </Link>

        {/* Nuevo NPC — stub */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-surface-raised text-center cursor-not-allowed opacity-50"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-raised text-accent">
            <Icon name="user" size={18} />
          </span>
          <span className="text-xs font-semibold text-ink">Nuevo NPC</span>
        </button>

        {/* Loot — stub */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 bg-surface-raised text-center cursor-not-allowed opacity-50"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-surface-raised text-accent">
            <Icon name="bag" size={18} />
          </span>
          <span className="text-xs font-semibold text-ink">Loot</span>
        </button>
      </div>
    </section>
  );
}
