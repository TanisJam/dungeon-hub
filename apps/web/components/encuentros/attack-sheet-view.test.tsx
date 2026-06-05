/**
 * Tests for AttackSheetView — pure presentational layer.
 * REQ-WCA-WEB-UI-01, REQ-WCA-WEB-UI-02
 *
 * All assertions are prop-driven: no SA mocks, no useRouter needed.
 * PHB p.194-195 — attack roll + damage in a single round-trip.
 * Mobile-first 375px: all tap targets ≥44px (CLAUDE.md §2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackSheetView } from './attack-sheet-view';
import type { AttackSheetViewProps, AttackResult } from './attack-sheet-view';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from './types';

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

const BASE_PROPS: AttackSheetViewProps = {
  open: false,
  step: 'weapon',
  selectedWeapon: null,
  attackResult: null,
  attackError: null,
  isPending: false,
  triggerDisabled: false,
  equippedWeapons: [WEAPON_A],
  npcTargets: [NPC_A],
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onPickWeapon: vi.fn(),
  onPickTarget: vi.fn(),
  onBackToWeapon: vi.fn(),
};

describe('AttackSheetView — presentational', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Trigger button ─────────────────────────────────────────────────────────

  it('(a) renders "Atacar" trigger when triggerDisabled===false', () => {
    render(<AttackSheetView {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('(b) "Atacar" trigger is disabled when triggerDisabled===true', () => {
    render(<AttackSheetView {...BASE_PROPS} triggerDisabled={true} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('trigger has min-h-[44px] touch target (CLAUDE.md §2 mobile-first 375px)', () => {
    render(<AttackSheetView {...BASE_PROPS} />);
    const btn = screen.getByRole('button', { name: /atacar/i });
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('clicking "Atacar" calls onOpen', () => {
    const onOpen = vi.fn();
    render(<AttackSheetView {...BASE_PROPS} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /atacar/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // ─── Step 1: weapon list (open + step=weapon) ────────────────────────────────

  it('(f) open + step=weapon shows weapon list', () => {
    render(<AttackSheetView {...BASE_PROPS} open={true} step="weapon" />);
    expect(screen.getByText('Shortsword')).toBeTruthy();
  });

  it('(g) weapon buttons have ≥44px touch target', () => {
    render(<AttackSheetView {...BASE_PROPS} open={true} step="weapon" />);
    const weaponBtns = screen.getAllByRole('button', { name: /shortsword/i });
    weaponBtns.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });
  });

  it('clicking a weapon calls onPickWeapon with the weapon', () => {
    const onPickWeapon = vi.fn();
    render(<AttackSheetView {...BASE_PROPS} open={true} step="weapon" onPickWeapon={onPickWeapon} />);
    fireEvent.click(screen.getByRole('button', { name: /shortsword/i }));
    expect(onPickWeapon).toHaveBeenCalledWith(WEAPON_A);
  });

  // ─── Step 2: target list ────────────────────────────────────────────────────

  it('(h) step=target shows NPC target with HP', () => {
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="target"
        selectedWeapon={WEAPON_A}
      />,
    );
    expect(screen.getByText(/goblin guard/i)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy();
  });

  it('(i) NPC target buttons have ≥44px touch target', () => {
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="target"
        selectedWeapon={WEAPON_A}
      />,
    );
    const targetBtn = screen.getByRole('button', { name: /goblin guard/i });
    expect(targetBtn.className).toContain('min-h-[44px]');
  });

  it('clicking an NPC target calls onPickTarget', () => {
    const onPickTarget = vi.fn();
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="target"
        selectedWeapon={WEAPON_A}
        onPickTarget={onPickTarget}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /goblin guard/i }));
    expect(onPickTarget).toHaveBeenCalledWith(NPC_A);
  });

  it('clicking Volver calls onBackToWeapon', () => {
    const onBackToWeapon = vi.fn();
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="target"
        selectedWeapon={WEAPON_A}
        onBackToWeapon={onBackToWeapon}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(onBackToWeapon).toHaveBeenCalledTimes(1);
  });

  // ─── Step 3: result display ──────────────────────────────────────────────────

  it('(k) step=result + hit result shows ¡Impacto! and damage', () => {
    const hitResult: AttackResult = {
      hit: true,
      d20: 15,
      total: 18,
      targetAc: 13,
      rolledDamage: 6,
      damageType: 'piercing',
      newHp: 1,
    };
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="result"
        attackResult={hitResult}
      />,
    );
    expect(screen.getByText(/impacto/i)).toBeTruthy();
    expect(screen.getByText(/Daño:/i)).toBeTruthy();
    expect(screen.getByText(/HP objetivo:/i)).toBeTruthy();
  });

  it('(l) step=result + miss result shows Fallo', () => {
    const missResult: AttackResult = {
      hit: false,
      d20: 4,
      total: 7,
      targetAc: 13,
    };
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="result"
        attackResult={missResult}
      />,
    );
    expect(screen.getByText(/fallo/i)).toBeTruthy();
    expect(screen.queryByText(/Daño:/i)).toBeNull();
  });

  // ─── Error banner ────────────────────────────────────────────────────────────

  it('attackError renders FormErrorAlert inside the sheet', () => {
    render(
      <AttackSheetView
        {...BASE_PROPS}
        open={true}
        step="weapon"
        attackError="No tienes permiso para realizar esta acción."
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('permiso');
  });
});
