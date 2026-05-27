import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import type { SheetResponse } from '@/lib/sheet-types';
import { AppShell } from '@/components/layout/app-shell';
import { LevelUpFlow } from './_flow';
import { computeSubclassUnlockLevel } from '@dungeon-hub/domain/character/class';
import {
  spellsKnownFor,
  cantripsKnownFor,
  wizardSpellbookSize,
  SPELLCASTING_ABILITY,
  computeSpellLimits,
  type SpellLimitsView,
} from '@dungeon-hub/domain/character/spellcasting';
import type { FlowCtx } from './_step-graph';
import type { SubclassRow } from '@/app/characters/[id]/wizard/class/_picker';

// PHB ASI cadences for the 12 base classes (MVP L1–L14 cap).
// Fighter extra ASIs at 6; Rogue extra at 10.
// All others: 4, 8, 12.
// Source: PHB 2014 per-class tables.
const ASI_LEVELS: Record<string, number[]> = {
  fighter:   [4, 6, 8, 12, 14],
  rogue:     [4, 8, 10, 12],
  barbarian: [4, 8, 12],
  bard:      [4, 8, 12],
  cleric:    [4, 8, 12],
  druid:     [4, 8, 12],
  monk:      [4, 8, 12],
  paladin:   [4, 8, 12],
  ranger:    [4, 8, 12],
  sorcerer:  [4, 8, 12],
  warlock:   [4, 8, 12],
  wizard:    [4, 8, 12],
};

/**
 * PHB 2014 subclass unlock levels per class.
 * Used to determine if the next level needs a subclass step.
 * Source: REQ-CLU-SUB-UNLOCK-LEVELS.
 *
 * Avoids fetching class compendium data per owned class just for the unlock level.
 * computeSubclassUnlockLevel (domain) reads from classFeatures dynamically;
 * this static table matches those values for the 12 PHB classes.
 */
const SUBCLASS_UNLOCK: Record<string, number> = {
  cleric:    1,  // PHB p.58 — Divine Domain at L1
  sorcerer:  1,  // PHB p.99 — Sorcerous Origin at L1
  warlock:   1,  // PHB p.105 — Otherworldly Patron at L1
  wizard:    2,  // PHB p.114 — Arcane Tradition at L2
  druid:     2,  // PHB p.66 — Druid Circle at L2
  barbarian: 3,  // PHB p.49 — Primal Path at L3
  bard:      3,  // PHB p.54 — Bard College at L3
  fighter:   3,  // PHB p.72 — Martial Archetype at L3
  monk:      3,  // PHB p.79 — Monastic Tradition at L3
  paladin:   3,  // PHB p.85 — Sacred Oath at L3
  ranger:    3,  // PHB p.91 — Ranger Archetype at L3
  rogue:     3,  // PHB p.97 — Roguish Archetype at L3
};

/** Map of hit die by class slug (PHB 2014). */
const HIT_DIE: Record<string, string> = {
  barbarian: 'd12', fighter: 'd10', paladin: 'd10', ranger: 'd10',
  bard: 'd8', cleric: 'd8', druid: 'd8', monk: 'd8', rogue: 'd8', warlock: 'd8',
  sorcerer: 'd6', wizard: 'd6',
};

type WorldCallerRole = 'gm' | 'player' | null;
type WorldDetailLite = { callerRole: WorldCallerRole; rulesProfile?: { variantRules?: { multiclassing?: boolean } } };

type Props = { params: Promise<{ id: string }> };

export default async function LevelUpPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  let data: SheetResponse;
  try {
    data = await api.get<SheetResponse>(`/characters/${id}/sheet`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <AppShell title="Subir nivel">
        <p className="py-10 text-center text-sm text-ink-mute">Error al cargar el personaje.</p>
      </AppShell>
    );
  }

  const { character, sheet } = data;

  // Only active characters can level up.
  if (character.status !== 'active') {
    redirect(`/characters/${id}`);
  }

  // Fetch world detail for rulesProfile.
  let multiclassingEnabled = true;
  try {
    const world = await api.get<WorldDetailLite>(
      `/worlds/${character.worldId}`,
      session.access_token,
    );
    if (world.rulesProfile?.variantRules?.multiclassing === false) {
      multiclassingEnabled = false;
    }
  } catch {
    // best-effort; default true
  }

  // Build owned-class list and FlowCtx.
  const worldId = character.worldId as string;

  // Build spell delta per owned class (server-side, no extra API call — uses domain tables).
  const spellDeltaByClass: FlowCtx['spellDeltaByClass'] = {};
  for (const cls of sheet.identity.classes) {
    const fromC = { slug: cls.slug, source: 'PHB', level: cls.level, subclass: cls.subclass };
    const toC = { slug: cls.slug, source: 'PHB', level: cls.level + 1, subclass: cls.subclass };

    let cantripsDelta = 0;
    let spellsDelta = 0;
    let isWizardSpellbook = false;

    if (cls.slug === 'wizard') {
      const wFrom = wizardSpellbookSize(fromC.level);
      const wTo = wizardSpellbookSize(toC.level);
      spellsDelta = wTo - wFrom;
      isWizardSpellbook = true;
      cantripsDelta = Math.max(0, (cantripsKnownFor(toC) ?? 0) - (cantripsKnownFor(fromC) ?? 0));
    } else if (SPELLCASTING_ABILITY[cls.slug]) {
      const fromCantrips = cantripsKnownFor(fromC) ?? 0;
      const toCantrips = cantripsKnownFor(toC) ?? 0;
      cantripsDelta = Math.max(0, toCantrips - fromCantrips);

      const fromKnown = spellsKnownFor(fromC) ?? null;
      const toKnown = spellsKnownFor(toC) ?? null;
      if (toKnown !== null) {
        spellsDelta = Math.max(0, toKnown - (fromKnown ?? 0));
      }
    }

    spellDeltaByClass[cls.slug] = { cantripsDelta, spellsDelta, isWizardSpellbook };
  }

  // Build ctx maps.
  const subclassUnlockLevelByClass: FlowCtx['subclassUnlockLevelByClass'] = {};
  const alreadyHasSubclassByClass: FlowCtx['alreadyHasSubclassByClass'] = {};
  const isAsiLevelByClass: FlowCtx['isAsiLevelByClass'] = {};
  const hitDieByClass: FlowCtx['hitDieByClass'] = {};
  const toLevelByClass: FlowCtx['toLevelByClass'] = {};

  for (const cls of sheet.identity.classes) {
    const nextLevel = cls.level + 1;
    const asiLevels = ASI_LEVELS[cls.slug] ?? [4, 8, 12];
    const unlockLevel = SUBCLASS_UNLOCK[cls.slug] ?? 3;

    subclassUnlockLevelByClass[cls.slug] = unlockLevel;
    alreadyHasSubclassByClass[cls.slug] = cls.subclass !== null;
    isAsiLevelByClass[cls.slug] = asiLevels.includes(nextLevel);
    hitDieByClass[cls.slug] = HIT_DIE[cls.slug] ?? 'd8';
    toLevelByClass[cls.slug] = nextLevel;
  }

  const flowCtx: FlowCtx = {
    subclassUnlockLevelByClass,
    alreadyHasSubclassByClass,
    spellDeltaByClass,
    isAsiLevelByClass,
    hitDieByClass,
    toLevelByClass,
  };

  // Compute spell limits at NEXT level per caster class (for the spells step).
  // Uses sheet.abilityScores which has modifiers pre-computed by the API.
  const spellLimitsByClass: Record<string, SpellLimitsView> = {};
  for (const cls of sheet.identity.classes) {
    const ability = SPELLCASTING_ABILITY[cls.slug];
    if (!ability) continue; // non-caster

    const toLevel = cls.level + 1;
    // Build minimal AppliedClass-compatible object (computeSpellLimits only uses slug + level)
    const mockAppliedClass = {
      slug: cls.slug,
      source: 'PHB',
      level: toLevel,
      subclass: cls.subclass,
      hitDie: HIT_DIE[cls.slug] ?? 'd8',
      savingThrows: [] as string[],
      armorProficiencies: [] as string[],
      weaponProficiencies: [] as string[],
      toolProficiencies: [] as string[],
      skillChoices: [] as string[],
    };

    // abilityScores[ability].modifier from the sheet
    const abilityMod = sheet.abilityScores[ability]?.modifier ?? 0;
    spellLimitsByClass[cls.slug] = computeSpellLimits(
      mockAppliedClass as Parameters<typeof computeSpellLimits>[0],
      abilityMod,
    );
  }

  // Build existing spell picks per class for pre-seeding the spells step.
  // Maps classSlug → { cantrips, known, prepared } from the sheet's spellsByClass.
  const existingSpellsByClass: Record<string, { cantrips: Array<{ slug: string; source: string }>; known: Array<{ slug: string; source: string }>; prepared: Array<{ slug: string; source: string }> }> = {};
  for (const classSummary of sheet.spellsByClass ?? []) {
    existingSpellsByClass[classSummary.classSlug] = {
      cantrips: classSummary.spells.cantrips.map((s) => ({ slug: s.slug, source: s.source })),
      known: classSummary.spells.leveled.map((s) => ({ slug: s.slug, source: s.source })),
      prepared: [],
    };
  }

  // Build owned-class list with isAsiLevel flag (for backward compat with existing LevelUpFlow props).
  const ownedClasses = sheet.identity.classes.map((cls) => ({
    slug: cls.slug,
    source: 'PHB' as const,
    level: cls.level,
    hitDie: HIT_DIE[cls.slug] ?? 'd8',
    isAsiLevel: isAsiLevelByClass[cls.slug] ?? false,
  }));

  // Pre-fetch subclasses for classes that COULD need the subclass step at next level.
  // Condition: same-class, nextLevel === unlockLevel, no subclass yet.
  const subclassClassSlugs = sheet.identity.classes.filter((cls) => {
    const nextLevel = cls.level + 1;
    const unlockLevel = SUBCLASS_UNLOCK[cls.slug] ?? 3;
    return nextLevel >= unlockLevel && cls.subclass === null;
  });

  const subclassesByClass: Record<string, SubclassRow[]> = {};
  if (subclassClassSlugs.length > 0) {
    try {
      await Promise.all(
        subclassClassSlugs.map(async (cls) => {
          try {
            const { data } = await api.get<{ data: SubclassRow[] }>(
              `/compendium/subclasses?world=${worldId}&class=${cls.slug}&limit=100`,
              session.access_token,
            );
            subclassesByClass[cls.slug] = data;
          } catch {
            // Best-effort — if subclass fetch fails, step renders empty list with warning
            subclassesByClass[cls.slug] = [];
          }
        }),
      );
    } catch {
      // Parallel fetch failed entirely — continue with empty map
    }
  }

  return (
    <AppShell title="Subir nivel" constructorHref={`/characters/${id}`}>
      <div className="md:mx-auto md:max-w-lg">
        <LevelUpFlow
          characterId={id}
          ownedClasses={ownedClasses}
          multiclassingEnabled={multiclassingEnabled}
          characterName={sheet.identity.name}
          flowCtx={flowCtx}
          subclassesByClass={subclassesByClass}
          spellLimitsByClass={spellLimitsByClass}
          existingSpellsByClass={existingSpellsByClass}
        />
      </div>
    </AppShell>
  );
}
