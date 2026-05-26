import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, ilike, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../infra/db/client.js';
import {
  compendiumRaces,
  compendiumClasses,
  compendiumSubclasses,
  compendiumBackgrounds,
  compendiumSpells,
  compendiumItems,
  compendiumFeats,
  compendiumOptionalFeatures,
  compendiumMonsters,
  compendiumConditions,
  compendiumLanguages,
  compendiumActions,
} from '../../infra/db/schema.js';
import { loadCampaign, loadWorldById } from '../../use-cases/campaigns/load-campaign.js';
import { profileFilterConditions } from '../../use-cases/compendium/profile-filter.js';
import { extractCostCp } from '../../use-cases/characters/load-item-data.js';

const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().min(1).optional(), // búsqueda por nombre
});

// Compendium endpoints scope results by `RulesProfile`. The caller MUST provide
// EXACTLY ONE of `?campaign=<uuid>` or `?world=<uuid>` — both or neither yield 400.
// Both code paths resolve to the same RulesProfile (campaign joins to world).
const ScopeQuery = z.object({
  campaign: z.string().uuid().optional(),
  world: z.string().uuid().optional(),
});

async function resolveProfile(
  request: { query: unknown },
  reply: {
    code: (n: number) => { send: (body: unknown) => unknown };
  },
) {
  const parsed = ScopeQuery.safeParse(request.query);
  if (!parsed.success) {
    reply.code(400).send({ error: 'VALIDATION_FAILED', issues: parsed.error.issues });
    return null;
  }
  const { campaign, world } = parsed.data;
  if ((campaign && world) || (!campaign && !world)) {
    reply.code(400).send({
      error: 'VALIDATION_FAILED',
      issues: [
        {
          code: 'SCOPE_PARAM_REQUIRED',
          message: 'Provide exactly one of ?campaign=<uuid> or ?world=<uuid>.',
        },
      ],
    });
    return null;
  }

  if (world) {
    const loaded = await loadWorldById(world);
    if (!loaded) {
      reply.code(404).send({ error: 'WORLD_NOT_FOUND' });
      return null;
    }
    // Return a shape compatible with `LoadedCampaign` consumers — only
    // `rulesProfile` is read downstream.
    return { rulesProfile: loaded.rulesProfile };
  }

  // campaign branch (campaign is defined here by the XOR check above)
  const loaded = await loadCampaign(campaign!);
  if (!loaded) {
    reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    return null;
  }
  return loaded;
}

/**
 * Cuando un slug existe en varios sources (ej. `elf` en PHB, LFL, ...), priorizamos
 * los oficiales para que el detail endpoint sin ?source= devuelva siempre el "core".
 * Aplicar como ORDER BY en queries por slug sin source explícito.
 */
function sourcePriorityOrder(sourceCol: PgColumn): SQL {
  return sql`CASE ${sourceCol}
    WHEN 'XPHB' THEN 0
    WHEN 'PHB' THEN 1
    WHEN 'XDMG' THEN 2
    WHEN 'DMG' THEN 3
    WHEN 'XMM' THEN 4
    WHEN 'MM' THEN 5
    WHEN 'TCE' THEN 6
    WHEN 'XGE' THEN 7
    ELSE 99
  END`;
}

/**
 * Boostea matches "starts-with" sobre "substring" para que el autocomplete devuelva
 * resultados intuitivos. Si q="ring" → "Ring of Protection" (boost 0) antes que
 * "Bag of Devouring" (boost 1).
 *
 * Solo aplica si hay query. Caller debe `if (q) orderBy.push(nameStartsWithBoost(...))`.
 */
function nameStartsWithBoost(nameCol: PgColumn, q: string): SQL {
  return sql`CASE WHEN ${nameCol} ILIKE ${q + '%'} THEN 0 ELSE 1 END`;
}

export const compendiumRoute: FastifyPluginAsync = async (app) => {
  // ---- RACES ---------------------------------------------------------------
  app.get('/compendium/races', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;

    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'races',
      slugCol: compendiumRaces.slug,
      sourceCol: compendiumRaces.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumRaces.name, `%${q}%`));

    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumRaces.id,
          slug: compendiumRaces.slug,
          source: compendiumRaces.source,
          name: compendiumRaces.name,
          isSubrace: compendiumRaces.isSubrace,
          parentSlug: compendiumRaces.parentSlug,
          parentSource: compendiumRaces.parentSource,
        })
        .from(compendiumRaces)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumRaces.name, q)] : []),
          sourcePriorityOrder(compendiumRaces.source),
          compendiumRaces.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumRaces).where(conds),
    ]);

    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/races/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumRaces)
      .where(
        and(
          eq(compendiumRaces.slug, slug),
          source ? eq(compendiumRaces.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumRaces.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- CLASSES -------------------------------------------------------------
  app.get('/compendium/classes', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'classes',
      slugCol: compendiumClasses.slug,
      sourceCol: compendiumClasses.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumClasses.name, `%${q}%`));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumClasses.id,
          slug: compendiumClasses.slug,
          source: compendiumClasses.source,
          name: compendiumClasses.name,
        })
        .from(compendiumClasses)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumClasses.name, q)] : []),
          sourcePriorityOrder(compendiumClasses.source),
          compendiumClasses.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumClasses).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/classes/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumClasses)
      .where(
        and(
          eq(compendiumClasses.slug, slug),
          source ? eq(compendiumClasses.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumClasses.source))
      .limit(1);
    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- SUBCLASSES ----------------------------------------------------------
  // ?class=wizard requerido para acotar.
  app.get('/compendium/subclasses', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);
    const { class: classSlug } = z
      .object({ class: z.string().min(1) })
      .parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'subclasses',
      slugCol: compendiumSubclasses.slug,
      sourceCol: compendiumSubclasses.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter, eq(compendiumSubclasses.classSlug, classSlug)];
    if (q) where.push(ilike(compendiumSubclasses.name, `%${q}%`));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumSubclasses.id,
          slug: compendiumSubclasses.slug,
          source: compendiumSubclasses.source,
          name: compendiumSubclasses.name,
          classSlug: compendiumSubclasses.classSlug,
          classSource: compendiumSubclasses.classSource,
        })
        .from(compendiumSubclasses)
        .where(conds)
        .orderBy(compendiumSubclasses.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumSubclasses).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  // ---- BACKGROUNDS ---------------------------------------------------------
  app.get('/compendium/backgrounds', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'backgrounds',
      slugCol: compendiumBackgrounds.slug,
      sourceCol: compendiumBackgrounds.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumBackgrounds.name, `%${q}%`));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumBackgrounds.id,
          slug: compendiumBackgrounds.slug,
          source: compendiumBackgrounds.source,
          name: compendiumBackgrounds.name,
        })
        .from(compendiumBackgrounds)
        .where(conds)
        .orderBy(compendiumBackgrounds.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumBackgrounds).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/backgrounds/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumBackgrounds)
      .where(
        and(
          eq(compendiumBackgrounds.slug, slug),
          source ? eq(compendiumBackgrounds.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumBackgrounds.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- SPELLS --------------------------------------------------------------
  const SpellsQuery = PaginationQuery.extend({
    class: z.string().min(1).optional(),
    level: z.coerce.number().int().min(0).max(9).optional(),
    school: z.string().length(1).optional(),
    ritual: z
      .string()
      .transform((v) => v === 'true')
      .optional(),
    concentration: z
      .string()
      .transform((v) => v === 'true')
      .optional(),
  });
  app.get('/compendium/spells', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const {
      limit,
      offset,
      q,
      class: classSlug,
      level,
      school,
      ritual,
      concentration,
    } = SpellsQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'spells',
      slugCol: compendiumSpells.slug,
      sourceCol: compendiumSpells.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumSpells.name, `%${q}%`));
    if (level !== undefined) where.push(eq(compendiumSpells.level, level));
    if (school) where.push(eq(compendiumSpells.school, school));
    if (classSlug)
      where.push(sql`${classSlug} = ANY(${compendiumSpells.classes})`);
    if (ritual !== undefined) where.push(eq(compendiumSpells.ritual, ritual));
    if (concentration !== undefined)
      where.push(eq(compendiumSpells.concentration, concentration));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumSpells.id,
          slug: compendiumSpells.slug,
          source: compendiumSpells.source,
          name: compendiumSpells.name,
          level: compendiumSpells.level,
          school: compendiumSpells.school,
          classes: compendiumSpells.classes,
          subclassGrants: compendiumSpells.subclassGrants,
          ritual: compendiumSpells.ritual,
          concentration: compendiumSpells.concentration,
          componentsM: compendiumSpells.componentsM,
          componentsMCost: compendiumSpells.componentsMCost,
        })
        .from(compendiumSpells)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumSpells.name, q)] : []),
          compendiumSpells.level,
          sourcePriorityOrder(compendiumSpells.source),
          compendiumSpells.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumSpells).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/spells/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumSpells)
      .where(
        and(
          eq(compendiumSpells.slug, slug),
          source ? eq(compendiumSpells.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumSpells.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- ITEMS ---------------------------------------------------------------
  const ItemsQuery = PaginationQuery.extend({
    type: z.string().min(1).optional(),
  });
  app.get('/compendium/items', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, type } = ItemsQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'items',
      slugCol: compendiumItems.slug,
      sourceCol: compendiumItems.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumItems.name, `%${q}%`));
    if (type) where.push(eq(compendiumItems.type, type));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumItems.id,
          slug: compendiumItems.slug,
          source: compendiumItems.source,
          name: compendiumItems.name,
          type: compendiumItems.type,
          weight: compendiumItems.weight,
          data: compendiumItems.data,
        })
        .from(compendiumItems)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumItems.name, q)] : []),
          sourcePriorityOrder(compendiumItems.source),
          compendiumItems.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumItems).where(conds),
    ]);
    // REQ-CIP-COST-PROJECTION: project costCp from data.value, omit raw data from response.
    const data = rows.map(({ data: rowData, ...rest }) => ({
      ...rest,
      costCp: extractCostCp(rowData),
    }));
    return { data, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/items/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumItems)
      .where(
        and(
          eq(compendiumItems.slug, slug),
          source ? eq(compendiumItems.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumItems.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    // REQ-CIP-COST-PROJECTION: project costCp from data.value; strip raw data JSONB.
    const { data: rawData, ...rest } = rows[0]!;
    return { ...rest, costCp: extractCostCp(rawData) };
  });

  // ---- FEATS ---------------------------------------------------------------
  app.get('/compendium/feats', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'feats',
      slugCol: compendiumFeats.slug,
      sourceCol: compendiumFeats.source,
    });
    if (!filter) return { data: [], total: 0 };

    const where: SQL[] = [filter];
    if (q) where.push(ilike(compendiumFeats.name, `%${q}%`));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumFeats.id,
          slug: compendiumFeats.slug,
          source: compendiumFeats.source,
          name: compendiumFeats.name,
          prerequisites: compendiumFeats.prerequisites,
        })
        .from(compendiumFeats)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumFeats.name, q)] : []),
          sourcePriorityOrder(compendiumFeats.source),
          compendiumFeats.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumFeats).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/feats/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumFeats)
      .where(
        and(
          eq(compendiumFeats.slug, slug),
          source ? eq(compendiumFeats.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumFeats.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- MONSTERS ------------------------------------------------------------
  // Query params:
  //   - q: search por nombre (substring)
  //   - cr: rango de CR. Acepta "5" (exacto), "5-10" (rango inclusive), "<=2"
  //     o ">=10". CR fraccionales se aceptan: "1/4", "1/2-1".
  //   - type: filtra por type primario (dragon, fiend, beast, etc.)
  //   - size: filtra por size code (T/S/M/L/H/G)
  const MonstersQuery = PaginationQuery.extend({
    cr: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    size: z.string().min(1).max(2).optional(),
  });

  /** Parsea "1/4" → 0.25, "5" → 5, "1/2-1" → [0.5, 1], etc. */
  function parseCrToken(token: string): number | null {
    const t = token.trim();
    if (t === '') return null;
    if (t.includes('/')) {
      const [num, den] = t.split('/').map(Number);
      if (!Number.isFinite(num!) || !Number.isFinite(den!) || den === 0) return null;
      return num! / den!;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function buildCrFilter(raw: string): SQL | null {
    if (raw.startsWith('<=')) {
      const n = parseCrToken(raw.slice(2));
      if (n === null) return null;
      return sql`${compendiumMonsters.crNumeric} <= ${n}`;
    }
    if (raw.startsWith('>=')) {
      const n = parseCrToken(raw.slice(2));
      if (n === null) return null;
      return sql`${compendiumMonsters.crNumeric} >= ${n}`;
    }
    if (raw.includes('-')) {
      const [lo, hi] = raw.split('-').map(parseCrToken);
      if (lo === null || hi === null) return null;
      return sql`${compendiumMonsters.crNumeric} BETWEEN ${lo} AND ${hi}`;
    }
    const n = parseCrToken(raw);
    if (n === null) return null;
    return sql`${compendiumMonsters.crNumeric} = ${n}`;
  }

  app.get('/compendium/monsters', { preHandler: app.authenticate }, async (request, reply) => {
    // Monsters NO se filtran por rules profile: son contenido del DM, no de PC.
    // El DM agarra de cualquier bestiario sin que afecte las reglas de construcción
    // de personajes. Duplicados entre ediciones (MM vs XMM) se distinguen por source
    // en el label del autocomplete.
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, cr, type, size } = MonstersQuery.parse(request.query);

    const where: SQL[] = [];
    if (q) where.push(ilike(compendiumMonsters.name, `%${q}%`));
    if (type) where.push(eq(compendiumMonsters.type, type.toLowerCase()));
    if (size) where.push(eq(compendiumMonsters.size, size.toUpperCase()));
    if (cr) {
      const crCond = buildCrFilter(cr);
      if (crCond) where.push(crCond);
    }
    const conds = where.length > 0 ? and(...where) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumMonsters.id,
          slug: compendiumMonsters.slug,
          source: compendiumMonsters.source,
          name: compendiumMonsters.name,
          cr: compendiumMonsters.cr,
          crNumeric: compendiumMonsters.crNumeric,
          type: compendiumMonsters.type,
          size: compendiumMonsters.size,
        })
        .from(compendiumMonsters)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumMonsters.name, q)] : []),
          compendiumMonsters.crNumeric,
          sourcePriorityOrder(compendiumMonsters.source),
          compendiumMonsters.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumMonsters).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/monsters/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumMonsters)
      .where(
        and(
          eq(compendiumMonsters.slug, slug),
          source ? eq(compendiumMonsters.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumMonsters.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- OPTIONAL FEATURES ---------------------------------------------------
  // Tasha's OCF + invocations + fighting styles + maneuvers + arcane shots, etc.
  //
  // Filtros aplicados:
  //   - Source habilitada en Rules Profile.
  //   - slug|source no en disabledEntities.optionalFeatures.
  //   - Source TCE solo si variantRules.tashasOptionalClassFeatures = true.
  //
  // Query params:
  //   - featureType: filtra por tag (FS:F, MV:B, EI, etc.).
  //   - class: filtra por clase consumidora — útil para "qué fighting styles
  //     puedo elegir como Fighter L1". Acepta el slug de clase (ej. "fighter"),
  //     y matchea contra el sufijo del featureType (FS:F → fighter, FS:R → ranger).
  const OptFeatsQuery = PaginationQuery.extend({
    featureType: z.string().min(1).optional(),
    class: z.string().min(1).optional(),
  });
  app.get('/compendium/optional-features', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, featureType, class: classSlug } = OptFeatsQuery.parse(request.query);

    const baseFilter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'optionalFeatures',
      slugCol: compendiumOptionalFeatures.slug,
      sourceCol: compendiumOptionalFeatures.source,
    });
    if (!baseFilter) return { data: [], total: 0 };

    const where: SQL[] = [baseFilter];

    // TCE gate: si el toggle está OFF, excluir TODOS los entries TCE.
    if (!campaign.rulesProfile.variantRules.tashasOptionalClassFeatures) {
      where.push(sql`${compendiumOptionalFeatures.source} != 'TCE'`);
    }

    if (q) where.push(ilike(compendiumOptionalFeatures.name, `%${q}%`));
    if (featureType) {
      where.push(sql`${featureType} = ANY(${compendiumOptionalFeatures.featureType})`);
    }
    if (classSlug) {
      // Convención: el sufijo del featureType ":X" se mapea al slug de clase con
      // la inicial. Ej: fighter → FS:F. No es trivial generalizar, por ahora
      // matcheamos via texto:
      //   fighter → FS:F, MV:B (BM), AS:AA (Arcane Archer)
      //   ranger  → FS:R, HP:R (hunter prey)
      //   warlock → EI, PB
      const tagsByClass: Record<string, string[]> = {
        fighter: ['FS:F', 'MV:B', 'AS:AA'],
        ranger: ['FS:R', 'HP:R', 'DT:R'],
        paladin: ['FS:P'],
        warlock: ['EI', 'PB'],
        rogue: [],
        artificer: ['IWM:A'],
        cleric: [],
        bard: ['BJK'],
        monk: [],
        druid: [],
        sorcerer: [],
        wizard: [],
      };
      const tags = tagsByClass[classSlug] ?? [];
      if (tags.length === 0) return { data: [], total: 0 };
      const tagsLiteral = sql.join(tags.map((t) => sql`${t}`), sql`, `);
      where.push(sql`${compendiumOptionalFeatures.featureType} && ARRAY[${tagsLiteral}]::text[]`);
    }

    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumOptionalFeatures.id,
          slug: compendiumOptionalFeatures.slug,
          source: compendiumOptionalFeatures.source,
          name: compendiumOptionalFeatures.name,
          featureType: compendiumOptionalFeatures.featureType,
        })
        .from(compendiumOptionalFeatures)
        .where(conds)
        .orderBy(compendiumOptionalFeatures.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumOptionalFeatures).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  // ---- CONDITIONS ----------------------------------------------------------
  // Conditions + statuses (Blinded, Concentration, etc.). Reference data — NOT
  // filtered by Rules Profile (same rationale as monsters: a PC who is blinded
  // is blinded regardless of which sourcebooks the campaign uses). XPHB rows
  // are excluded at import time.
  const ConditionsQuery = PaginationQuery.extend({
    kind: z.enum(['condition', 'status']).optional(),
  });

  app.get('/compendium/conditions', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, kind } = ConditionsQuery.parse(request.query);

    const where: SQL[] = [];
    if (q) where.push(ilike(compendiumConditions.name, `%${q}%`));
    if (kind) where.push(eq(compendiumConditions.kind, kind));
    const conds = where.length > 0 ? and(...where) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumConditions.id,
          slug: compendiumConditions.slug,
          source: compendiumConditions.source,
          name: compendiumConditions.name,
          kind: compendiumConditions.kind,
        })
        .from(compendiumConditions)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumConditions.name, q)] : []),
          sourcePriorityOrder(compendiumConditions.source),
          compendiumConditions.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumConditions).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/conditions/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumConditions)
      .where(
        and(
          eq(compendiumConditions.slug, slug),
          source ? eq(compendiumConditions.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumConditions.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- LANGUAGES -----------------------------------------------------------
  // Reference dictionary — not Rules-Profile filtered. 5etools `languages.json`
  // covers PHB + many setting books; XPHB/XDMG/XMM/UA are excluded at import.
  const LanguagesQuery = PaginationQuery.extend({
    type: z.enum(['standard', 'exotic', 'secret']).optional(),
  });

  app.get('/compendium/languages', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, type } = LanguagesQuery.parse(request.query);

    const where: SQL[] = [];
    if (q) where.push(ilike(compendiumLanguages.name, `%${q}%`));
    if (type) where.push(eq(compendiumLanguages.type, type));
    const conds = where.length > 0 ? and(...where) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumLanguages.id,
          slug: compendiumLanguages.slug,
          source: compendiumLanguages.source,
          name: compendiumLanguages.name,
          type: compendiumLanguages.type,
          script: compendiumLanguages.script,
        })
        .from(compendiumLanguages)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumLanguages.name, q)] : []),
          sourcePriorityOrder(compendiumLanguages.source),
          compendiumLanguages.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumLanguages).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/languages/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumLanguages)
      .where(
        and(
          eq(compendiumLanguages.slug, slug),
          source ? eq(compendiumLanguages.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumLanguages.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- ACTIONS -------------------------------------------------------------
  // Reference dictionary of core actions (Attack, Dash, Hide, Two-Weapon
  // Fighting, etc.). Not Rules-Profile filtered. XPHB rows are excluded at
  // import time; remaining sources are PHB / DMG / XGE.
  app.get('/compendium/actions', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const where: SQL[] = [];
    if (q) where.push(ilike(compendiumActions.name, `%${q}%`));
    const conds = where.length > 0 ? and(...where) : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumActions.id,
          slug: compendiumActions.slug,
          source: compendiumActions.source,
          name: compendiumActions.name,
        })
        .from(compendiumActions)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumActions.name, q)] : []),
          sourcePriorityOrder(compendiumActions.source),
          compendiumActions.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumActions).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/actions/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumActions)
      .where(
        and(
          eq(compendiumActions.slug, slug),
          source ? eq(compendiumActions.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumActions.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });

  // ---- TOOLS ---------------------------------------------------------------
  // Slice of /compendium/items where item type ∈ {T, AT, GS, INS}: tools,
  // artisan tools, gaming sets, instruments. Same envelope shape as /items —
  // uses Rules Profile filter (items kind) since tools are player-facing
  // proficiency picks.
  const TOOL_TYPE_FILTER = sql`${compendiumItems.type} IN ('T', 'AT', 'GS', 'INS')`;

  app.get('/compendium/tools', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q } = PaginationQuery.parse(request.query);

    const filter = profileFilterConditions({
      profile: campaign.rulesProfile,
      kind: 'items',
      slugCol: compendiumItems.slug,
      sourceCol: compendiumItems.source,
    });
    if (!filter) return { data: [], total: 0, limit, offset };

    const where: SQL[] = [filter, TOOL_TYPE_FILTER];
    if (q) where.push(ilike(compendiumItems.name, `%${q}%`));
    const conds = and(...where)!;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: compendiumItems.id,
          slug: compendiumItems.slug,
          source: compendiumItems.source,
          name: compendiumItems.name,
          type: compendiumItems.type,
          weight: compendiumItems.weight,
        })
        .from(compendiumItems)
        .where(conds)
        .orderBy(
          ...(q ? [nameStartsWithBoost(compendiumItems.name, q)] : []),
          sourcePriorityOrder(compendiumItems.source),
          compendiumItems.name,
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumItems).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });

  app.get('/compendium/tools/:slug', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const source = z.object({ source: z.string().optional() }).parse(request.query).source;

    const rows = await db
      .select()
      .from(compendiumItems)
      .where(
        and(
          eq(compendiumItems.slug, slug),
          TOOL_TYPE_FILTER,
          source ? eq(compendiumItems.source, source) : undefined,
        ),
      )
      .orderBy(sourcePriorityOrder(compendiumItems.source))
      .limit(1);

    if (rows.length === 0) return reply.code(404).send({ error: 'NOT_FOUND' });
    return rows[0];
  });
};
