/**
 * Unit tests for load-inventory-detail use-case.
 *
 * Reqs: ACIDE-SHAPE-01, ACIDE-AUTH-02, ACIDE-NONN1-03 (spec #1070)
 * Design: DB1, DB2, DB3 (design #1071)
 *
 * All external I/O is mocked — pure unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadInventoryDetail } from '../../../../src/use-cases/characters/load-inventory-detail.js';

// ── Mock the I/O layer ────────────────────────────────────────────────────────

vi.mock('../../../../src/use-cases/characters/load-character.js', () => ({
  loadCharacter: vi.fn(),
  getCharacterAccess: vi.fn(),
}));

vi.mock('../../../../src/use-cases/characters/load-item-data.js', () => ({
  loadItemDataDetailMany: vi.fn(),
}));

import {
  loadCharacter,
  getCharacterAccess,
} from '../../../../src/use-cases/characters/load-character.js';
import { loadItemDataDetailMany } from '../../../../src/use-cases/characters/load-item-data.js';

const mockLoadCharacter = loadCharacter as ReturnType<typeof vi.fn>;
const mockGetCharacterAccess = getCharacterAccess as ReturnType<typeof vi.fn>;
const mockLoadItemDataDetailMany = loadItemDataDetailMany as ReturnType<typeof vi.fn>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CHAR_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const INSTANCE_ID = '33333333-3333-3333-3333-333333333333';

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: CHAR_ID,
    userId: USER_ID,
    worldId: 'ww-world',
    name: 'Aldric',
    status: 'active' as const,
    data: {
      baseStats: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
      classes: [{ slug: 'fighter', source: 'PHB', level: 1, armorProficiencies: ['light armor', 'medium armor', 'heavy armor', 'shields'], weaponProficiencies: ['simple weapons', 'martial weapons'] }],
    },
    inventory: [
      {
        instanceId: INSTANCE_ID,
        itemSlug: 'longsword',
        itemSource: 'PHB',
        quantity: 1,
        state: 'carried',
        attuned: false,
        customName: null,
        notes: '',
        equipHand: null,
        charges: null,
      },
    ],
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLongswordDetail() {
  return {
    slug: 'longsword',
    source: 'PHB',
    name: 'Longsword',
    type: 'M',
    weight: 3,
    property: ['V'],
    charges: null,
    recharge: null,
    containerCapacity: null,
    costCp: 1500,
    rarity: null,
    reqAttune: null,
    dmg1: '1d8',
    dmgType: 'Cortante',
    range: null,
    humanizedProperties: ['versátil'],
    entriesSummary: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('loadInventoryDetail — ACIDE-SHAPE-01: weapon variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCharacter.mockResolvedValue(makeCharacter());
    mockGetCharacterAccess.mockResolvedValue('owner');
    mockLoadItemDataDetailMany.mockResolvedValue([makeLongswordDetail()]);
  });

  it('returns ok:true with weapon variant including attackBonus (PHB p.194)', async () => {
    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: INSTANCE_ID,
      userId: USER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.detail.v3Type).toBe('weapon');
    const weapon = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').WeaponDetailVariant;
    // STR 16 → mod +3; proficiency level 1 → +2; total = 5
    expect(weapon.attackBonus).toBe(5);
    expect(weapon.dmg1).toBe('1d8');
    expect(weapon.dmgType).toBe('Cortante');
    expect(weapon.properties).toEqual(['versátil']);
    expect(weapon.instanceId).toBe(INSTANCE_ID);
    expect(weapon.displayName).toBe('Longsword');
  });
});

describe('loadInventoryDetail — ACIDE-AUTH-02: auth checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NOT_FOUND when character does not exist', async () => {
    mockLoadCharacter.mockResolvedValue(null);

    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: INSTANCE_ID,
      userId: USER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns FORBIDDEN when user does not own the character', async () => {
    mockLoadCharacter.mockResolvedValue(makeCharacter());
    mockGetCharacterAccess.mockResolvedValue('none');

    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: INSTANCE_ID,
      userId: 'other-user',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('FORBIDDEN');
  });

  it('returns INSTANCE_NOT_FOUND when instanceId does not exist in inventory', async () => {
    mockLoadCharacter.mockResolvedValue(makeCharacter());
    mockGetCharacterAccess.mockResolvedValue('owner');

    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: '99999999-9999-9999-9999-999999999999',
      userId: USER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INSTANCE_NOT_FOUND');
  });
});
