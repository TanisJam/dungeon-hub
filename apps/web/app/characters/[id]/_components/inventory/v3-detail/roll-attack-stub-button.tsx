'use client';

/**
 * RollAttackStubButton — client component.
 *
 * Stub CTA for the weapon attack roll. No-op onClick in Slice B.
 * Will be wired to the dice-roll modal in Slice C / combat-roll-v1 SDD.
 *
 * Reqs: WIWD-BODY-01 (spec #1070)
 * Design: DBE4 — tiny 'use client' child inside RSC WeaponDetailBody.
 *
 * PHB p.194 — Making an Attack; PHB p.147 — Finesse.
 */
interface RollAttackStubButtonProps {
  bonus: number;
}

export function RollAttackStubButton({ bonus }: RollAttackStubButtonProps) {
  const label = `Tirar ataque ${bonus >= 0 ? '+' : ''}${bonus}`;

  return (
    <button
      type="button"
      data-stub="true"
      aria-label="stub"
      className="inventory-init-detail-use-big"
      onClick={() => {
        // TODO(Slice C / combat-roll-v1): open dice-roll modal
      }}
    >
      {label}
    </button>
  );
}
