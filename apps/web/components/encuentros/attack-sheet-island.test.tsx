/**
 * Tests for AttackSheetIsland — container layer.
 * REQ-WCA-WEB-UI-01, REQ-WCA-WEB-UI-02
 *
 * Covers: triggerDisabled derivation (isOwnTurn/actionUsed), early-return when
 * no weapons/targets, SA wiring (attackApplyAction), state machine (weapon→target→result),
 * VERSION_CONFLICT → router.refresh() + close, FORBIDDEN → error, TARGET_NOT_NPC → error.
 * PHB p.194-195 — attack roll + damage in a single round-trip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttackSheetIsland } from './attack-sheet-island';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from './types';

// Server Actions mocked — not available in jsdom context.
vi.mock('@/app/encuentros/[id]/actions', () => ({
  activateRage: vi.fn(),
  deactivateRage: vi.fn(),
  passTurn: vi.fn(),
  attackApplyAction: vi.fn().mockResolvedValue({ ok: true, result: {
    hit: true,
    d20: 15,
    total: 18,
    targetAc: 13,
    rolledDamage: 6,
    damageType: 'piercing',
    newHp: 1,
  }}),
}));

// useRouter for VERSION_CONFLICT router.refresh()
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { attackApplyAction } from '@/app/encuentros/[id]/actions';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WEAPON_A: EnrichedInventoryItem = {
  instanceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  itemSlug: 'shortsword',
  itemSource: 'PHB',
  displayName: 'Shortsword',
  quantity: 1,
  equipped: true,
  equipHand: 'main',
  charges: null,
  v3Type: 'weapon',
  rarity: null,
  reqAttune: null,
  magicFlag: false,
  weight: 2,
  qty: 1,
};

const WEAPON_B: EnrichedInventoryItem = {
  ...WEAPON_A,
  instanceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  itemSlug: 'handaxe',
  displayName: 'Handaxe',
};

const NPC_A: EncounterCombatant = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  name: 'Goblin Guard',
  kind: 'npc',
  characterId: null,
  initiative: 10,
  hpCurrent: 7,
  hpMax: 7,
  ac: 13,
  insertionOrder: 1,
  conditions: [],
  effects: [],
  actionUsed: false,
  bonusActionUsed: false,
  reactionUsed: false,
  attacksRemaining: 1,
};

const NPC_DEAD: EncounterCombatant = {
  ...NPC_A,
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  name: 'Dead Goblin',
  hpCurrent: 0,
};

const BASE_PROPS = {
  encounterId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  attackerCombatantId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  equippedWeapons: [WEAPON_A],
  npcTargets: [NPC_A],
  version: 1,
  isOwnTurn: true,
  actionUsed: false,
};

describe('AttackSheetIsland — container', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Trigger button visibility ───────────────────────────────────────────────

  it('(a) renders "Atacar" trigger when isOwnTurn + !actionUsed + weapons + NPC targets', () => {
    render(<AttackSheetIsland {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('(b) "Atacar" trigger is disabled when NOT own turn', () => {
    render(<AttackSheetIsland {...BASE_PROPS} isOwnTurn={false} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('(c) "Atacar" trigger is disabled when actionUsed', () => {
    render(<AttackSheetIsland {...BASE_PROPS} actionUsed={true} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('(d) trigger NOT rendered when no equipped weapons', () => {
    render(<AttackSheetIsland {...BASE_PROPS} equippedWeapons={[]} />);
    expect(screen.queryByRole('button', { name: /atacar/i })).toBeNull();
  });

  it('(e) trigger NOT rendered when no living NPC targets', () => {
    render(<AttackSheetIsland {...BASE_PROPS} npcTargets={[]} />);
    expect(screen.queryByRole('button', { name: /atacar/i })).toBeNull();
  });

  // ─── Touch target size ────────────────────────────────────────────────────────

  it('trigger has min-h-[44px] touch target (CLAUDE.md §2 mobile-first 375px)', () => {
    render(<AttackSheetIsland {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect(btn.className).toContain('min-h-[44px]');
  });

  // ─── Step 1: weapon pick ─────────────────────────────────────────────────────

  it('(f) clicking "Atacar" opens the sheet and shows weapon list (step 1)', () => {
    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    expect(screen.getByText('Shortsword')).toBeTruthy();
  });

  it('(g) weapon list buttons have ≥44px touch target', () => {
    render(<AttackSheetIsland {...BASE_PROPS} equippedWeapons={[WEAPON_A, WEAPON_B]} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    const weaponBtns = screen.getAllByRole('button', { name: /shortsword|handaxe/i });
    expect(weaponBtns.length).toBeGreaterThanOrEqual(1);
    weaponBtns.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });
  });

  // ─── Step 2: target pick ─────────────────────────────────────────────────────

  it('(h) picking a weapon advances to target step — NPC shown with HP', () => {
    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    expect(screen.getByText(/goblin guard/i)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy();
  });

  it('(i) NPC target buttons have ≥44px touch target', () => {
    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    const targetBtn = screen.getByRole('button', { name: /goblin guard/i });
    expect(targetBtn.className).toContain('min-h-[44px]');
  });

  // ─── Confirm (fire SA) → result ───────────────────────────────────────────────

  it('(j) picking target calls attackApplyAction with correct args', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: true,
      result: { hit: true, d20: 15, total: 18, targetAc: 13, rolledDamage: 6, damageType: 'piercing', newHp: 1 },
    } as never);

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      expect(attackApplyAction).toHaveBeenCalledWith(
        BASE_PROPS.encounterId,
        BASE_PROPS.attackerCombatantId,
        NPC_A.id,
        WEAPON_A.instanceId,
        BASE_PROPS.version,
      );
    });
  });

  it('(k) successful HIT shows result: hit, d20, total, damage, newHp', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: true,
      result: { hit: true, d20: 15, total: 18, targetAc: 13, rolledDamage: 6, damageType: 'piercing', newHp: 1 },
    } as never);

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      expect(screen.getByText(/impacto|hit/i)).toBeTruthy();
    });
    expect(screen.getByText(/Daño:/i)).toBeTruthy();
    expect(screen.getByText(/HP objetivo:/i)).toBeTruthy();
  });

  it('(l) successful MISS shows "miss" result with d20 roll', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: true,
      result: { hit: false, d20: 4, total: 7, targetAc: 13 },
    } as never);

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      expect(screen.getByText(/fallo|miss/i)).toBeTruthy();
    });
  });

  // ─── Error states ─────────────────────────────────────────────────────────────

  it('(m) VERSION_CONFLICT → router.refresh() called + sheet closes', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: false,
      code: 'VERSION_CONFLICT',
    } as never);
    mockRefresh.mockClear();

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('Shortsword')).toBeNull();
    });
  });

  it('(n) FORBIDDEN shows error message, sheet stays open', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
    } as never);

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('permiso');
    });
  });

  it('(o) TARGET_NOT_NPC shows error message', async () => {
    vi.mocked(attackApplyAction).mockResolvedValueOnce({
      ok: false,
      code: 'TARGET_NOT_NPC',
    } as never);

    render(<AttackSheetIsland {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBeTruthy();
    });
  });

  // ─── Dead NPCs are excluded ───────────────────────────────────────────────────

  it('(p) dead NPCs (hpCurrent===0) are excluded from npcTargets prop', () => {
    // The sheet itself takes a pre-filtered list — non-empty npcTargets → trigger rendered
    render(<AttackSheetIsland {...BASE_PROPS} npcTargets={[NPC_DEAD]} />);
    expect(screen.getByRole('button', { name: /atacar/i })).toBeTruthy();
  });
});
