import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { validateStats } from '@dungeon-hub/domain/character/stats';
import { validateRaceSelection } from '@dungeon-hub/domain/character/race';
import { validateClassSelection } from '@dungeon-hub/domain/character/class';
import {
  validateBackgroundSelection,
  SetBackgroundBodyCustomizationSchema,
  normalizeAppliedBackground,
  type Customization,
} from '@dungeon-hub/domain/character/background';
import { validateMulticlassAddition, computeEffectiveScores } from '@dungeon-hub/domain/character/multiclass';
import { classGrantsSpellcasting, validateFeatSelection } from '@dungeon-hub/domain/character/feat';
import { computeSubclassUnlockLevel, deriveAsiLevels } from '@dungeon-hub/domain/character/class';
import { computeCharacterSheet, type SpellSheetRef } from '@dungeon-hub/domain/character/sheet';
import {
  addItemToInventory,
  consumeInventoryItem,
  rechargeInventoryItems,
  removeItemFromInventory,
  updateInventoryItem,
  type InventoryItem,
} from '@dungeon-hub/domain/character/inventory';
import { validateLongRestEligibility } from '@dungeon-hub/domain/character/rest';
import {
  SPELLCASTING_ABILITY,
  validateClassSpells,
  computeSpellLimits,
  computeSpellSlots,
  consumeSpellSlot,
  type AppliedClassSpells,
  type SpellLimitsView,
} from '@dungeon-hub/domain/character/spellcasting';
import { abilityModifier } from '@dungeon-hub/domain/character/multiclass';
import {
  canReachLevel,
  hpDeltaForLevelUp,
  hitDiceRecoveredOnLongRest,
  hitDiceTotalsByDie,
  hitDieFaces,
  hitDieHpGain,
  rollHitDie,
  chooseHitDiceRecovery,
  type HpMethod,
  type HitDieFace,
} from '@dungeon-hub/domain/character/level-up';
import type { AppliedAsi } from '@dungeon-hub/domain/character/race';
import type { AbilityScores } from '@dungeon-hub/domain/character/stats';
import type { AppliedClass } from '@dungeon-hub/domain/character/class';
import type { AppliedFeat } from '@dungeon-hub/domain/character/feat';
import { db } from '../../infra/db/client.js';
import { characters, compendiumSpells, worldMembers } from '../../infra/db/schema.js';
import { inArray } from 'drizzle-orm';
import {
  getCharacterAccess,
  loadCharacter,
} from '../../use-cases/characters/load-character.js';
import { assertWorldGm } from '../../use-cases/auth/assert-world-gm.js';
import { loadWorldById } from '../../use-cases/campaigns/load-campaign.js';
import { loadWorldRefData } from '../../use-cases/world/load-ref-data.js';
import { loadRaceAndSubrace, loadRaceSheetData } from '../../use-cases/characters/load-race-data.js';
import { loadClassAndSubclass } from '../../use-cases/characters/load-class-data.js';
import {
  loadBackgroundData,
  loadAllBackgrounds,
} from '../../use-cases/characters/load-background-data.js';
import { loadFeatData } from '../../use-cases/characters/load-feat-data.js';
import { buildFeatContext } from '../../use-cases/characters/build-feat-context.js';
import { loadItemData, loadItemDataMany } from '../../use-cases/characters/load-item-data.js';
import { recordSessionEventForCharacter } from '../../use-cases/sessions/events.js';
import { loadClassSpells } from '../../use-cases/characters/load-class-spells.js';
import { loadOptionalFeatures } from '../../use-cases/characters/load-optional-features.js';
import { loadFeatureProgression } from '../../use-cases/characters/load-feature-progression.js';
import {
  resolveFeatureSlots,
  validateClassFeaturePicks,
  type FeaturePicks,
} from '@dungeon-hub/domain/character/class-features';
import {
  classResourceBySlug,
  resetClassResourcesForRest,
} from '@dungeon-hub/domain/character/class-resources';

const SPELLBOOK_REF = { slug: 'spellbook', source: 'PHB' } as const;

/**
 * Crea una InventoryItem para el spellbook del wizard si todavía no tiene uno.
 * Se invoca al setear Wizard como primera clase o al multiclassear a Wizard.
 *
 * Pre-condition: `inventory` no tiene un item con itemSlug='spellbook'.
 * Post-condition: devuelve el inventory con el spellbook agregado.
 */
function ensureWizardSpellbook(inventory: InventoryItem[]): InventoryItem[] {
  const already = inventory.some(
    (it) => it.itemSlug === SPELLBOOK_REF.slug && it.itemSource === SPELLBOOK_REF.source,
  );
  if (already) return inventory;
  return [
    ...inventory,
    {
      instanceId: globalThis.crypto.randomUUID(),
      itemSlug: SPELLBOOK_REF.slug,
      itemSource: SPELLBOOK_REF.source,
      quantity: 1,
      state: 'carried',
      attuned: false,
      customName: null,
      notes: '',
    },
  ];
}

const CharacterStatus = z.enum(['draft', 'active', 'retired', 'dead', 'pending_approval']);

const CreateBody = z.object({
  worldId: z.string().uuid(),
  name: z.string().min(1).max(120),
  /** data libre por ahora — el constraint engine de Fase 1.4 le va a dar shape. */
  data: z.record(z.string(), z.unknown()).default({}),
});

const UpdateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  status: CharacterStatus.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const AwardXpBody = z.object({
  /** Delta signado. Negativo permite correcciones / penalty del DM. */
  award: z.number().int(),
});

// SP-05: consume a spell slot.
const ConsumeSlotBody = z.object({
  level: z.number().int().min(1).max(9),
  slotType: z.enum(['regular', 'pact']),
  /** Defaults to 1. Hardcoded to max 1 per MVP (PHB p.201). */
  count: z.number().int().min(1).max(1).optional(),
});

const ParamsWithId = z.object({ id: z.string().uuid() });

const ResourceMutationBody = z.object({
  slug: z.string().min(1),
  amount: z.number().int().positive().optional(),
});
const ListQuery = z.object({
  campaign: z.string().uuid().optional(),
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined))
    .pipe(z.array(CharacterStatus).optional()),
});

const SetStatsBody = z.object({
  method: z.enum(['standard-array', 'point-buy', 'roll']),
  scores: z.object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  }),
});

const AddFeatBody = z.object({
  feat: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  asiChoice: z
    .array(z.object({ ability: z.string().min(1), bonus: z.number().int() }))
    .optional(),
});

const AddMulticlassBody = z.object({
  class: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  subclass: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  skillChoices: z.array(z.string().min(1)).optional(),
});

const SetBackgroundBody = z.object({
  background: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  skillChoices: z.array(z.string().min(1)).optional(),
  languageChoices: z.array(z.string().min(1)).optional(),
  toolChoices: z.record(z.string(), z.array(z.string().min(1))).optional(),
  customization: SetBackgroundBodyCustomizationSchema.optional(),
});

const SetClassBody = z.object({
  class: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  level: z.number().int().min(1).max(20),
  subclass: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  skillChoices: z.array(z.string().min(1)).optional(),
});

const AddInventoryItemBody = z.object({
  item: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  quantity: z.number().int().min(1).optional(),
  state: z.enum(['equipped', 'carried', 'stowed']).optional(),
  attuned: z.boolean().optional(),
  customName: z.string().min(1).max(120).nullable().optional(),
  notes: z.string().max(1000).optional(),
  equipHand: z.enum(['main', 'off', 'both']).nullable().optional(),
  charges: z.number().int().min(0).nullable().optional(),
  containerId: z.string().uuid().nullable().optional(),
});

const ConsumeInventoryBody = z
  .object({ count: z.number().int().min(1).optional() })
  .optional();

const InventoryInstanceParams = z.object({
  id: z.string().uuid(),
  instanceId: z.string().uuid(),
});

const SpellRefSchema = z.object({
  slug: z.string().min(1),
  source: z.string().min(1),
});

const CopySpellBody = z.object({
  spell: SpellRefSchema,
});

const AbilityKeyEnumDef = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);

const AsiChoiceSchema = z.object({
  ability: AbilityKeyEnumDef,
  bonus: z.number().int(),
});

const ShortRestBody = z.object({
  hitDiceToSpend: z.record(z.string().regex(/^d\d+$/), z.number().int().min(1)).optional(),
  rolls: z.record(z.string().regex(/^d\d+$/), z.array(z.number().int().min(1))).optional(),
});

const LongRestBody = z.object({
  /**
   * R-04 (REST-04 / #826): player-driven hit-dice recovery distribution.
   * When omitted, the route falls back to the existing greedy "most-spent
   * first" heuristic. When present, validated by `chooseHitDiceRecovery`
   * (PHB p.186 — "the player chooses").
   */
  hitDiceRecoveryChoice: z
    .record(z.enum(['d6', 'd8', 'd10', 'd12']), z.number().int().nonnegative())
    .optional(),
});

/** REST-03 (#826): 24h server-clock cooldown on long rests per PHB p.186. */
const LONG_REST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const HpDeltaBody = z.object({
  /** Delta signado. Negativo daña (consume temp HP primero), positivo cura. */
  delta: z.number().int(),
  /** Nota opcional para el session event (ej. "fireball del lich"). */
  note: z.string().max(200).optional(),
});

const LevelUpBody = z
  .object({
    hpMethod: z.enum(['roll', 'average']),
    hpRoll: z.number().int().min(1).optional(),
    subclass: z
      .object({ slug: z.string().min(1), source: z.string().min(1) })
      .nullable()
      .optional(),
    asi: z.object({ choices: z.array(AsiChoiceSchema).min(1).max(2) }).optional(),
    feat: z
      .object({
        slug: z.string().min(1),
        source: z.string().min(1),
        asiChoice: z.array(AsiChoiceSchema).optional(),
      })
      .optional(),
    wizardFreeSpells: z.array(SpellRefSchema).optional(),
  })
  .refine((b) => !(b.asi && b.feat), {
    message: 'Pasá solo asi o feat, no ambos',
  });

const ClassSpellsBody = z.object({
  cantrips: z.array(SpellRefSchema).optional(),
  known: z.array(SpellRefSchema).optional(),
  prepared: z.array(SpellRefSchema).optional(),
});

const ClassSpellsParams = z.object({
  id: z.string().uuid(),
  classSlug: z.string().min(1),
});

const ClassFeaturesBody = z.object({
  /** Picks indexados por featureType: { "FS:F": [{slug, source}], "MV:B": [...] }. */
  picks: z.record(z.string().min(1), z.array(SpellRefSchema)),
});

const CurrencyDeltaBody = z
  .object({
    cp: z.number().int().optional(),
    sp: z.number().int().optional(),
    ep: z.number().int().optional(),
    gp: z.number().int().optional(),
    pp: z.number().int().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos una moneda debe estar presente',
  });

const UpdateInventoryItemBody = z
  .object({
    quantity: z.number().int().min(1).optional(),
    state: z.enum(['equipped', 'carried', 'stowed']).optional(),
    attuned: z.boolean().optional(),
    customName: z.string().min(1).max(120).nullable().optional(),
    notes: z.string().max(1000).optional(),
    equipHand: z.enum(['main', 'off', 'both']).nullable().optional(),
    charges: z.number().int().min(0).nullable().optional(),
    containerId: z.string().uuid().nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Al menos un campo debe estar presente',
  });

const AbilityKeyEnum = AbilityKeyEnumDef;
const SetRaceBody = z.object({
  race: z.object({ slug: z.string().min(1), source: z.string().min(1) }),
  subrace: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
  appliedAsis: z
    .array(
      z.object({
        ability: AbilityKeyEnum,
        bonus: z.number().int(),
        source: z.enum(['race', 'subrace']),
      }),
    )
    .optional(),
  /** Idiomas elegidos para llenar slots `any*` de la raza + subrace. */
  languageChoices: z.array(z.string().min(1)).optional(),
  /** Skills elegidas para razas con `skillProficiencies:[{any:N}]` (ej. Variant Human, Half-Elf). */
  skillChoices: z.array(z.string().min(1)).optional(),
  /**
   * Feat elegido para razas con `feats:[{any:1}]` (ej. Variant Human).
   * La API carga el FeatCompendiumData desde el compendio; el domain validator es puro.
   */
  featChoice: z
    .object({
      slug: z.string().min(1),
      source: z.string().min(1),
      /** ASI elegida para feats que dan un +1 libre (ej. Actor, Athlete). */
      asiChoice: z
        .array(z.object({ ability: AbilityKeyEnum, bonus: z.number().int() }))
        .optional(),
    })
    .nullable()
    .optional(),
  /**
   * Cantrip elegido por el jugador para razas que tienen un `isPlayerChoice` slot
   * en additionalSpellsNormalized (e.g. High Elf). Null = cantrip no elegido todavía.
   * Decision #606. PHB p.23.
   */
  raceCantrip: z
    .object({ slug: z.string().min(1), source: z.string().min(1) })
    .nullable()
    .optional(),
});

export const charactersRoute: FastifyPluginAsync = async (app) => {
  // ---- POST /characters ----------------------------------------------------
  // C5: characters are created directly under a world (worldId required).
  // campaignId is no longer accepted — the character's world scope is set at creation.
  app.post('/characters', { preHandler: app.authenticate }, async (request, reply) => {
    const body = CreateBody.parse(request.body);
    const userId = request.user!.sub;

    // Verify the world exists.
    const world = await loadWorldById(body.worldId);
    if (!world) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }

    // Verify user is a world member (worldMembers is the single source of truth).
    const worldMember = await db
      .select({ role: worldMembers.role })
      .from(worldMembers)
      .where(and(eq(worldMembers.worldId, body.worldId), eq(worldMembers.userId, userId)))
      .limit(1);
    if (worldMember.length === 0) {
      return reply.code(403).send({ error: 'NOT_WORLD_MEMBER', worldId: body.worldId });
    }

    const [created] = await db
      .insert(characters)
      .values({
        userId,
        worldId: body.worldId,
        name: body.name,
        data: body.data,
        // status default 'draft', inventory default '[]', xp default 0 (schema)
      })
      .returning();

    return reply.code(201).send(created);
  });

  // ---- GET /characters -----------------------------------------------------
  // Lista los personajes del user actual. Opcional ?campaign=:id para filtrar.
  // Opcional ?status=active,pending_approval (CSV) para filtrar por status.
  app.get('/characters', { preHandler: app.authenticate }, async (request) => {
    const userId = request.user!.sub;
    const { campaign, status: statusFilter } = ListQuery.parse(request.query);

    const conditions = [eq(characters.userId, userId)];
    // Post-C2: characters belong to worlds, not campaigns. The `campaign` query param
    // is kept for API compat but now filters by worldId (C5 will rename the param).
    if (campaign) conditions.push(eq(characters.worldId, campaign));
    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(characters.status, statusFilter));
    }

    const whereExpr = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await db
      .select({
        id: characters.id,
        worldId: characters.worldId,
        name: characters.name,
        status: characters.status,
        xp: characters.xp,
        createdAt: characters.createdAt,
        updatedAt: characters.updatedAt,
      })
      .from(characters)
      .where(whereExpr)
      .orderBy(characters.createdAt);

    return { data: rows };
  });

  // ---- GET /characters/:id -------------------------------------------------
  app.get('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    // Normalize background on read: ensures legacy saves (pre-customization) round-trip cleanly.
    const data = (character.data as Record<string, unknown> | null) ?? {};
    const rawBg = data['background'];
    if (rawBg != null) {
      try {
        data['background'] = normalizeAppliedBackground(rawBg);
      } catch {
        // If normalization throws (missing slug/source — unrecoverable corruption),
        // leave the raw data in place so the response still returns rather than 500.
      }
    }

    return { ...character, data };
  });

  // ---- GET /characters/:id/sheet ------------------------------------------
  // Ficha calculada: PB, modifiers, AC, HP, saves, skills, passive perception,
  // initiative, carrying capacity, spellcasting DC/attack, hit dice, speed.
  app.get('/characters/:id/sheet', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access === 'none') return reply.code(403).send({ error: 'FORBIDDEN' });

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const raceField = data['race'] as { slug: string; source: string } | null | undefined;
    const subraceField = data['subrace'] as { slug: string; source: string } | null | undefined;

    const raceData = raceField
      ? await loadRaceSheetData({
          raceSlug: raceField.slug,
          raceSource: raceField.source,
          subraceSlug: subraceField?.slug ?? null,
          subraceSource: subraceField?.source ?? null,
        })
      : null;

    const inventory = (character.inventory as InventoryItem[] | null) ?? [];
    const itemWeights = inventory.length
      ? await loadItemDataMany(
          inventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource })),
        )
      : [];

    // ---- SP-04: spell ref enrichment ----------------------------------------
    // Collect all (slug, source) pairs from character.data.spells across all classes.
    const spellsData = (data['spells'] as Record<string, { cantrips?: Array<{ slug: string; source: string }>; known?: Array<{ slug: string; source: string }>; prepared?: Array<{ slug: string; source: string }> }> | null | undefined) ?? {};
    const allSpellPairs: Array<{ slug: string; source: string }> = [];
    for (const classSpells of Object.values(spellsData)) {
      if (!classSpells) continue;
      for (const entry of [...(classSpells.cantrips ?? []), ...(classSpells.known ?? []), ...(classSpells.prepared ?? [])]) {
        allSpellPairs.push(entry);
      }
    }
    // Deduplicate by slug|source
    const uniqueSlugs = [...new Set(allSpellPairs.map((e) => e.slug))];
    let spellRefsBySlug: ReadonlyMap<string, SpellSheetRef> = new Map();
    if (uniqueSlugs.length > 0) {
      const rows = await db
        .select({
          slug: compendiumSpells.slug,
          source: compendiumSpells.source,
          name: compendiumSpells.name,
          level: compendiumSpells.level,
          ritual: compendiumSpells.ritual,
          concentration: compendiumSpells.concentration,
          componentsM: compendiumSpells.componentsM,
          componentsMCost: compendiumSpells.componentsMCost,
        })
        .from(compendiumSpells)
        .where(inArray(compendiumSpells.slug, uniqueSlugs));

      // Build composite-key map (source-aware per SP04-D-03)
      const refMap = new Map<string, SpellSheetRef>();
      for (const row of rows) {
        refMap.set(`${row.slug}|${row.source}`, {
          slug: row.slug,
          source: row.source,
          name: row.name,
          level: row.level,
          ritual: row.ritual,
          concentration: row.concentration,
          componentsM: row.componentsM,
          componentsMCost: row.componentsMCost ?? null,
        });
      }

      // Warn-log any picked (slug|source) absent from query result (REQ-SP04-08)
      const missing = allSpellPairs.filter((e) => !refMap.has(`${e.slug}|${e.source}`));
      if (missing.length > 0) {
        const missingKeys = [...new Set(missing.map((e) => `${e.slug}|${e.source}`))];
        app.log.warn({ missingSpellRefs: missingKeys }, 'SP-04: picked spell refs not found in compendium');
      }

      spellRefsBySlug = refMap;
    }
    // -------------------------------------------------------------------------

    const sheet = computeCharacterSheet({
      character: {
        name: character.name,
        baseStats: data['baseStats'] as never,
        asisApplied: data['asisApplied'] as never,
        levelUpAsis: data['levelUpAsis'] as never,
        classes: data['classes'] as never,
        background: data['background'] as never,
        feats: data['feats'] as never,
        race: raceField ?? null,
        subrace: subraceField ?? null,
        inventory,
        currency: data['currency'] as never,
        spells: data['spells'] as never,
        exhaustion: data['exhaustion'] as never,
        classFeatures: data['classFeatures'] as never,
        raceLanguageChoices: data['raceLanguageChoices'] as never,
        raceSkillChoices: data['raceSkillChoices'] as never,
        // Batch 6: racial cantrip pick (High Elf). Read-path tolerance — may be absent.
        raceCantrip: data['raceCantrip'] as never,
        // SP-05: slot usage tracking. Read-path tolerance — absent for pre-SP-05 characters.
        spellSlotsUsed: data['spellSlotsUsed'] as never,
        warlockSlotsUsed: data['warlockSlotsUsed'] as never,
        // R-07: class-resource usage counters (#819). Read-path tolerance — absent
        // on pre-SDD characters; deriveClassResources defaults to {} when undefined.
        classResourcesUsed: data['classResourcesUsed'] as never,
      },
      raceData,
      itemWeights,
      spellRefsBySlug,
      encumbranceVariant: campaign.rulesProfile.variantRules.encumbranceVariant,
    });

    // Augmented fields for sheet page (D.4):
    // currentHp: from character.data.hp.current (live HP tracking), falls back to null.
    // inventory: the raw inventory array from the character row.
    const hpData = (data as { hp?: { current?: number; max?: number } } | null)?.hp;
    const currentHp = hpData?.current ?? null;

    return {
      character: { id: character.id, userId: character.userId, worldId: character.worldId, status: character.status, xp: character.xp },
      sheet,
      currentHp,
      inventory,
    };
  });

  // ---- PATCH /characters/:id ----------------------------------------------
  // Solo el owner puede editar (campaign members tienen read-only).
  app.patch('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = UpdateBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    // Transition guard: pending_approval is only legal from draft.
    if (body.status === 'pending_approval' && character.status !== 'draft') {
      return reply.code(422).send({
        error: 'ILLEGAL_TRANSITION',
        from: character.status,
        to: 'pending_approval',
      });
    }

    const updates: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.data !== undefined) updates.data = body.data;

    const [updated] = await db
      .update(characters)
      .set(updates)
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- POST /characters/:id/xp --------------------------------------------
  // Otorga (o resta) XP. Solo el GM de la campaña del personaje puede usarlo.
  // El owner del personaje NO puede modificar su propio XP — eso lo gestiona el DM.
  // El delta puede ser negativo (correcciones / penalty). Resultado < 0 → 400.
  app.post('/characters/:id/xp', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AwardXpBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    // Auth: world-level GM check (post-C3: replaced campaign.gmUserId === userId)
    const xpGmCheck = await assertWorldGm(character.worldId, userId);
    if (!xpGmCheck.ok) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        issues: [{ code: 'WORLD_GM_REQUIRED', worldId: character.worldId, userId }],
      });
    }

    const next = character.xp + body.award;
    if (next < 0) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'XP_NEGATIVE', current: character.xp, award: body.award, result: next }],
      });
    }

    const [updated] = await db
      .update(characters)
      .set({ xp: next, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'xp_award',
      payload: { characterId: id, before: character.xp, award: body.award, after: next },
    });

    return { character: updated, xp: next, award: body.award };
  });

  // ---- DELETE /characters/:id ----------------------------------------------
  app.delete('/characters/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede borrar' });
    }

    await db.delete(characters).where(eq(characters.id, id));
    return reply.code(204).send();
  });

  // ---- PUT /characters/:id/stats ------------------------------------------
  // Primer paso del builder: setear baseStats (pre-racial).
  // Valida contra el método elegido + lo permitido por el Rules Profile de la campaña.
  app.put('/characters/:id/stats', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetStatsBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) {
      return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });
    }

    const result = validateStats(body.scores, body.method, campaign.rulesProfile.statGeneration);
    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const [updated] = await db
      .update(characters)
      .set({
        data: { ...data, baseStats: body.scores, statMethod: body.method },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- PUT /characters/:id/race -------------------------------------------
  // Setea race + subrace + ASIs raciales. Reglas:
  //   - Sources habilitadas en el Rules Profile.
  //   - Subrace tiene que pertenecer a la race.
  //   - Tasha's CYO toggle: redistribuye el bag a stats arbitrarios distintos.
  //   - Razas MPMM (ability: null): user provee +2/+1 a stats distintos.
  app.put('/characters/:id/race', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetRaceBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });
    const worldRefData = await loadWorldRefData(character.worldId);
    if (!worldRefData) return reply.code(500).send({ error: 'WORLD_REF_DATA_MISSING' });

    const { race, subrace } = await loadRaceAndSubrace({
      raceSlug: body.race.slug,
      raceSource: body.race.source,
      subraceSlug: body.subrace?.slug ?? null,
      subraceSource: body.subrace?.source ?? null,
    });

    if (!race) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'RACE_NOT_FOUND', race: body.race }],
      });
    }
    if (body.subrace && !subrace) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBRACE_NOT_FOUND', subrace: body.subrace }],
      });
    }

    // Load feat data if a featChoice was provided.
    let featData = null;
    if (body.featChoice) {
      featData = await loadFeatData({ slug: body.featChoice.slug, source: body.featChoice.source });
      if (!featData) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'FEAT_NOT_FOUND', feat: body.featChoice }],
        });
      }
    }

    // Build featContext from current character state (base stats + existing race ASIs).
    // We pass the NEW race ASIs after validation succeeds below, but the context for prereq
    // evaluation uses CURRENT baseStats (already set) and the ASIs from this PUT call
    // (which the validator computes and returns). We build a preliminary context using
    // the appliedAsis from the body — the validator will derive or verify them.
    // Per decision #547: bypass is handled inside validateRaceSelection / finishWithSkillsAndFeats.
    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const baseStats = charData['baseStats'] as AbilityScores | undefined;

    let featContext = undefined;
    if (body.featChoice && featData) {
      if (!baseStats) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'NO_BASE_STATS', hint: 'Setea baseStats antes de elegir un feat racial.' }],
        });
      }
      // Use the ASIs from the request body as the racial ASIs for context building.
      // For purelyFixed races, the validator will derive the same ASIs from raceData.
      // For choose/Tasha races, body.appliedAsis is what the user submitted.
      const racialAsis: AppliedAsi[] = (body.appliedAsis ?? []) as AppliedAsi[];
      const existingFeats = (charData['feats'] as AppliedFeat[] | undefined) ?? [];
      const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
      featContext = buildFeatContext({
        baseStats,
        racialAsis,
        existingFeats,
        classes,
        race: body.race,
      });
    }

    // Load wizard cantrip pool for RACE_CANTRIP_REQUIRED / RACE_CANTRIP_INVALID gates (High Elf).
    // PHB p.23: High Elf can learn one cantrip from the Wizard spell list.
    const wizardCantrips = await loadClassSpells({ classSlug: 'wizard', rulesProfile: campaign.rulesProfile });
    const wizardCantripPool = wizardCantrips
      .filter((s) => s.level === 0)
      .map((s) => ({ slug: s.slug, source: s.source }));

    const result = validateRaceSelection({
      raceData: race,
      ...(subrace !== null ? { subraceData: subrace } : {}),
      rulesProfile: campaign.rulesProfile,
      worldRefData,
      ...(body.appliedAsis !== undefined ? { appliedAsis: body.appliedAsis } : {}),
      ...(body.languageChoices !== undefined ? { languageChoices: body.languageChoices } : {}),
      ...(body.skillChoices !== undefined ? { skillChoices: body.skillChoices } : {}),
      ...(featData !== null && featContext !== undefined
        ? {
            featChoice: {
              featData,
              ...(body.featChoice?.asiChoice !== undefined
                ? { asiChoice: body.featChoice.asiChoice }
                : {}),
            },
            featContext,
          }
        : {}),
      raceCantrip: body.raceCantrip ?? null,
      wizardCantripPool,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    // Persist: re-edit replaces previous race-granted feat (if any) then appends the new one.
    const prevData = (character.data as Record<string, unknown> | null) ?? {};
    const prevFeats = (prevData['feats'] as AppliedFeat[] | undefined) ?? [];
    const prevRaceFeatSlug = (prevData as { raceFeatSlug?: string | null }).raceFeatSlug ?? null;

    // Remove the previous race-granted feat entry (re-edit path).
    // Match on slug only — raceFeatSlug is the pointer; source is the compendium source (e.g. 'PHB').
    const featsWithoutRaceFeat = prevRaceFeatSlug
      ? prevFeats.filter((f) => f.slug !== prevRaceFeatSlug)
      : prevFeats;

    // Append the new race-granted feat (if the result includes one).
    const newFeats: AppliedFeat[] = result.appliedFeat
      ? [...featsWithoutRaceFeat, result.appliedFeat]
      : featsWithoutRaceFeat;

    const newRaceFeatSlug = result.appliedFeat?.slug ?? null;

    const [updated] = await db
      .update(characters)
      .set({
        data: {
          ...prevData,
          race: body.race,
          subrace: body.subrace ?? null,
          asisApplied: result.appliedAsis,
          usedTashasCustomOrigin: result.usedTashasCustomOrigin,
          raceLanguageChoices: result.appliedLanguageChoices,
          raceSkillChoices: result.appliedSkillChoices,
          raceFeatSlug: newRaceFeatSlug,
          feats: newFeats,
          // Persist raceCantrip: explicit send (even null) replaces; absent field leaves existing value.
          ...(body.raceCantrip !== undefined ? { raceCantrip: body.raceCantrip } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- PUT /characters/:id/class ------------------------------------------
  // Setea la clase principal + level + subclass (si está desbloqueada) + skill choices.
  // En este slice: una sola clase. Multiclass entra en 1.4e.
  app.put('/characters/:id/class', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetClassBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const { classData, subclassData } = await loadClassAndSubclass({
      classSlug: body.class.slug,
      classSource: body.class.source,
      subclassSlug: body.subclass?.slug ?? null,
      subclassSource: body.subclass?.source ?? null,
    });

    if (!classData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'CLASS_NOT_FOUND', class: body.class }],
      });
    }
    if (body.subclass && !subclassData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBCLASS_NOT_FOUND', subclass: body.subclass }],
      });
    }

    const result = validateClassSelection({
      classData,
      subclassData,
      level: body.level,
      ...(body.skillChoices !== undefined ? { skillChoices: body.skillChoices } : {}),
      rulesProfile: campaign.rulesProfile,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};

    // Cross-step: class skill choices no pueden duplicar las que da el background.
    // Background.skills incluye fixed + chosen (appliedBackground).
    const bgSkills = ((data as { background?: { skills?: string[] } }).background?.skills ?? []).map(
      (s) => s.toLowerCase(),
    );
    const classSkills = result.appliedClass.skillChoices.map((s) => s.toLowerCase());
    const skillOverlap = classSkills.filter((s) => bgSkills.includes(s));
    if (skillOverlap.length > 0) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SKILL_DUPLICATE_WITH_BACKGROUND', skills: skillOverlap }],
      });
    }

    // Si es Wizard, auto-agrega el spellbook (PHB p.114). Idempotente.
    const inventoryAfter = result.appliedClass.slug === 'wizard'
      ? ensureWizardSpellbook((character.inventory as InventoryItem[] | null) ?? [])
      : (character.inventory as InventoryItem[] | null) ?? [];

    const [updated] = await db
      .update(characters)
      .set({
        data: {
          ...data,
          // Reemplaza la lista entera de clases con la nueva selección (single class por ahora).
          // Multiclass agregará/editará entradas de este array.
          classes: [result.appliedClass],
        },
        inventory: inventoryAfter,
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- PUT /characters/:id/background -------------------------------------
  // Aplica un background: skills + languages + tools.
  // Starting equipment se hace en un slice aparte (selector a/b).
  app.put('/characters/:id/background', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = SetBackgroundBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const backgroundData = await loadBackgroundData({
      slug: body.background.slug,
      source: body.background.source,
    });
    if (!backgroundData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'BACKGROUND_NOT_FOUND', background: body.background }],
      });
    }

    // For Custom Background: load all backgrounds to validate feature slugs + equipment packages.
    // (~57 rows, one-shot read, acceptable cost per PUT.)
    const allBackgrounds = body.background.slug === 'custom-background'
      ? await loadAllBackgrounds()
      : [];

    const result = validateBackgroundSelection({
      backgroundData,
      rulesProfile: campaign.rulesProfile,
      ...(body.skillChoices !== undefined ? { skillChoices: body.skillChoices } : {}),
      ...(body.languageChoices !== undefined ? { languageChoices: body.languageChoices } : {}),
      ...(body.toolChoices !== undefined ? { toolChoices: body.toolChoices } : {}),
      // Cast through Customization — Zod-inferred body.customization has `mixedPool?: T | undefined`
      // which TS cannot prove equivalent to the domain `mixedPool?: T` shape under exactOpt.
      // The Zod schema validates the runtime shape; the cast is safe.
      ...(body.customization !== undefined
        ? { customization: body.customization as Customization }
        : {}),
      allBackgrounds,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};

    // Cross-step: background skills no pueden duplicar las que ya da la clase.
    // PHB p.125: "If a character would gain the same proficiency from two different
    // sources, he or she can choose a different proficiency of the same kind instead."
    const classSkills = ((data as { classes?: Array<{ skillChoices?: string[] }> }).classes?.[0]?.skillChoices ?? []).map(
      (s) => s.toLowerCase(),
    );
    const bgSkills = result.appliedBackground.skills.map((s) => s.toLowerCase());
    const skillOverlap = bgSkills.filter((s) => classSkills.includes(s));
    if (skillOverlap.length > 0) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SKILL_DUPLICATE_WITH_CLASS', skills: skillOverlap }],
      });
    }

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...data, background: result.appliedBackground },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return updated;
  });

  // ---- POST /characters/:id/classes ---------------------------------------
  // Agrega una nueva clase como multiclass (level 1). Prereqs PHB p.163 + profs
  // reducidas PHB p.164. Para subir nivel de clase existente: Fase 1.8.
  app.post('/characters/:id/classes', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AddMulticlassBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const { classData, subclassData } = await loadClassAndSubclass({
      classSlug: body.class.slug,
      classSource: body.class.source,
      subclassSlug: body.subclass?.slug ?? null,
      subclassSource: body.subclass?.source ?? null,
    });

    if (!classData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'CLASS_NOT_FOUND', class: body.class }],
      });
    }
    if (body.subclass && !subclassData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SUBCLASS_NOT_FOUND', subclass: body.subclass }],
      });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const existingClasses = (charData['classes'] as AppliedClass[] | undefined) ?? [];

    const result = validateMulticlassAddition({
      rulesProfile: campaign.rulesProfile,
      baseStats: (charData['baseStats'] as AbilityScores | undefined) ?? null,
      asisApplied: (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [],
      existingClasses: existingClasses.map((c) => ({ slug: c.slug, source: c.source })),
      newClassData: classData,
      ...(subclassData !== undefined ? { newSubclassData: subclassData } : {}),
      ...(body.skillChoices !== undefined ? { skillChoices: body.skillChoices } : {}),
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const updatedClasses = [...existingClasses, result.appliedClass];

    // Si la nueva clase es Wizard y todavía no tiene spellbook, lo agregamos.
    const inventoryAfter = result.appliedClass.slug === 'wizard'
      ? ensureWizardSpellbook((character.inventory as InventoryItem[] | null) ?? [])
      : (character.inventory as InventoryItem[] | null) ?? [];

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...charData, classes: updatedClasses },
        inventory: inventoryAfter,
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return reply.code(201).send(updated);
  });

  // ---- POST /characters/:id/feats -----------------------------------------
  // Agrega un feat al personaje. Valida prereqs (ability/proficiency/race/
  // spellcasting), aplica el ASI del feat (fijo o elegido).
  app.post('/characters/:id/feats', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AddFeatBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const featData = await loadFeatData({ slug: body.feat.slug, source: body.feat.source });
    if (!featData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'FEAT_NOT_FOUND', feat: body.feat }],
      });
    }

    // Construir el context del personaje a partir de character.data
    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const baseStats = charData['baseStats'] as AbilityScores | undefined;
    if (!baseStats) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'NO_BASE_STATS', hint: 'Setea baseStats antes de tomar feats.' }],
      });
    }

    const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
    const existingFeats = (charData['feats'] as AppliedFeat[] | undefined) ?? [];
    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
    const raceField = charData['race'] as { slug: string; source: string } | null | undefined;

    const ctx = buildFeatContext({
      baseStats,
      racialAsis,
      existingFeats,
      classes,
      race: raceField ?? null,
    });

    const result = validateFeatSelection({
      featData,
      rulesProfile: campaign.rulesProfile,
      ctx,
      ...(body.asiChoice !== undefined ? { asiChoice: body.asiChoice } : {}),
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const updatedFeats = [...existingFeats, result.appliedFeat];

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...charData, feats: updatedFeats },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    return reply.code(201).send(updated);
  });

  // ---- POST /characters/:id/inventory -------------------------------------
  // Agrega un ítem al inventario. Hard rule: attune cap 3.
  // Warnings (no bloquean): encumbrance, equip sin proficiencia.
  app.post('/characters/:id/inventory', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = AddInventoryItemBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const itemData = await loadItemData({ slug: body.item.slug, source: body.item.source });
    if (!itemData) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'ITEM_NOT_FOUND', item: body.item }],
      });
    }

    const ctx = await buildInventoryContext(character);
    const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];

    // Cargamos los pesos de todo el inventario actual + el nuevo en una sola query.
    const allRefs = [
      ...existingInventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource })),
      { slug: itemData.slug, source: itemData.source },
    ];
    const weights = await loadItemDataMany(allRefs);

    const result = addItemToInventory({
      inventory: existingInventory,
      itemData,
      input: {
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.state !== undefined ? { state: body.state } : {}),
        ...(body.attuned !== undefined ? { attuned: body.attuned } : {}),
        ...(body.customName !== undefined ? { customName: body.customName } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.equipHand !== undefined ? { equipHand: body.equipHand } : {}),
        ...(body.charges !== undefined ? { charges: body.charges } : {}),
        ...(body.containerId !== undefined ? { containerId: body.containerId } : {}),
      },
      weights,
      ctx,
    });

    if (!result.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
    }

    const [updated] = await db
      .update(characters)
      .set({ inventory: result.inventory, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'inventory_add',
      payload: {
        characterId: id,
        instanceId: result.addedInstanceId,
        itemSlug: itemData.slug,
        itemSource: itemData.source,
        quantity: body.quantity ?? 1,
        state: body.state ?? 'carried',
      },
    });

    return reply.code(201).send({
      character: updated,
      addedInstanceId: result.addedInstanceId,
      warnings: result.warnings,
    });
  });

  // ---- PATCH /characters/:id/currency -------------------------------------
  // Aplica deltas signados a cada moneda. Si una resta deja una moneda negativa
  // → 400 INSUFFICIENT_FUNDS. Sin conversión automática entre monedas.
  app.patch('/characters/:id/currency', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = CurrencyDeltaBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const data = (character.data as Record<string, unknown> | null) ?? {};
    const current = (data['currency'] as Record<string, number> | undefined) ?? {
      cp: 0, sp: 0, ep: 0, gp: 0, pp: 0,
    };

    const next: Record<string, number> = { ...current };
    const issues: Array<{ code: string; coin: string; current: number; delta: number; result: number }> = [];
    for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
      const delta = body[coin];
      if (delta === undefined) continue;
      const result = (current[coin] ?? 0) + delta;
      if (result < 0) {
        issues.push({ code: 'INSUFFICIENT_FUNDS', coin, current: current[coin] ?? 0, delta, result });
      }
      next[coin] = result;
    }

    if (issues.length > 0) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues });
    }

    const [updated] = await db
      .update(characters)
      .set({ data: { ...data, currency: next }, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    const deltas: Record<string, number> = {};
    for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
      if (body[coin] !== undefined) deltas[coin] = body[coin] as number;
    }
    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'currency_change',
      payload: { characterId: id, deltas, before: current, after: next },
    });

    return { character: updated, currency: next };
  });

  // ---- PATCH /characters/:id/inventory/:instanceId ------------------------
  // Patch parcial. Hard rule: attune false→true respeta cap 3.
  // Warnings: encumbrance, equip sin proficiencia.
  app.patch(
    '/characters/:id/inventory/:instanceId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, instanceId } = InventoryInstanceParams.parse(request.params);
      const body = UpdateInventoryItemBody.parse(request.body);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];
      const target = existingInventory.find((it) => it.instanceId === instanceId);
      if (!target) {
        return reply.code(404).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'INSTANCE_NOT_FOUND', instanceId }],
        });
      }

      const itemData = await loadItemData({
        slug: target.itemSlug,
        source: target.itemSource,
      });
      if (!itemData) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'ITEM_NOT_FOUND', item: { slug: target.itemSlug, source: target.itemSource } }],
        });
      }

      const ctx = await buildInventoryContext(character);
      const allRefs = existingInventory.map((it) => ({ slug: it.itemSlug, source: it.itemSource }));
      const weights = await loadItemDataMany(allRefs);

      const result = updateInventoryItem({
        inventory: existingInventory,
        instanceId,
        patch: {
          ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
          ...(body.attuned !== undefined ? { attuned: body.attuned } : {}),
          ...(body.customName !== undefined ? { customName: body.customName } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.equipHand !== undefined ? { equipHand: body.equipHand } : {}),
          ...(body.charges !== undefined ? { charges: body.charges } : {}),
          ...(body.containerId !== undefined ? { containerId: body.containerId } : {}),
        },
        itemData,
        weights,
        ctx,
      });

      if (!result.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      const [updated] = await db
        .update(characters)
        .set({ inventory: result.inventory, updatedAt: new Date() })
        .where(eq(characters.id, id))
        .returning();

      const patchKeys = Object.keys(body).filter(
        (k) => (body as Record<string, unknown>)[k] !== undefined,
      );
      await recordSessionEventForCharacter({
        characterId: id,
        actorUserId: userId,
        eventType: 'inventory_update',
        payload: {
          characterId: id,
          instanceId,
          itemSlug: target.itemSlug,
          itemSource: target.itemSource,
          patch: patchKeys.reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (body as Record<string, unknown>)[k];
            return acc;
          }, {}),
        },
      });

      return { character: updated, warnings: result.warnings };
    },
  );

  // ---- POST /characters/:id/inventory/:instanceId/consume -----------------
  // Consume cargas o uses. Si el ítem tiene charges (wand, lodestone) →
  // decrementa charges. Si es potion/scroll (type P/SC) → decrementa quantity
  // y elimina la instancia cuando llega a 0. Sino → ITEM_NOT_CONSUMABLE.
  app.post(
    '/characters/:id/inventory/:instanceId/consume',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, instanceId } = InventoryInstanceParams.parse(request.params);
      const body = ConsumeInventoryBody.parse(request.body ?? {});
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];
      const target = existingInventory.find((it) => it.instanceId === instanceId);
      if (!target) {
        return reply.code(404).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'INSTANCE_NOT_FOUND', instanceId }],
        });
      }

      const itemData = await loadItemData({
        slug: target.itemSlug,
        source: target.itemSource,
      });
      if (!itemData) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            { code: 'ITEM_NOT_FOUND', item: { slug: target.itemSlug, source: target.itemSource } },
          ],
        });
      }

      const result = consumeInventoryItem({
        inventory: existingInventory,
        instanceId,
        itemData,
        ...(body?.count !== undefined ? { count: body.count } : {}),
      });

      if (!result.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      const [updated] = await db
        .update(characters)
        .set({ inventory: result.inventory, updatedAt: new Date() })
        .where(eq(characters.id, id))
        .returning();

      await recordSessionEventForCharacter({
        characterId: id,
        actorUserId: userId,
        eventType: 'consume',
        payload: {
          characterId: id,
          instanceId,
          itemSlug: target.itemSlug,
          itemSource: target.itemSource,
          ...result.consumed,
        },
      });

      return { character: updated, consumed: result.consumed };
    },
  );

  // ---- DELETE /characters/:id/inventory/:instanceId -----------------------
  app.delete(
    '/characters/:id/inventory/:instanceId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, instanceId } = InventoryInstanceParams.parse(request.params);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];
      const target = existingInventory.find((it) => it.instanceId === instanceId);
      const result = removeItemFromInventory({ inventory: existingInventory, instanceId });

      if (!result.ok) {
        return reply.code(404).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      const [updated] = await db
        .update(characters)
        .set({ inventory: result.inventory, updatedAt: new Date() })
        .where(eq(characters.id, id))
        .returning();

      if (target) {
        await recordSessionEventForCharacter({
          characterId: id,
          actorUserId: userId,
          eventType: 'inventory_remove',
          payload: {
            characterId: id,
            instanceId,
            itemSlug: target.itemSlug,
            itemSource: target.itemSource,
            quantity: target.quantity,
          },
        });
      }

      return { character: updated, warnings: result.warnings };
    },
  );

  // ---- POST /characters/:id/spellbook/copy -------------------------------
  // Copia un spell al spellbook del Wizard. Cuesta 50 gp × nivel del spell
  // (PHB p.114). Cantrips NO se copian con este endpoint (no van al spellbook).
  // Devuelve el personaje actualizado + el time en horas que tomaría (2 × nivel).
  app.post('/characters/:id/spellbook/copy', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = CopySpellBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const campaign = await loadWorldById(character.worldId);
    if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
    const wizard = classes.find((c) => c.slug === 'wizard');
    if (!wizard) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'NO_WIZARD_CLASS' }],
      });
    }

    // Cargar la lista de spells de wizard filtrada por Rules Profile.
    const wizardSpells = await loadClassSpells({
      classSlug: 'wizard',
      rulesProfile: campaign.rulesProfile,
    });
    const spellLite = wizardSpells.find(
      (s) => s.slug === body.spell.slug && s.source === body.spell.source,
    );
    if (!spellLite) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SPELL_NOT_IN_CLASS_LIST', spell: body.spell, classSlug: 'wizard' }],
      });
    }

    if (spellLite.level === 0) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'CANTRIP_NOT_COPYABLE', spell: body.spell }],
      });
    }

    // ¿Ya lo tiene en el spellbook?
    const allSpells = (charData['spells'] as Record<string, AppliedClassSpells> | undefined) ?? {};
    const wizardSpellsState: AppliedClassSpells =
      allSpells['wizard'] ?? { cantrips: [], known: [], prepared: [] };
    const alreadyKnown = wizardSpellsState.known.some(
      (s) => s.slug === body.spell.slug && s.source === body.spell.source,
    );
    if (alreadyKnown) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'SPELL_ALREADY_IN_SPELLBOOK', spell: body.spell }],
      });
    }

    // Costo en gold: 50 × nivel.
    const costGp = 50 * spellLite.level;
    const currency = (charData['currency'] as Record<string, number> | undefined) ?? {
      cp: 0, sp: 0, ep: 0, gp: 0, pp: 0,
    };
    if ((currency['gp'] ?? 0) < costGp) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [
          {
            code: 'INSUFFICIENT_GOLD',
            costGp,
            availableGp: currency['gp'] ?? 0,
            spellLevel: spellLite.level,
          },
        ],
      });
    }

    const nextCurrency = { ...currency, gp: (currency['gp'] ?? 0) - costGp };
    const nextWizardSpells: AppliedClassSpells = {
      ...wizardSpellsState,
      known: [...wizardSpellsState.known, { slug: body.spell.slug, source: body.spell.source }],
    };
    const nextSpells = { ...allSpells, wizard: nextWizardSpells };

    const [updated] = await db
      .update(characters)
      .set({
        data: { ...charData, currency: nextCurrency, spells: nextSpells },
        updatedAt: new Date(),
      })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'spellbook_copy',
      payload: {
        characterId: id,
        spellSlug: body.spell.slug,
        spellSource: body.spell.source,
        spellLevel: spellLite.level,
        costGp,
      },
    });

    return reply.code(201).send({
      character: updated,
      cost: { gp: costGp, hours: 2 * spellLite.level },
      spell: body.spell,
    });
  });

  // ---- GET /characters/:id/classes/:classSlug/spells/options --------------
  // Devuelve los límites de selección de spells + lista disponible + subclase grants
  // para una clase aplicada al personaje. Usado por el paso de hechizos del wizard.
  //
  // Response shape:
  //   { limits: SpellLimitsView, availableSpells: SpellRow[], subclassGrantedSlugs: string[] }
  //
  // Para clases no-caster (ability === null), short-circuit: retorna todo en cero/vacío.
  app.get(
    '/characters/:id/classes/:classSlug/spells/options',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, classSlug } = ClassSpellsParams.parse(request.params);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede acceder' });
      }

      const campaign = await loadWorldById(character.worldId);
      if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

      const charData = (character.data as Record<string, unknown> | null) ?? {};
      const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
      const appliedClass = classes.find((c) => c.slug === classSlug);
      if (!appliedClass) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CLASS_NOT_ON_CHARACTER', classSlug }],
        });
      }

      // Determinar la spellcasting ability de la clase.
      const ability = SPELLCASTING_ABILITY[appliedClass.slug] ?? null;

      // Short-circuit para clases no-caster: devolver todo en cero/vacío.
      if (!ability) {
        const emptyLimits: SpellLimitsView = {
          cantripsKnown: 0,
          spellsKnown: null,
          spellsPrepared: null,
          maxSpellLevel: 0,
          ability: null,
        };
        return reply.code(200).send({
          limits: emptyLimits,
          availableSpells: [],
          subclassGrantedSlugs: [],
        });
      }

      // Calcular abilityMod del personaje (misma lógica que PUT .../spells).
      const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      };
      const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
      const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
      const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
        f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
      );
      const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
      const abilityMod = abilityModifier(effective[ability]);

      const limits = computeSpellLimits(appliedClass, abilityMod);

      // Cargar el universo de spells con subclase (para detectar grants) y sin subclase.
      const subclassSlug = appliedClass.subclass?.slug;
      const withSubclass = await loadClassSpells({
        classSlug,
        ...(subclassSlug ? { subclassSlug } : {}),
        rulesProfile: campaign.rulesProfile,
      });
      const withoutSubclass = subclassSlug
        ? await loadClassSpells({ classSlug, rulesProfile: campaign.rulesProfile })
        : withSubclass;

      // Detectar los slugs otorgados por la subclase (presentes en withSubclass pero no en withoutSubclass).
      const baseSet = new Set(withoutSubclass.map((s) => `${s.slug}|${s.source}`));
      const subclassGrantedSlugs = withSubclass
        .filter((s) => !baseSet.has(`${s.slug}|${s.source}`))
        .map((s) => s.slug);

      // Hidratar la lista con name + school + metadata via una query a compendiumSpells.
      const slugs = withSubclass.map((s) => s.slug);
      type SpellRow = {
        slug: string;
        source: string;
        name: string;
        level: number;
        school: string;
        ritual: boolean;
        concentration: boolean;
        componentsM: boolean;
        componentsMCost: number | null;
      };
      let availableSpells: SpellRow[] = [];
      if (slugs.length > 0) {
        const rows = await db
          .select({
            slug: compendiumSpells.slug,
            source: compendiumSpells.source,
            name: compendiumSpells.name,
            level: compendiumSpells.level,
            school: compendiumSpells.school,
            ritual: compendiumSpells.ritual,
            concentration: compendiumSpells.concentration,
            componentsM: compendiumSpells.componentsM,
            componentsMCost: compendiumSpells.componentsMCost,
          })
          .from(compendiumSpells)
          .where(inArray(compendiumSpells.slug, slugs));

        // Filtrar los spells según el maxSpellLevel y solo incluir los que están en withSubclass.
        const withSubclassKeys = new Set(withSubclass.map((s) => `${s.slug}|${s.source}`));
        availableSpells = rows.filter(
          (r) =>
            withSubclassKeys.has(`${r.slug}|${r.source}`) &&
            r.level <= limits.maxSpellLevel,
        );
      }

      return reply.code(200).send({ limits, availableSpells, subclassGrantedSlugs });
    },
  );

  // ---- PUT /characters/:id/classes/:classSlug/spells ----------------------
  // Setea la selección de spells (cantrips + known + prepared) para UNA clase.
  // Las reglas dependen de la clase:
  //   - Cleric/Druid/Paladin/Artificer: prep desde lista, sin `known`.
  //   - Wizard: prep desde spellbook (`known` = spellbook).
  //   - Bard/Sorc/Warlock/Ranger/EK/AT: `known` fijo, sin `prepared`.
  // Persiste en character.data.spells[classSlug].
  app.put(
    '/characters/:id/classes/:classSlug/spells',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, classSlug } = ClassSpellsParams.parse(request.params);
      const body = ClassSpellsBody.parse(request.body);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const campaign = await loadWorldById(character.worldId);
      if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

      const charData = (character.data as Record<string, unknown> | null) ?? {};
      const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
      const appliedClass = classes.find((c) => c.slug === classSlug);
      if (!appliedClass) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CLASS_NOT_ON_CHARACTER', classSlug }],
        });
      }

      // Calcular abilityMod del personaje según la spellcasting ability de la clase.
      const ability = SPELLCASTING_ABILITY[appliedClass.slug];
      if (!ability) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CLASS_NOT_CASTER', classSlug }],
        });
      }

      const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      };
      const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
      const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
      const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
        f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
      );
      const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
      const abilityMod = abilityModifier(effective[ability]);

      // Cargar el universo de spells permitidos para esta clase (ya filtrado por
      // el Rules Profile). Incluye bonus spells del subclass del PJ si tiene uno
      // elegido (Light Domain Cleric obtiene Fireball, etc.).
      const availableSpells = await loadClassSpells({
        classSlug,
        ...(appliedClass.subclass?.slug ? { subclassSlug: appliedClass.subclass.slug } : {}),
        rulesProfile: campaign.rulesProfile,
      });

      const result = validateClassSpells({
        appliedClass,
        abilityMod,
        availableSpells,
        input: {
          ...(body.cantrips !== undefined ? { cantrips: body.cantrips } : {}),
          ...(body.known !== undefined ? { known: body.known } : {}),
          ...(body.prepared !== undefined ? { prepared: body.prepared } : {}),
        },
      });

      if (!result.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      const existingSpells = (charData['spells'] as Record<string, AppliedClassSpells> | undefined) ?? {};
      const nextSpells = { ...existingSpells, [classSlug]: result.applied };

      const [updated] = await db
        .update(characters)
        .set({ data: { ...charData, spells: nextSpells }, updatedAt: new Date() })
        .where(eq(characters.id, id))
        .returning();

      return { character: updated, limits: result.limits };
    },
  );

  // ---- POST /characters/:id/rest/short -----------------------------------
  // Short rest (PHB p.186). Gasta hit dice para recuperar HP.
  // Body: { hitDiceToSpend: { d8: 2 }, rolls?: { d8: [5, 6] } }
  // Si rolls está, server usa esos (validados). Si no, server rollea.
  // Recupera Warlock pact slots (data.warlockSlotsUsed = 0).
  app.post('/characters/:id/rest/short', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = ShortRestBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

    // CON mod efectivo.
    const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    };
    const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
    const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
    const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
      f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
    );
    const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
    const conMod = abilityModifier(effective.con);

    // Auto-init hit dice si no existe.
    const totalsFromClasses = hitDiceTotalsByDie(classes);
    const existingHitDice = (charData['hitDice'] as Record<string, { total: number; available: number }> | undefined);
    const hitDice: Record<string, { total: number; available: number }> = {};
    for (const [die, total] of Object.entries(totalsFromClasses)) {
      hitDice[die] = existingHitDice?.[die] ?? { total, available: total };
    }

    // Validar y consumir hit dice + rollear.
    const spend = body.hitDiceToSpend ?? {};
    const providedRolls = body.rolls ?? {};
    const rollsUsed: Record<string, number[]> = {};
    let hpRecovered = 0;

    for (const [die, countToSpend] of Object.entries(spend)) {
      if (!hitDice[die]) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'HIT_DIE_NOT_AVAILABLE', die }],
        });
      }
      if (hitDice[die].available < countToSpend) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{
            code: 'NOT_ENOUGH_HIT_DICE',
            die,
            requested: countToSpend,
            available: hitDice[die].available,
          }],
        });
      }
      const faces = hitDieFaces(die);
      const provided = providedRolls[die] ?? [];
      const rollsForDie: number[] = [];
      for (let i = 0; i < countToSpend; i++) {
        let roll: number;
        if (provided[i] !== undefined) {
          if (provided[i]! < 1 || provided[i]! > faces) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{
                code: 'HIT_DIE_ROLL_OUT_OF_RANGE',
                die,
                roll: provided[i],
                min: 1,
                max: faces,
              }],
            });
          }
          roll = provided[i]!;
        } else {
          roll = rollHitDie(die);
        }
        rollsForDie.push(roll);
        hpRecovered += hitDieHpGain(roll, conMod);
      }
      hitDice[die] = { ...hitDice[die], available: hitDice[die].available - countToSpend };
      rollsUsed[die] = rollsForDie;
    }

    // Auto-init HP si falta. Si no hay max, computamos vía sheet calculator
    // (simple: bypass usando el snapshot).
    const existingHp = (charData['hp'] as { current?: number; max?: number; temp?: number } | undefined) ?? {};
    if (existingHp.max == null) {
      // Computar max desde la composición de clases. Reusamos lo del sheet:
      // L1 de primera clase = faces + con; L2+ = avg + con.
      let max = 0;
      let first = true;
      for (const c of classes) {
        const faces = hitDieFaces(c.hitDie);
        const avg = ({ d6: 4, d8: 5, d10: 6, d12: 7 } as Record<string, number>)[c.hitDie] ?? Math.floor(faces / 2) + 1;
        if (first) {
          max += faces + conMod;
          if (c.level > 1) max += (avg + conMod) * (c.level - 1);
          first = false;
        } else {
          max += (avg + conMod) * c.level;
        }
      }
      existingHp.max = Math.max(1, max);
    }
    if (existingHp.current == null) existingHp.current = existingHp.max;

    const newCurrent = Math.min(existingHp.max, existingHp.current + hpRecovered);
    const newHp = { current: newCurrent, max: existingHp.max, temp: existingHp.temp ?? 0 };

    const currentResourcesUsed =
      (charData['classResourcesUsed'] as Record<string, number> | undefined) ?? {};
    const nextData = {
      ...charData,
      hp: newHp,
      hitDice,
      warlockSlotsUsed: 0,
      classResourcesUsed: resetClassResourcesForRest(currentResourcesUsed, classes, 'short'),
    };

    // Inventory recharge — PHB p.141: items with recharge='short' regain charges
    // at the end of a short rest. Mirror the long-rest inventory block (R02-D-05).
    const shortRestInventory = (character.inventory as InventoryItem[] | null) ?? [];
    const shortRestInventoryRefs = shortRestInventory.map((it) => ({
      slug: it.itemSlug,
      source: it.itemSource,
    }));
    const shortRestWeights =
      shortRestInventoryRefs.length === 0
        ? []
        : await loadItemDataMany(shortRestInventoryRefs);
    const shortRechargeResult = rechargeInventoryItems({
      inventory: shortRestInventory,
      weights: shortRestWeights,
      trigger: 'short',
    });

    const [updated] = await db
      .update(characters)
      .set({ data: nextData, inventory: shortRechargeResult.inventory, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'rest_short',
      payload: {
        characterId: id,
        hpRecovered,
        hpBefore: existingHp.current - hpRecovered,
        hpAfter: newCurrent,
        rollsUsed,
        itemsRecharged: shortRechargeResult.recharged,
      },
    });

    return {
      character: updated,
      shortRest: {
        hpRecovered,
        rollsUsed,
        newHp,
        itemsRecharged: shortRechargeResult.recharged,
      },
    };
  });

  // ---- POST /characters/:id/rest/long ------------------------------------
  // Long rest (PHB p.186). HP full, slots full, hit dice + floor(level/2),
  // reset death saves, -1 exhaustion, reset warlock slots.
  app.post('/characters/:id/rest/long', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const longRestBody = LongRestBody.parse(request.body ?? {});
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};

    // PHB p.186 — "A character must have at least 1 hit point at the start of
    // the rest to gain its benefits." Gate runs after 404/403 to avoid leaking
    // existence info to non-owners (R02-D-06).
    const currentHp =
      (charData['hp'] as { current?: number; max?: number; temp?: number } | undefined)?.current ?? null;
    const eligibility = validateLongRestEligibility(currentHp);
    if (!eligibility.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: eligibility.issues });
    }

    // REST-03 (#826): 24h cooldown gate. PHB p.186 — "A character must finish a
    // long rest at least once every 24 hours". Server-clock approximation per
    // proposal #738 D-03. Gate runs BEFORE any state mutation so a reject
    // preserves class-resource state (REQ-RC-COOLDOWN-GATE scenario).
    const lastLongRestAt = charData['lastLongRestAt'] as string | undefined;
    if (lastLongRestAt) {
      const elapsedMs = Date.now() - new Date(lastLongRestAt).getTime();
      if (elapsedMs < LONG_REST_COOLDOWN_MS) {
        const remainingMs = LONG_REST_COOLDOWN_MS - elapsedMs;
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [
            {
              code: 'LONG_REST_TOO_SOON',
              expected: new Date(Date.now() + remainingMs).toISOString(),
              got: new Date().toISOString(),
            },
          ],
        });
      }
    }

    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

    // CON mod para auto-init de HP si falta.
    const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    };
    const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
    const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
    const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
      f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
    );
    const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
    const conMod = abilityModifier(effective.con);

    // HP max auto-init si falta.
    let max = (charData['hp'] as { max?: number } | undefined)?.max;
    if (max == null) {
      let m = 0;
      let first = true;
      for (const c of classes) {
        const faces = hitDieFaces(c.hitDie);
        const avg = ({ d6: 4, d8: 5, d10: 6, d12: 7 } as Record<string, number>)[c.hitDie] ?? Math.floor(faces / 2) + 1;
        if (first) {
          m += faces + conMod;
          if (c.level > 1) m += (avg + conMod) * (c.level - 1);
          first = false;
        } else {
          m += (avg + conMod) * c.level;
        }
      }
      max = Math.max(1, m);
    }

    // Hit dice: PHB p.186 — recuperás floor(totalLevel/2) mín 1. RAW: el
    // player elige cuáles recuperar. REST-04 (#826) permite enviar
    // `hitDiceRecoveryChoice` para distribuir explícitamente; cuando ausente,
    // fallback al greedy "más gastados primero".
    const totalLevel = classes.reduce((acc, c) => acc + c.level, 0);
    const totalsFromClasses = hitDiceTotalsByDie(classes);
    const existingHitDice = (charData['hitDice'] as Record<string, { total: number; available: number }> | undefined);
    const hitDice: Record<string, { total: number; available: number }> = {};
    for (const [die, total] of Object.entries(totalsFromClasses)) {
      hitDice[die] = existingHitDice?.[die] ?? { total, available: total };
    }

    const recoverCount = hitDiceRecoveredOnLongRest(totalLevel);

    if (longRestBody.hitDiceRecoveryChoice && Object.keys(longRestBody.hitDiceRecoveryChoice).length > 0) {
      // REST-04: player-driven distribution. Validate via domain helper.
      const spentByFace: Partial<Record<HitDieFace, number>> = {};
      for (const [face, state] of Object.entries(hitDice) as Array<[HitDieFace, typeof hitDice[string]]>) {
        spentByFace[face] = state.total - state.available;
      }
      const choiceResult = chooseHitDiceRecovery(
        spentByFace,
        recoverCount,
        longRestBody.hitDiceRecoveryChoice,
      );
      if (!choiceResult.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: choiceResult.issues });
      }
      for (const [face, n] of Object.entries(choiceResult.distribution)) {
        const state = hitDice[face];
        if (state && typeof n === 'number') {
          hitDice[face] = { ...state, available: state.available + n };
        }
      }
    } else {
      // Greedy fallback (pre-REST-04 behavior): primero a los más gastados.
      let remaining = recoverCount;
      const dice = Object.entries(hitDice).sort((a, b) => {
        const spentA = a[1].total - a[1].available;
        const spentB = b[1].total - b[1].available;
        return spentB - spentA;
      });
      for (const [die, state] of dice) {
        if (remaining === 0) break;
        const canRecover = Math.min(remaining, state.total - state.available);
        hitDice[die] = { ...state, available: state.available + canRecover };
        remaining -= canRecover;
      }
    }

    // Death saves reset.
    const deathSaves = { successes: 0, failures: 0 };

    // Exhaustion -1 (mínimo 0).
    const exhaustion = Math.max(0, ((charData['exhaustion'] as number | undefined) ?? 0) - 1);

    const newHp = { current: max, max, temp: 0 };

    // Inventory recharge — PHB p.141: items con recharge='long' o 'dawn' vuelven
    // al máximo en un long rest. trigger='long' incluye 'dawn' por R-04 DOC deferral
    // (dawn items son long-rest-equivalent hasta que se implemente el campaign clock).
    const existingInventory = (character.inventory as InventoryItem[] | null) ?? [];
    const inventoryRefs = existingInventory.map((it) => ({
      slug: it.itemSlug,
      source: it.itemSource,
    }));
    const inventoryWeights =
      inventoryRefs.length === 0 ? [] : await loadItemDataMany(inventoryRefs);
    const rechargeResult = rechargeInventoryItems({
      inventory: existingInventory,
      weights: inventoryWeights,
      trigger: 'long',
    });

    const currentResourcesUsedLong =
      (charData['classResourcesUsed'] as Record<string, number> | undefined) ?? {};
    const nextData = {
      ...charData,
      hp: newHp,
      hitDice,
      deathSaves,
      exhaustion,
      // Spell slots y pact magic full → trackeamos uso a 0.
      spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      warlockSlotsUsed: 0,
      // R-07: clear all class resources on long rest (PHB p.186).
      classResourcesUsed: resetClassResourcesForRest(currentResourcesUsedLong, classes, 'long'),
      // REST-03 (#826): persist server-clock timestamp for 24h cooldown gate.
      lastLongRestAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(characters)
      .set({ data: nextData, inventory: rechargeResult.inventory, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: 'rest_long',
      payload: {
        characterId: id,
        hpAfter: newHp.current,
        hpMax: newHp.max,
        hitDiceRecovered: recoverCount,
        exhaustionAfter: exhaustion,
        itemsRecharged: rechargeResult.recharged,
      },
    });

    return {
      character: updated,
      longRest: {
        hitDiceRecovered: recoverCount,
        deathSavesReset: true,
        exhaustionAfter: exhaustion,
        newHp,
        itemsRecharged: rechargeResult.recharged,
      },
    };
  });

  // ---- POST /characters/:id/spell-slots/use --------------------------------
  // Consume one spell slot of the given level and type (SP-05).
  // PHB p.201 — "you expend a spell slot to cast a spell of that level or higher."
  // Mirrors the /rest/short pattern: auth → 404 → 403 → domain → persist → 200.
  app.post('/characters/:id/spell-slots/use', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = ConsumeSlotBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

    // Compute max slots from class composition.
    const slotResult = computeSpellSlots(classes);

    // Current usage (read-path tolerance: absent for pre-SP-05 characters).
    const currentSlotsUsed = (charData['spellSlotsUsed'] as number[] | undefined) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const currentPactUsed = (charData['warlockSlotsUsed'] as number | undefined) ?? 0;

    const consumeResult = consumeSpellSlot({
      slotsMax: slotResult.slots,
      slotsUsed: currentSlotsUsed,
      pactMagic: slotResult.pactMagic,
      pactSlotsUsed: currentPactUsed,
      level: body.level,
      slotType: body.slotType,
      ...(body.count !== undefined ? { count: body.count } : {}),
    });

    if (!consumeResult.ok) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: consumeResult.issues });
    }

    // Persist updated counts — only touch the changed field per slotType.
    const nextData: Record<string, unknown> = { ...charData };
    if (body.slotType === 'pact') {
      nextData['warlockSlotsUsed'] = consumeResult.pactSlotsUsed;
    } else {
      nextData['spellSlotsUsed'] = [...consumeResult.slotsUsed];
    }

    await db
      .update(characters)
      .set({ data: nextData, updatedAt: new Date() })
      .where(eq(characters.id, id));

    return {
      spellSlotsUsed: nextData['spellSlotsUsed'] ?? currentSlotsUsed,
      warlockSlotsUsed: nextData['warlockSlotsUsed'] ?? currentPactUsed,
    };
  });

  // ---- POST /characters/:id/resources/use ---------------------------------
  // Consume `amount` (default 1) of a class resource. Closes REQ-RAC-CONSUME
  // from sdd/rules-audit-class-features/spec (#814).
  app.post('/characters/:id/resources/use', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = ResourceMutationBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const def = classResourceBySlug(body.slug);
    if (!def) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_FAILED', issues: [{ code: 'RESOURCE_NOT_FOUND', slug: body.slug }] });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
    const owningClass = classes.find((c) => c.slug === def.classSlug);
    const max = owningClass != null ? def.maxFor(owningClass.level) : null;
    if (max == null) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_FAILED', issues: [{ code: 'RESOURCE_NOT_FOUND', slug: body.slug }] });
    }

    const current =
      (charData['classResourcesUsed'] as Record<string, number> | undefined) ?? {};
    const usedBefore = current[body.slug] ?? 0;
    const amount = body.amount ?? 1;
    if (usedBefore + amount > max) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'RESOURCE_OVER_LIMIT', slug: body.slug, used: usedBefore, max, requested: amount }],
      });
    }

    const nextUsed: Record<string, number> = { ...current, [body.slug]: usedBefore + amount };
    const nextData = { ...charData, classResourcesUsed: nextUsed };

    await db
      .update(characters)
      .set({ data: nextData, updatedAt: new Date() })
      .where(eq(characters.id, id));

    return { classResourcesUsed: nextUsed };
  });

  // ---- POST /characters/:id/resources/restore -----------------------------
  // Decrement `used` by `amount` (default 1) for a class resource; floors at 0.
  // Separate from /use so the verbs stay clean ("Usar" vs "Restaurar").
  app.post('/characters/:id/resources/restore', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = ResourceMutationBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
    }

    const def = classResourceBySlug(body.slug);
    if (!def) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_FAILED', issues: [{ code: 'RESOURCE_NOT_FOUND', slug: body.slug }] });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const current =
      (charData['classResourcesUsed'] as Record<string, number> | undefined) ?? {};
    const usedBefore = current[body.slug] ?? 0;
    const amount = body.amount ?? 1;
    const nextUsedValue = Math.max(0, usedBefore - amount);

    const nextUsed: Record<string, number> = { ...current, [body.slug]: nextUsedValue };
    const nextData = { ...charData, classResourcesUsed: nextUsed };

    await db
      .update(characters)
      .set({ data: nextData, updatedAt: new Date() })
      .where(eq(characters.id, id));

    return { classResourcesUsed: nextUsed };
  });

  // ---- POST /characters/:id/hp ---------------------------------------------
  // Aplica un delta a los HP del personaje. Positivo cura (cap en max),
  // negativo daña. El daño consume temp HP primero (PHB p.198). Clampea a
  // [0, max] — no maneja death saves automáticamente (eso lo decide el DM
  // cambiando status='dead' via PATCH cuando corresponda).
  //
  // Solo el owner puede modificar su HP. El DM puede comunicar el daño y el
  // jugador lo aplica — patrón natural de mesa.
  app.post('/characters/:id/hp', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = ParamsWithId.parse(request.params);
    const body = HpDeltaBody.parse(request.body);
    const userId = request.user!.sub;

    const character = await loadCharacter(id);
    if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

    const access = await getCharacterAccess(character, userId);
    if (access !== 'owner') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede modificar HP' });
    }

    const charData = (character.data as Record<string, unknown> | null) ?? {};
    const existingHp = (charData['hp'] as { current?: number; max?: number; temp?: number } | undefined) ?? {};

    if (existingHp.max === undefined || existingHp.current === undefined) {
      return reply.code(400).send({
        error: 'VALIDATION_FAILED',
        issues: [{ code: 'HP_NOT_INITIALIZED', note: 'El personaje no tiene HP max definido — corré /rest/long primero' }],
      });
    }

    let current = existingHp.current;
    let temp = existingHp.temp ?? 0;
    let tempAbsorbed = 0;
    let actualDamage = 0;
    let actualHeal = 0;

    if (body.delta < 0) {
      const dmg = Math.abs(body.delta);
      if (temp >= dmg) {
        temp -= dmg;
        tempAbsorbed = dmg;
      } else {
        tempAbsorbed = temp;
        const remaining = dmg - temp;
        temp = 0;
        actualDamage = Math.min(current, remaining);
        current = Math.max(0, current - remaining);
      }
    } else if (body.delta > 0) {
      const before = current;
      current = Math.min(existingHp.max, current + body.delta);
      actualHeal = current - before;
    }

    const newHp = { current, max: existingHp.max, temp };
    const nextData = { ...charData, hp: newHp };

    const [updated] = await db
      .update(characters)
      .set({ data: nextData, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();

    await recordSessionEventForCharacter({
      characterId: id,
      actorUserId: userId,
      eventType: body.delta < 0 ? 'hp_damage' : 'hp_heal',
      payload: {
        characterId: id,
        delta: body.delta,
        actualDamage,
        actualHeal,
        tempAbsorbed,
        before: { current: existingHp.current, temp: existingHp.temp ?? 0 },
        after: newHp,
        note: body.note ?? null,
      },
    });

    return {
      character: updated,
      hp: {
        before: { current: existingHp.current, temp: existingHp.temp ?? 0 },
        after: newHp,
        delta: body.delta,
        actualDamage,
        actualHeal,
        tempAbsorbed,
      },
    };
  });

  // ---- POST /characters/:id/classes/:classSlug/level-up -------------------
  // Sube un nivel en una clase específica. Atomic: valida XP, calcula HP delta,
  // exige subclass si unlock, exige ASI/feat a 4/8/12/16/19, exige 2 Wizard
  // free spells si es Wizard L2+.
  app.post(
    '/characters/:id/classes/:classSlug/level-up',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, classSlug } = ClassSpellsParams.parse(request.params);
      const body = LevelUpBody.parse(request.body);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const campaign = await loadWorldById(character.worldId);
      if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

      const charData = (character.data as Record<string, unknown> | null) ?? {};
      const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];
      const classIdx = classes.findIndex((c) => c.slug === classSlug);
      if (classIdx === -1) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CLASS_NOT_ON_CHARACTER', classSlug }],
        });
      }
      const currentClass = classes[classIdx]!;

      const currentTotalLevel = classes.reduce((acc, c) => acc + c.level, 0);
      const newTotalLevel = currentTotalLevel + 1;
      const newClassLevel = currentClass.level + 1;

      if (newTotalLevel > 20) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'MAX_LEVEL_REACHED', totalLevel: currentTotalLevel }],
        });
      }

      // XP gate.
      const xpCheck = canReachLevel(character.xp, newTotalLevel);
      if (xpCheck) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'INSUFFICIENT_XP', ...xpCheck, targetLevel: newTotalLevel }],
        });
      }

      // CON mod efectivo para el HP delta.
      const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
        str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      };
      const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
      const levelUpAsis = (charData['levelUpAsis'] as AppliedAsi[] | undefined) ?? [];
      const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
        f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
      );
      const effective = computeEffectiveScores(baseStats, [...racialAsis, ...levelUpAsis, ...featAsis]);
      const conMod = abilityModifier(effective.con);

      // HP delta.
      let hpRoll: number | undefined = body.hpRoll;
      if (body.hpMethod === 'roll' && hpRoll === undefined) {
        // Server rollea si el cliente no mandó.
        hpRoll = rollHitDie(currentClass.hitDie);
      }
      const hpResult = hpDeltaForLevelUp({
        hitDie: currentClass.hitDie,
        conMod,
        method: body.hpMethod as HpMethod,
        roll: hpRoll ?? null,
      });
      if (!hpResult.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: hpResult.issues });
      }

      // Subclass unlock — necesitamos la classData del compendio.
      const { classData, subclassData } = await loadClassAndSubclass({
        classSlug: currentClass.slug,
        classSource: currentClass.source,
        subclassSlug: body.subclass?.slug ?? null,
        subclassSource: body.subclass?.source ?? null,
      });
      if (!classData) {
        return reply.code(500).send({ error: 'CLASS_DATA_MISSING' });
      }
      const unlockLevel = computeSubclassUnlockLevel(classData) ?? 3;
      const wasSubclassUnlocked = currentClass.level >= unlockLevel;
      const isNowSubclassUnlocked = newClassLevel >= unlockLevel;
      let newSubclass: { slug: string; source: string } | null = currentClass.subclass;
      if (!wasSubclassUnlocked && isNowSubclassUnlocked) {
        // Recién desbloqueada — exigimos selección.
        if (!body.subclass) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'SUBCLASS_REQUIRED', classSlug, unlockLevel }],
          });
        }
        if (!subclassData) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'SUBCLASS_NOT_FOUND', subclass: body.subclass }],
          });
        }
        newSubclass = { slug: subclassData.slug, source: subclassData.source };
      }

      // ASI levels — derived per-class from classFeatures[] (domain SoT, PHB §3).
      // Fighter (PHB p.72): 4/6/8/12/14/16/19. Rogue (PHB p.96): 4/8/10/12/16/19.
      // All other PHB classes: 4/8/12/16/19 (standard cadence, fallback default).
      const ASI_LEVELS = new Set(deriveAsiLevels(classData.classFeatures));
      const isAsiLevel = ASI_LEVELS.has(newClassLevel);
      let asiToApply: AppliedAsi[] = [];
      let featToApply: AppliedFeat | null = null;
      if (isAsiLevel) {
        if (!body.asi && !body.feat) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'ASI_OR_FEAT_REQUIRED', classSlug, level: newClassLevel }],
          });
        }
        if (body.asi) {
          // Validar: total de bonus <= 2, ningún ability +>2.
          const total = body.asi.choices.reduce((acc, c) => acc + c.bonus, 0);
          if (total !== 2) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'ASI_TOTAL_MUST_BE_2', got: total }],
            });
          }
          // Cada ability resultante no puede pasar 20 (cap RAW).
          for (const choice of body.asi.choices) {
            if (choice.bonus < 1 || choice.bonus > 2) {
              return reply.code(400).send({
                error: 'VALIDATION_FAILED',
                issues: [{ code: 'ASI_BONUS_INVALID', choice }],
              });
            }
            const projectedScore = effective[choice.ability] + choice.bonus;
            if (projectedScore > 20) {
              return reply.code(400).send({
                error: 'VALIDATION_FAILED',
                issues: [{
                  code: 'ASI_WOULD_EXCEED_CAP',
                  ability: choice.ability,
                  current: effective[choice.ability],
                  bonus: choice.bonus,
                  cap: 20,
                }],
              });
            }
          }
          asiToApply = body.asi.choices.map((c) => ({
            ability: c.ability,
            bonus: c.bonus,
            source: 'levelup' as const,
          }));
        } else if (body.feat) {
          if (!campaign.rulesProfile.variantRules.feats) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'FEATS_DISABLED' }],
            });
          }
          const featData = await loadFeatData({ slug: body.feat.slug, source: body.feat.source });
          if (!featData) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'FEAT_NOT_FOUND', feat: body.feat }],
            });
          }
          // Reusar el validador de feats existente.
          const existingFeats = (charData['feats'] as AppliedFeat[] | undefined) ?? [];
          const armorProfs = classes.flatMap((c) => c.armorProficiencies);
          const weaponProfs = classes.flatMap((c) => c.weaponProficiencies);
          const hasSpellcasting = classes.some((c) => classGrantsSpellcasting(c.slug));
          const raceField = charData['race'] as { slug: string; source: string } | null | undefined;
          const featResult = validateFeatSelection({
            featData,
            rulesProfile: campaign.rulesProfile,
            ctx: {
              effectiveScores: effective,
              race: raceField ? { slug: raceField.slug } : null,
              armorProficiencies: armorProfs,
              weaponProficiencies: weaponProfs,
              hasSpellcasting,
              existingFeats: existingFeats.map((f) => ({ slug: f.slug, source: f.source })),
            },
            ...(body.feat.asiChoice !== undefined ? { asiChoice: body.feat.asiChoice } : {}),
          });
          if (!featResult.ok) {
            return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: featResult.issues });
          }
          featToApply = featResult.appliedFeat;
        }
      } else if (body.asi || body.feat) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'ASI_OR_FEAT_NOT_ALLOWED_AT_THIS_LEVEL', level: newClassLevel }],
        });
      }

      // Wizard free spells: 2 spells del nivel max accesible, agregados al spellbook.
      // Aplica a nivel up de Wizard (L2 en adelante).
      let wizardFreeAdded: Array<{ slug: string; source: string }> = [];
      if (currentClass.slug === 'wizard' && newClassLevel >= 2) {
        if (!body.wizardFreeSpells || body.wizardFreeSpells.length !== 2) {
          return reply.code(400).send({
            error: 'VALIDATION_FAILED',
            issues: [{ code: 'WIZARD_FREE_SPELLS_REQUIRED', expected: 2 }],
          });
        }
        const wizardSpells = await loadClassSpells({
          classSlug: 'wizard',
          rulesProfile: campaign.rulesProfile,
        });
        const allSpells = (charData['spells'] as Record<string, AppliedClassSpells> | undefined) ?? {};
        const currentKnown = allSpells['wizard']?.known ?? [];
        const knownKeys = new Set(currentKnown.map((s) => `${s.slug}|${s.source}`));
        for (const fs of body.wizardFreeSpells) {
          const found = wizardSpells.find((s) => s.slug === fs.slug && s.source === fs.source);
          if (!found) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'SPELL_NOT_IN_CLASS_LIST', spell: fs, classSlug: 'wizard' }],
            });
          }
          if (found.level === 0) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'WIZARD_FREE_SPELL_MUST_NOT_BE_CANTRIP', spell: fs }],
            });
          }
          if (knownKeys.has(`${fs.slug}|${fs.source}`)) {
            return reply.code(400).send({
              error: 'VALIDATION_FAILED',
              issues: [{ code: 'SPELL_ALREADY_IN_SPELLBOOK', spell: fs }],
            });
          }
          knownKeys.add(`${fs.slug}|${fs.source}`);
        }
        wizardFreeAdded = body.wizardFreeSpells;
      }

      // ---- Persist atomic --------------------------------------------------
      const updatedClasses = [...classes];
      updatedClasses[classIdx] = { ...currentClass, level: newClassLevel, subclass: newSubclass };

      const existingHp = (charData['hp'] as { current?: number; max?: number; temp?: number } | undefined) ?? {};
      const newMax = (existingHp.max ?? 0) + hpResult.delta;
      const newCurrent = (existingHp.current ?? existingHp.max ?? 0) + hpResult.delta;
      const newHp = { current: newCurrent, max: newMax, temp: existingHp.temp ?? 0 };

      const newLevelUpAsis = [...levelUpAsis, ...asiToApply];
      const newFeats = featToApply
        ? [...((charData['feats'] as AppliedFeat[] | undefined) ?? []), featToApply]
        : (charData['feats'] as AppliedFeat[] | undefined);

      const allSpells = (charData['spells'] as Record<string, AppliedClassSpells> | undefined) ?? {};
      const newSpells = wizardFreeAdded.length > 0
        ? {
            ...allSpells,
            wizard: {
              cantrips: allSpells['wizard']?.cantrips ?? [],
              known: [...(allSpells['wizard']?.known ?? []), ...wizardFreeAdded],
              prepared: allSpells['wizard']?.prepared ?? [],
            },
          }
        : allSpells;

      const nextData: Record<string, unknown> = {
        ...charData,
        classes: updatedClasses,
        levelUpAsis: newLevelUpAsis,
        hp: newHp,
        ...(newFeats !== undefined ? { feats: newFeats } : {}),
        ...(wizardFreeAdded.length > 0 ? { spells: newSpells } : {}),
      };

      const [updated] = await db
        .update(characters)
        .set({ data: nextData, updatedAt: new Date() })
        .where(eq(characters.id, id))
        .returning();

      await recordSessionEventForCharacter({
        characterId: id,
        actorUserId: userId,
        eventType: 'level_up',
        payload: {
          characterId: id,
          classSlug,
          newClassLevel,
          newTotalLevel,
          hpDelta: hpResult.delta,
          subclassSelected: newSubclass !== currentClass.subclass ? newSubclass : null,
          asiApplied: asiToApply.length > 0 ? asiToApply : null,
          featApplied: featToApply ? { slug: featToApply.slug, source: featToApply.source } : null,
        },
      });

      return {
        character: updated,
        levelUp: {
          classSlug,
          newClassLevel,
          newTotalLevel,
          hpDelta: hpResult.delta,
          hpMethod: hpResult.method,
          hpRollUsed: hpResult.rollUsed,
          subclassSelected: newSubclass !== currentClass.subclass ? newSubclass : null,
          asiApplied: asiToApply.length > 0 ? asiToApply : null,
          featApplied: featToApply ? { slug: featToApply.slug, source: featToApply.source } : null,
          wizardFreeSpellsAdded: wizardFreeAdded.length > 0 ? wizardFreeAdded : null,
        },
      };
    },
  );

  // ---- PUT /characters/:id/classes/:classSlug/features --------------------
  // Setea las picks de class features (fighting styles, eldritch invocations,
  // battle master maneuvers, etc.) para UNA clase del personaje.
  //
  // Body: `{ picks: { [featureType]: [{slug, source}] } }`.
  // El validador computa los slots a este nivel (class + subclass) y verifica:
  //   - Cantidad por featureType.
  //   - Cada feature existe + está habilitada por el Rules Profile.
  //   - El featureType del pick coincide con el que se reclama.
  app.put(
    '/characters/:id/classes/:classSlug/features',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, classSlug } = ClassSpellsParams.parse(request.params);
      const body = ClassFeaturesBody.parse(request.body);
      const userId = request.user!.sub;

      const character = await loadCharacter(id);
      if (!character) return reply.code(404).send({ error: 'NOT_FOUND' });

      const access = await getCharacterAccess(character, userId);
      if (access !== 'owner') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo el dueño puede editar' });
      }

      const campaign = await loadWorldById(character.worldId);
      if (!campaign) return reply.code(500).send({ error: 'CAMPAIGN_MISSING' });

      const charData = (character.data as Record<string, unknown> | null) ?? {};
      const charClasses = (charData['classes'] as AppliedClass[] | undefined) ?? [];
      const appliedClass = charClasses.find((c) => c.slug === classSlug);
      if (!appliedClass) {
        return reply.code(400).send({
          error: 'VALIDATION_FAILED',
          issues: [{ code: 'CLASS_NOT_ON_CHARACTER', classSlug }],
        });
      }

      const progression = await loadFeatureProgression({
        classSlug: appliedClass.slug,
        classSource: appliedClass.source,
        subclassSlug: appliedClass.subclass?.slug ?? null,
        subclassSource: appliedClass.subclass?.source ?? null,
      });
      if (!progression) {
        return reply.code(500).send({ error: 'CLASS_DATA_MISSING' });
      }

      const slots = resolveFeatureSlots({
        classData: progression.classData,
        subclassData: progression.subclassData,
        classLevel: appliedClass.level,
      });

      // Universo de features permitidas: filtrar por todos los featureTypes
      // que aparecen en los slots — agarra exactamente lo relevante.
      const allFeatureTypes = Array.from(new Set(slots.flatMap((s) => s.featureType)));
      const available = await loadOptionalFeatures({
        rulesProfile: campaign.rulesProfile,
        featureTypes: allFeatureTypes,
      });

      const result = validateClassFeaturePicks({
        picks: body.picks as FeaturePicks,
        slots,
        available,
        classSlug: appliedClass.slug,
        classLevel: appliedClass.level,
      });
      if (!result.ok) {
        return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: result.issues });
      }

      const existing = (charData['classFeatures'] as Record<string, FeaturePicks> | undefined) ?? {};
      const nextClassFeatures = { ...existing, [classSlug]: result.applied };

      const [updated] = await db
        .update(characters)
        .set({
          data: { ...charData, classFeatures: nextClassFeatures },
          updatedAt: new Date(),
        })
        .where(eq(characters.id, id))
        .returning();

      return { character: updated, slots, applied: result.applied };
    },
  );
};

/**
 * Arma el contexto de inventario (STR efectivo + profs combinadas de todas las
 * clases) a partir del estado persistido en character.data.
 *
 * STR efectivo = baseStats.str + sumatoria de ASIs (race + feats). Si todavía
 * no se setearon stats, asumimos 10 (mod 0) para que las warnings de carga
 * sean conservadoras hasta que el builder complete.
 */
async function buildInventoryContext(character: typeof characters.$inferSelect): Promise<{
  strScore: number;
  armorProficiencies: string[];
  weaponProficiencies: string[];
}> {
  const charData = (character.data as Record<string, unknown> | null) ?? {};
  const baseStats = (charData['baseStats'] as AbilityScores | undefined) ?? {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  const racialAsis = (charData['asisApplied'] as AppliedAsi[] | undefined) ?? [];
  const featAsis = ((charData['feats'] as AppliedFeat[] | undefined) ?? []).flatMap((f) =>
    f.asisApplied.map((a) => ({ ability: a.ability, bonus: a.bonus, source: 'feat' as const })),
  );
  const effective = computeEffectiveScores(baseStats, [...racialAsis, ...featAsis]);
  const classes = (charData['classes'] as AppliedClass[] | undefined) ?? [];

  return {
    strScore: effective.str,
    armorProficiencies: classes.flatMap((c) => c.armorProficiencies),
    weaponProficiencies: classes.flatMap((c) => c.weaponProficiencies),
  };
}
