'use client';

/**
 * DomainContentIsland — client wrapper for compendium domain content examples.
 *
 * All 6 compendium categories: Spell, Monster, Item, Race, Class, Background.
 * Sample data comes directly from existing test fixtures (no live API needed).
 *
 * Spell uses SpellHeader + CompendiumEntriesWithTerms (mockMode) directly —
 * SpellDetailBody does not expose mockMode, so we inline the same composition
 * pattern rather than patching the production component.
 */

import { SpellHeader } from '@/app/compendium/_components/spell-header';
import { MonsterStatblockHeader } from '@/app/compendium/[category]/_components/monster-statblock-header';
import { ItemHeader } from '@/app/compendium/[category]/_components/item-header';
import { RaceHeader } from '@/app/compendium/[category]/_components/race-header';
import { ClassHeader } from '@/app/compendium/[category]/_components/class-header';
import { BackgroundHeader } from '@/app/compendium/[category]/_components/background-header';
import { CompendiumEntriesWithTerms } from '@/components/compendium/term/CompendiumEntriesWithTerms';
import { createMockResolver } from '@/components/compendium/term';
import type { Entry } from '@/components/compendium/types';

// ---------------------------------------------------------------------------
// Mock resolver — no term fixtures needed for the catalog examples;
// graceful fallback handles any accidental {@ref} tags with an error message
// instead of a network call.
// ---------------------------------------------------------------------------
const MOCK_RESOLVER = createMockResolver({});

// ---------------------------------------------------------------------------
// Sample data — sourced from existing test fixtures:
//   app/compendium/_components/spell-detail-body.test.tsx       (Fireball)
//   app/compendium/[category]/__tests__/headers.test.tsx        (Longsword, Dwarf, Barbarian, Acolyte)
//   app/compendium/[category]/__tests__/monster-statblock-header.test.tsx (Goblin)
// ---------------------------------------------------------------------------

// PHB 2014 p.241 — Fireball: Level 3 Evocation, 1 action, 150 ft, V/S/M, instantaneous.
const FIREBALL = {
  slug: 'fireball',
  source: 'PHB',
  name: 'Fireball',
  level: 3,
  school: 'E',
  data: {
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 150 } },
    components: { v: true, s: true, m: 'a tiny ball of bat guano and sulfur' },
    duration: [{ type: 'instant' }],
    entries: [
      'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.',
      'Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw.',
      'A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.',
    ],
    source: 'PHB',
  },
};

// PHB MM p.166 — Goblin: CR 1/4, Small humanoid (goblinoid), AC 15, HP 7 (2d6).
const GOBLIN = {
  id: 'abc123',
  slug: 'goblin',
  source: 'MM',
  name: 'Goblin',
  cr: '1/4',
  crNumeric: '0.25',
  type: 'humanoid',
  size: 'S',
  data: {
    name: 'Goblin',
    source: 'MM',
    size: ['S'],
    type: { type: 'humanoid', tags: ['goblinoid'] },
    alignment: ['N', 'E'],
    ac: [{ ac: 15, from: ['{@item leather armor|phb}', '{@item shield|phb}'] }],
    hp: { average: 7, formula: '2d6' },
    speed: { walk: 30 },
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    skill: { stealth: '+6' },
    senses: ['darkvision 60 ft.'],
    passive: 9,
    languages: ['Common', 'Goblin'],
    cr: '1/4',
    trait: [
      {
        name: 'Nimble Escape',
        entries: ['The goblin can take the Disengage or Hide action as a bonus action on each of its turns.'],
      },
    ],
    action: [
      {
        name: 'Scimitar',
        entries: ['+4 to hit, reach 5 ft., one target. 5 (1d6 + 2) slashing damage.'],
      },
      {
        name: 'Shortbow',
        entries: ['+4 to hit, range 80/320 ft., one target. 5 (1d6 + 2) piercing damage.'],
      },
    ],
  },
};

// PHB 2014 p.149 — Longsword: Martial melee, 3 lb, 15 gp, Versatile.
const LONGSWORD = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: '3',
  costCp: 1500,
  reprintedAs: null,
  data: {
    rarity: 'none',
    property: ['V'],
    entries: [],
  },
};

// PHB 2014 p.20 — Dwarf: Medium, 25 ft speed, +2 CON, darkvision 60 ft.
const DWARF = {
  slug: 'dwarf',
  source: 'PHB',
  name: 'Dwarf',
  isSubrace: false,
  parentSlug: null,
  parentSource: null,
  data: {
    size: ['M'],
    speed: 25,
    ability: [{ con: 2 }],
    darkvision: 60,
    entries: [],
  },
};

// PHB 2014 p.46 — Barbarian: d12 HD, STR/CON saves, light/medium/shields/simple/martial.
const BARBARIAN = {
  slug: 'barbarian',
  source: 'PHB',
  name: 'Barbarian',
  data: {
    hd: { number: 1, faces: 12 },
    proficiency: ['str', 'con'],
    startingProficiencies: {
      armor: ['light', 'medium', 'shield'],
      weapons: ['simple', 'martial'],
      skills: [
        {
          choose: {
            from: ['animal handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
            count: 2,
          },
        },
      ],
    },
    entries: [],
  },
};

// PHB 2014 p.127 — Acolyte: Insight + Religion, 2 languages of choice, Shelter of the Faithful.
const ACOLYTE = {
  slug: 'acolyte',
  source: 'PHB',
  name: 'Acolyte',
  data: {
    skillProficiencies: [{ insight: true, religion: true }],
    languageProficiencies: [{ anyStandard: 2 }],
    entries: [
      {
        name: 'Feature: Shelter of the Faithful',
        type: 'entries',
        entries: [
          'As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity.',
        ],
        data: { isFeature: true },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Minimal 375px frame for domain content (static version — no touch probe needed
// since these are read-only content cards, not interactive components).
// ---------------------------------------------------------------------------

interface ContentFrameProps {
  label: string;
  children: React.ReactNode;
}

function ContentFrame({ label, children }: ContentFrameProps) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] text-ink-mute">{label}</div>
      <div
        className="relative overflow-x-hidden border border-line rounded-md bg-paper"
        style={{ maxWidth: '375px', minWidth: '200px' }}
      >
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain content section — renders all 6 categories
// ---------------------------------------------------------------------------

export function DomainContentIsland() {
  const spellEntries = (FIREBALL.data.entries ?? []) as Entry[];

  return (
    <div className="space-y-4">
      {/* ── Spell ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Spell — SpellHeader + body</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            SpellHeader (level stamp, school, casting time, range, components, duration) +
            CompendiumEntriesWithTerms body in mockMode (no network).
          </p>
        </div>
        <ContentFrame label="Fireball — Level 3 Evocation (PHB p.241)">
          <div>
            <SpellHeader data={FIREBALL} />
            <div className="desc mt-4">
              <CompendiumEntriesWithTerms
                entries={spellEntries}
                worldId="dev-catalog"
                accessToken="mock"
                mockMode={MOCK_RESOLVER}
              />
            </div>
          </div>
        </ContentFrame>
      </div>

      {/* ── Monster ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Monster — MonsterStatblockHeader</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            Full D&amp;D 5e stat block: meta, ability grid (grid-cols-3 @375px), traits, actions.
            The header is the complete stat block — monsters have no separate entries body.
          </p>
        </div>
        <ContentFrame label="Goblin — CR 1/4, Small humanoid (goblinoid) (MM p.166)">
          <MonsterStatblockHeader data={GOBLIN} />
        </ContentFrame>
      </div>

      {/* ── Item ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Item — ItemHeader</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            Type label, weight, cost (cp → gp/sp/cp), rarity, property codes.
          </p>
        </div>
        <ContentFrame label="Longsword — Martial melee, 15 gp, Versatile (PHB p.149)">
          <ItemHeader data={LONGSWORD} />
        </ContentFrame>
      </div>

      {/* ── Race ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Race — RaceHeader</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            Size code, speed (walk / fly / swim etc.), ability score increases, darkvision.
          </p>
        </div>
        <ContentFrame label="Dwarf — Medium, 25 ft, +2 CON, darkvision 60 ft. (PHB p.20)">
          <RaceHeader data={DWARF} />
        </ContentFrame>
      </div>

      {/* ── Class ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Class — ClassHeader</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            Hit die, saving throw proficiencies (ability abbrs), armor/weapon prof lists.
          </p>
        </div>
        <ContentFrame label="Barbarian — d12, STR/CON saves, light/medium/shields (PHB p.46)">
          <ClassHeader data={BARBARIAN} />
        </ContentFrame>
      </div>

      {/* ── Background ── */}
      <div className="space-y-2">
        <div>
          <h3 className="font-display font-semibold text-sm text-ink">Background — BackgroundHeader</h3>
          <p className="text-[10px] text-ink-mute font-mono mt-0.5">
            Skill profs, tool profs, language proficiencies, feature name
            (extracted from entries[].data.isFeature).
          </p>
        </div>
        <ContentFrame label="Acolyte — Insight + Religion, 2 languages, Shelter of the Faithful (PHB p.127)">
          <BackgroundHeader data={ACOLYTE} />
        </ContentFrame>
      </div>
    </div>
  );
}
