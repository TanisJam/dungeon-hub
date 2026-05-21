import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, ilike, sql, type SQL } from 'drizzle-orm';
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
} from '../../infra/db/schema.js';
import { loadCampaign } from '../../use-cases/campaigns/load-campaign.js';
import { profileFilterConditions } from '../../use-cases/compendium/profile-filter.js';

const CampaignQuery = z.object({ campaign: z.string().uuid() });
const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().min(1).optional(), // búsqueda por nombre
});

async function resolveProfile(request: { query: unknown }, reply: { code: (n: number) => { send: (body: unknown) => unknown } }) {
  const { campaign } = CampaignQuery.parse(request.query);
  const loaded = await loadCampaign(campaign);
  if (!loaded) {
    reply.code(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    return null;
  }
  return loaded;
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
        .orderBy(compendiumRaces.name)
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
        .orderBy(compendiumClasses.name)
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

  // ---- SPELLS --------------------------------------------------------------
  const SpellsQuery = PaginationQuery.extend({
    class: z.string().min(1).optional(),
    level: z.coerce.number().int().min(0).max(9).optional(),
    school: z.string().length(1).optional(),
  });
  app.get('/compendium/spells', { preHandler: app.authenticate }, async (request, reply) => {
    const campaign = await resolveProfile(request, reply);
    if (!campaign) return;
    const { limit, offset, q, class: classSlug, level, school } = SpellsQuery.parse(request.query);

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
        })
        .from(compendiumSpells)
        .where(conds)
        .orderBy(compendiumSpells.level, compendiumSpells.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumSpells).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
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
        })
        .from(compendiumItems)
        .where(conds)
        .orderBy(compendiumItems.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumItems).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
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
        .orderBy(compendiumFeats.name)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(compendiumFeats).where(conds),
    ]);
    return { data: rows, total: totalRow[0]?.count ?? 0, limit, offset };
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
};
