/**
 * Unit tests — assertCombatantOwnerOrGm helper.
 *
 * REQ-WCR-AUTH-01: shared combatant owner-OR-GM authorization helper.
 *
 * Tests cover all 5 discriminated outcomes:
 *   AUTH-U1: GM → always { ok: true } without checking character.userId
 *   AUTH-U2: player → own combatant → { ok: true }
 *   AUTH-U3: player → other player's PC → { ok: false, code: 'FORBIDDEN' }
 *   AUTH-U4: player → NPC combatant (characterId null) → { ok: false, code: 'NOT_FOUND' }
 *   AUTH-U5: combatant does not exist → { ok: false, code: 'NOT_FOUND' }
 *
 * All DB I/O is mocked — pure unit tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCombatantOwnerOrGm } from '../../src/use-cases/encounters/assert-combatant-owner-or-gm.js';

// ── Mock DB layer ─────────────────────────────────────────────────────────────

vi.mock('../../src/infra/db/client.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('../../src/infra/db/schema.js', () => ({
  encounterCombatants: {},
  characters: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ _col, val })),
  and: vi.fn((...args) => ({ and: args })),
}));

import { db } from '../../src/infra/db/client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENCOUNTER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMBATANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CHARACTER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OWNER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

/** Build a mock Drizzle fluent chain that resolves to `rows`. */
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

const mockDb = db as { select: ReturnType<typeof vi.fn> };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('assertCombatantOwnerOrGm — REQ-WCR-AUTH-01', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AUTH-U1: GM bypasses ownership check entirely.
  it('AUTH-U1: GM caller → { ok: true } without ownership lookup', async () => {
    // GM path: combatant IS loaded (helper needs to confirm existence), character NOT loaded.
    const combatantChain = makeSelectChain([
      { id: COMBATANT_ID, characterId: CHARACTER_ID },
    ]);
    mockDb.select.mockReturnValueOnce(combatantChain);

    const result = await assertCombatantOwnerOrGm({
      encounterId: ENCOUNTER_ID,
      combatantId: COMBATANT_ID,
      callerId: 'any-user-id',
      callerRole: 'gm',
    });

    expect(result).toEqual({ ok: true });
    // Character lookup must NOT be called for GM.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // AUTH-U2: Player whose callerId matches character.userId → owner path.
  it('AUTH-U2: player → own combatant → { ok: true }', async () => {
    const combatantChain = makeSelectChain([
      { id: COMBATANT_ID, characterId: CHARACTER_ID },
    ]);
    const characterChain = makeSelectChain([
      { id: CHARACTER_ID, userId: OWNER_USER_ID },
    ]);
    mockDb.select.mockReturnValueOnce(combatantChain).mockReturnValueOnce(characterChain);

    const result = await assertCombatantOwnerOrGm({
      encounterId: ENCOUNTER_ID,
      combatantId: COMBATANT_ID,
      callerId: OWNER_USER_ID,
      callerRole: 'player',
    });

    expect(result).toEqual({ ok: true });
  });

  // AUTH-U3: Player whose callerId does NOT match character.userId → FORBIDDEN.
  it('AUTH-U3: player → another player PC → { ok: false, code: FORBIDDEN }', async () => {
    const combatantChain = makeSelectChain([
      { id: COMBATANT_ID, characterId: CHARACTER_ID },
    ]);
    const characterChain = makeSelectChain([
      { id: CHARACTER_ID, userId: OWNER_USER_ID }, // NOT the caller
    ]);
    mockDb.select.mockReturnValueOnce(combatantChain).mockReturnValueOnce(characterChain);

    const result = await assertCombatantOwnerOrGm({
      encounterId: ENCOUNTER_ID,
      combatantId: COMBATANT_ID,
      callerId: OTHER_USER_ID,
      callerRole: 'player',
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  // AUTH-U4: Player targeting NPC (characterId null) → NOT_FOUND (no FORBIDDEN leak).
  it('AUTH-U4: player → NPC combatant (characterId null) → { ok: false, code: NOT_FOUND }', async () => {
    const combatantChain = makeSelectChain([
      { id: COMBATANT_ID, characterId: null },
    ]);
    mockDb.select.mockReturnValueOnce(combatantChain);

    const result = await assertCombatantOwnerOrGm({
      encounterId: ENCOUNTER_ID,
      combatantId: COMBATANT_ID,
      callerId: OWNER_USER_ID,
      callerRole: 'player',
    });

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
    // Character lookup must NOT be called — NPC short-circuit.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // AUTH-U5: Combatant does not exist → NOT_FOUND.
  it('AUTH-U5: combatant does not exist → { ok: false, code: NOT_FOUND }', async () => {
    const combatantChain = makeSelectChain([]); // empty rows
    mockDb.select.mockReturnValueOnce(combatantChain);

    const result = await assertCombatantOwnerOrGm({
      encounterId: ENCOUNTER_ID,
      combatantId: 'nonexistent-id',
      callerId: OWNER_USER_ID,
      callerRole: 'player',
    });

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
