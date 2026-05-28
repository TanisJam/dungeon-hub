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

// ── ACIDA-PARSER-01: parseInventoryMetadata ───────────────────────────────────

import { parseInventoryMetadata } from '../../../../src/use-cases/characters/load-inventory-detail.js';

describe('parseInventoryMetadata — ACIDA-PARSER-01', () => {
  it('happy path: parses valid JSON with book fields', () => {
    const notes = JSON.stringify({
      book: { passage: 'Era una noche oscura', pagesRead: 12, pages: 200, language: 'Élfico', knowledge: ['historia'] },
    });
    const result = parseInventoryMetadata(notes);
    expect(result).not.toBeNull();
    expect(result?.book?.pagesRead).toBe(12);
    expect(result?.book?.language).toBe('Élfico');
  });

  it('non-JSON plain string returns null (no throw)', () => {
    const result = parseInventoryMetadata('Encontrado en la mazmorra');
    expect(result).toBeNull();
  });

  it('null input returns null', () => {
    const result = parseInventoryMetadata(null);
    expect(result).toBeNull();
  });

  it('empty string returns null', () => {
    const result = parseInventoryMetadata('');
    expect(result).toBeNull();
  });

  it('malformed JSON returns null (no throw)', () => {
    const result = parseInventoryMetadata('{broken: json}');
    expect(result).toBeNull();
  });
});

// ── ACIDA-SHAPE-01: new variant shapes ────────────────────────────────────────

function makeCharacterWithItem(item: Record<string, unknown>) {
  return {
    id: CHAR_ID,
    userId: USER_ID,
    worldId: 'ww-world',
    name: 'Aldric',
    status: 'active' as const,
    data: {
      baseStats: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
      classes: [{ slug: 'fighter', source: 'PHB', level: 1, armorProficiencies: ['light armor'], weaponProficiencies: ['simple weapons', 'martial weapons'] }],
    },
    inventory: [{ instanceId: INSTANCE_ID, itemSlug: 'test-item', itemSource: 'PHB', quantity: 1, state: 'carried', attuned: false, customName: null, notes: '', equipHand: null, charges: null, ...item }],
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMagicItemDetail(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'ring-of-protection',
    source: 'DMG',
    name: 'Ring of Protection',
    type: 'RG',
    weight: 0,
    property: [],
    charges: null,
    recharge: null,
    containerCapacity: null,
    costCp: null,
    rarity: 'rare',
    reqAttune: true,
    dmg1: null,
    dmgType: null,
    range: null,
    humanizedProperties: [],
    entriesSummary: '+1 bonus to AC and saving throws',
    ...overrides,
  };
}

describe('loadInventoryDetail — ACIDA-SHAPE-01: magic variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCharacterAccess.mockResolvedValue('owner');
  });

  it('magic variant with attunement: returns attuneRequired=true, attuned from instance', async () => {
    // PHB p.138: attunement requires short rest ritual
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({ attuned: true }));
    mockLoadItemDataDetailMany.mockResolvedValue([makeMagicItemDetail({ reqAttune: true })]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('magic');
    const magic = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').MagicDetailVariant;
    expect(magic.attuneRequired).toBe(true);
    expect(magic.attuned).toBe(true);
    expect(magic.restAttuneNote).toBe('Requiere sintonización durante un descanso corto');
    expect(magic.powerName).toBeNull(); // R7: always null
    expect(magic.powerDesc).toBe('+1 bonus to AC and saving throws');
  });

  it('magic variant without attunement: attuneRequired=false', async () => {
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({ attuned: false }));
    mockLoadItemDataDetailMany.mockResolvedValue([makeMagicItemDetail({ reqAttune: null, rarity: 'uncommon' })]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('magic');
    const magic = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').MagicDetailVariant;
    expect(magic.attuneRequired).toBe(false);
    expect(magic.attuned).toBe(false);
  });
});

describe('loadInventoryDetail — ACIDA-SHAPE-01: book variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCharacterAccess.mockResolvedValue('owner');
  });

  it('book variant parses notes JSON for bookMeta', async () => {
    const notes = JSON.stringify({ book: { passage: 'En el principio...', pagesRead: 5, pages: 150, language: 'Común', knowledge: ['hechicería'] } });
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({ v3TypeOverride: 'book', notes }));
    mockLoadItemDataDetailMany.mockResolvedValue([{ ...makeMagicItemDetail(), type: 'G', rarity: null, reqAttune: null, entriesSummary: null }]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('book');
    const book = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').BookDetailVariant;
    expect(book.passage).toBe('En el principio...');
    expect(book.pagesRead).toBe(5);
    expect(book.language).toBe('Común');
    expect(book.knowledge).toEqual(['hechicería']);
  });

  it('book variant uses defaults when notes is empty/non-JSON (house rule PHB p.114)', async () => {
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({ v3TypeOverride: 'book', notes: 'plain text note' }));
    mockLoadItemDataDetailMany.mockResolvedValue([{ ...makeMagicItemDetail(), type: 'G', rarity: null, reqAttune: null, entriesSummary: null }]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const book = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').BookDetailVariant;
    expect(book.passage).toBe('…');
    expect(book.pagesRead).toBe(0);
    expect(book.pages).toBe(100);
    expect(book.language).toBe('Común');
    expect(book.knowledge).toEqual([]);
  });
});

describe('loadInventoryDetail — ACIDA-SHAPE-01: trinket variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCharacterAccess.mockResolvedValue('owner');
  });

  it('trinket variant uses fallback narrative when entriesSummary is null (PHB p.161)', async () => {
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({}));
    mockLoadItemDataDetailMany.mockResolvedValue([{ ...makeMagicItemDetail(), type: null, rarity: null, reqAttune: null, entriesSummary: null }]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('trinket');
    const trinket = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').TrinketDetailVariant;
    // narrative is null when entriesSummary is null — fallback copy shown in UI
    expect(trinket.narrative).toBeNull();
  });
});

describe('loadInventoryDetail — ACIDA-SHAPE-01: quest variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCharacterAccess.mockResolvedValue('owner');
  });

  it('quest variant parses notes JSON for questMeta (house rule §1.2)', async () => {
    const notes = JSON.stringify({ quest: { questName: 'El Sello Roto', stage: 'Fase 2', visibleTo: 'DM' } });
    mockLoadCharacter.mockResolvedValue(makeCharacterWithItem({ v3TypeOverride: 'quest', notes }));
    mockLoadItemDataDetailMany.mockResolvedValue([{ ...makeMagicItemDetail(), type: null, rarity: null, reqAttune: null, entriesSummary: null }]);

    const result = await loadInventoryDetail({ characterId: CHAR_ID, instanceId: INSTANCE_ID, userId: USER_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('quest');
    const quest = result.detail as import('../../../../src/use-cases/characters/load-inventory-detail.js').QuestDetailVariant;
    expect(quest.questName).toBe('El Sello Roto');
    expect(quest.stage).toBe('Fase 2');
    expect(quest.visibleTo).toBe('DM');
  });
});

// ── ACVT-DERIVE-01: v3TypeOverride propagation in detail dispatch ─────────────

describe('loadInventoryDetail — ACVT-DERIVE-01: v3TypeOverride propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCharacterAccess.mockResolvedValue('owner');
  });

  it('instance with v3TypeOverride="book" dispatches to BookDetailVariant (ACVT-DERIVE-01 + T4)', async () => {
    // T4: 'book' case now handled — dispatches correctly to BookDetailVariant.
    const charWithBookOverride = makeCharacter({
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
          v3TypeOverride: 'book', // DM override
        },
      ],
    });
    mockLoadCharacter.mockResolvedValue(charWithBookOverride);
    mockLoadItemDataDetailMany.mockResolvedValue([makeLongswordDetail()]);

    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: INSTANCE_ID,
      userId: USER_ID,
    });

    // deriveV3Type returns 'book' (override wins), T4 switch case handles it.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('book');
  });

  it('instance without v3TypeOverride falls back to derived type from compendium', async () => {
    // Given: no override on the instance
    mockLoadCharacter.mockResolvedValue(makeCharacter()); // instance has no v3TypeOverride
    mockLoadItemDataDetailMany.mockResolvedValue([makeLongswordDetail()]);

    const result = await loadInventoryDetail({
      characterId: CHAR_ID,
      instanceId: INSTANCE_ID,
      userId: USER_ID,
    });

    // longsword type='M' → deriveV3Type returns 'weapon' (compendium-derived)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.detail.v3Type).toBe('weapon');
  });
});
