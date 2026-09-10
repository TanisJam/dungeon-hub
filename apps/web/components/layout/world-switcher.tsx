'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashedCTA } from '@/components/ui/dashed-cta';
import { V3Sheet } from '@/components/ui/sheet';
import type { WorldRow } from '@/lib/api';
import type { CallerRole } from '@/lib/active-world';
import { setActiveWorld } from '@/app/set-active-world';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorldSwitcherProps {
  worlds: WorldRow[];
  activeWorldId: string | null;
  callerRole: CallerRole;
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: CallerRole }) {
  if (!role) return null;

  const label = role === 'gm' ? 'GM' : 'Player';
  const className =
    role === 'gm'
      ? 'rounded-sm bg-secondary/20 px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-secondary'
      : 'rounded-sm bg-accent/20 px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-accent';

  return <span className={className}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Trigger button (exported for TopBar wiring)
// ---------------------------------------------------------------------------

interface WorldSwitcherTriggerProps {
  worldName: string;
  callerRole: CallerRole;
  onClick: () => void;
}

export function WorldSwitcherTrigger({ worldName, callerRole, onClick }: WorldSwitcherTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-left transition-colors duration-150 hover:border-accent hover:bg-surface/80"
      aria-label={`Mundo activo: ${worldName}. Abrir selector de mundo.`}
    >
      <span className="font-display font-bold text-[13px] leading-tight text-ink truncate max-w-[88px] sm:max-w-[120px]">
        {worldName}
      </span>
      {callerRole && <RoleBadge role={callerRole} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// WorldSwitcher sheet
// ---------------------------------------------------------------------------

/**
 * WorldSwitcher — bottom-sheet component for switching the active world.
 *
 * REQ-WIS-04: Lists worlds with role badges. Active world visually indicated.
 * Tapping a non-active world calls setActiveWorld + router.refresh().
 * Tap-outside and Escape close the sheet (V3Sheet handles this).
 * Zero-worlds: shows empty state + CTA.
 * Mobile @375: rows ≥44px (min-h-[44px]); scrolls when many worlds (V3Sheet max-h-[92vh]).
 */
export function WorldSwitcher({ worlds, activeWorldId, callerRole }: WorldSwitcherProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const activeWorld = worlds.find((w) => w.id === activeWorldId);
  const worldName = activeWorld?.name ?? 'Mundo';

  async function handleSelect(worldId: string) {
    // REQ-WIS-02 Scenario: Active world is already selected — no-op.
    if (worldId === activeWorldId) {
      setOpen(false);
      return;
    }
    await setActiveWorld(worldId);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <WorldSwitcherTrigger
        worldName={worldName}
        callerRole={callerRole}
        onClick={() => setOpen(true)}
      />

      <V3Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Tus mundos"
        labelledBy="world-switcher-heading"
      >
        {worlds.length === 0 ? (
          // REQ-WIS-04 Scenario: Zero worlds — empty state
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="font-sans text-sm text-ink-mute">
              Todavía no tenés ningún mundo. ¡Creá el primero!
            </p>
            <DashedCTA href="/campanas/new" onClick={() => setOpen(false)} className="px-4 py-3">
              {/* TODO world-ia Part 3: migrate to POST /worlds */}
              <span className="text-lg text-accent">+</span>
              <span>Crear mundo</span>
            </DashedCTA>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {worlds.map((world) => {
              const isActive = world.id === activeWorldId;
              return (
                <button
                  key={world.id}
                  type="button"
                  onClick={() => handleSelect(world.id)}
                  data-active={isActive}
                  className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ${
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/30'
                      : 'text-ink hover:bg-surface border border-transparent'
                  }`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="flex-1 font-sans text-[13px] font-semibold leading-tight truncate">
                    {world.name}
                  </span>
                  {/* Role badge only shown for active world (callerRole from server) */}
                  {isActive && callerRole && <RoleBadge role={callerRole} />}
                </button>
              );
            })}

            {/* Create world CTA at bottom of the list */}
            <DashedCTA href="/campanas/new" onClick={() => setOpen(false)} className="mt-2 min-h-[44px] px-4 py-3">
              {/* TODO world-ia Part 3: migrate to POST /worlds */}
              <span className="text-lg text-accent">+</span>
              <span>Crear mundo</span>
            </DashedCTA>
          </div>
        )}
      </V3Sheet>
    </>
  );
}
