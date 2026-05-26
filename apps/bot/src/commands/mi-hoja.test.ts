import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test.
// vi.mock() calls are hoisted by vitest/esbuild to the top of the file.
// ---------------------------------------------------------------------------

vi.mock('../api-client.js', () => {
  const LinkRequiredError = class extends Error {
    constructor(readonly body: string) {
      super('Discord user not linked');
    }
  };
  const api = { getAs: vi.fn() };
  return { api, LinkRequiredError, ApiError: class extends Error {} };
});

vi.mock('../env.js', () => ({
  env: { CAMPAIGN_ID: 'campaign-uuid-1234' },
}));

vi.mock('../embeds/character.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../embeds/character.js')>();
  return {
    ...actual,
    buildCharacterSheetEmbed: vi.fn().mockReturnValue({ dummyEmbed: true }),
  };
});

// ---------------------------------------------------------------------------
// Import under test AFTER mocks are declared
// ---------------------------------------------------------------------------
import { execute } from './mi-hoja.js';
import { api, LinkRequiredError } from '../api-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInteraction(overrides: Partial<ChatInputCommandInteraction> = {}): ChatInputCommandInteraction {
  return {
    user: { id: 'discord-user-123' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function makeCharacterRow(id: string, name: string) {
  return {
    id,
    campaignId: 'campaign-uuid-1234',
    name,
    status: 'active' as const,
    xp: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeSheetResponse() {
  return {
    character: { id: 'char-001', userId: 'user-001', worldId: 'world-001', status: 'active', xp: 0 },
    sheet: {
      identity: {
        name: 'Test',
        totalLevel: 1,
        classes: [{ slug: 'fighter', source: 'phb', level: 1, hitDie: 'd10', subclass: null }],
        race: { slug: 'human', source: 'phb' },
        subrace: null,
        background: null,
      },
      proficiencyBonus: 2,
      abilityScores: {},
      savingThrows: [],
      skills: [],
      passivePerception: 10,
      initiative: 0,
      armorClass: { value: 10, formula: '' },
      hitPoints: { max: 10, formula: '' },
      hitDice: {},
      speed: { walk: 30 },
      size: 'medium',
      carryingCapacity: 150,
      proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
      feats: [],
      breathWeapon: null,
      darkvision: null,
      racialSpells: [],
      racialTraits: [],
      spellcasting: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      encumbrance: { weight: 0, max: 150, status: 'ok' as const, thresholds: { encumbered: 50, heavily: 100, max: 150 }, speedPenalty: 0, coinWeight: 0 },
      attunement: { used: 0, max: 3 },
      spellSlots: { slots: [0,0,0,0,0,0,0,0,0] as const, pactMagic: null, slotsUsed: [0,0,0,0,0,0,0,0,0] as const, pactSlotsUsed: 0 },
      spellsByClass: [],
      exhaustion: { level: 0, effects: [] },
      classFeatures: {},
      classResources: {},
      warnings: [],
    },
    inventory: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/mi-hoja execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T11a: 0 active chars → editReply with no-character hint', async () => {
    vi.mocked(api.getAs).mockResolvedValueOnce({ data: [] });

    const interaction = makeInteraction();
    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(typeof replyArg).toBe('string');
    expect(replyArg).toContain('No tenés un character activo');
  });

  it('T11b: 1 active char → deferReply ephemeral + editReply with embed', async () => {
    const char = makeCharacterRow('char-001', 'Thorin');
    vi.mocked(api.getAs)
      .mockResolvedValueOnce({ data: [char] })           // list
      .mockResolvedValueOnce({ id: 'char-001', data: {} }) // detail
      .mockResolvedValueOnce(makeSheetResponse())          // sheet
      .mockResolvedValueOnce({ events: [] });              // recent-grants

    const interaction = makeInteraction();
    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(replyArg).toHaveProperty('embeds');
    expect(Array.isArray((replyArg as { embeds: unknown[] }).embeds)).toBe(true);
    expect((replyArg as { embeds: unknown[] }).embeds).toHaveLength(1);
  });

  it('T11c: N>1 active chars → editReply with list and hint to use /character show', async () => {
    const chars = [
      makeCharacterRow('char-001', 'Thorin'),
      makeCharacterRow('char-002', 'Gimli'),
    ];
    vi.mocked(api.getAs).mockResolvedValueOnce({ data: chars });

    const interaction = makeInteraction();
    await execute(interaction);

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(typeof replyArg).toBe('string');
    expect(replyArg).toContain('Thorin');
    expect(replyArg).toContain('Gimli');
    expect(replyArg).toContain('/character show name:');
  });

  it('T11d: LinkRequiredError → editReply with /link hint', async () => {
    vi.mocked(api.getAs).mockRejectedValueOnce(new LinkRequiredError('DISCORD_USER_NOT_LINKED'));

    const interaction = makeInteraction();
    await execute(interaction);

    const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(typeof replyArg).toBe('string');
    expect(replyArg).toContain('/link');
  });
});
