// REQ-WCO-WEB-02 — TurnBanner: sticky "Tu turno" / "Turno de {name}" indicator.
// Presentational Server Component — no 'use client' needed.

type Props = {
  currentCombatantId: string;
  ownCombatantId: string | null;
  currentCombatantName: string;
};

export function TurnBanner({ currentCombatantId, ownCombatantId, currentCombatantName }: Props) {
  const isOwnTurn = ownCombatantId !== null && currentCombatantId === ownCombatantId;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-paper border-b border-line text-sm font-semibold">
      {isOwnTurn ? (
        <>
          <span className="animate-pulse inline-block w-2.5 h-2.5 rounded-full bg-primary" />
          <span>Tu turno</span>
        </>
      ) : (
        <span>Turno de {currentCombatantName}</span>
      )}
    </div>
  );
}
