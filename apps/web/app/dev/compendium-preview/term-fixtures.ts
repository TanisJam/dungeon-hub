/**
 * Mock fixtures for the Term Hover Demo section of the dev preview page.
 * Keyed by normalized refKey (`${kind}:${slug}:${source}` lowercased).
 *
 * Covers 6 kinds: spell, condition, item, creature, race, background.
 * No real API credentials required — these are entirely static.
 */
import { mockKey } from '@/components/compendium/term';
import type { TermFetchResult } from '@/components/compendium/term';
import type { Entry } from '@/components/compendium/types';

export const TERM_FIXTURES: Record<string, TermFetchResult> = {
  [mockKey('spell', 'fireball', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Fireball',
      entries: [
        'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.',
        {
          type: 'list',
          items: [
            '{@b Casting Time}: 1 action',
            '{@b Range}: 150 feet',
            '{@b Duration}: Instantaneous',
          ],
        } as Entry,
        'Each creature in a 20-foot-radius sphere centered on that point must make a {@actSave Dexterity} saving throw. A target takes {@damage 8d6} fire damage on a failed save, or half as much damage on a successful one.',
      ],
      source: 'PHB',
      sourceCitation: "Player's Handbook (2014) p. 241",
    },
  },

  [mockKey('condition', 'prone', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Prone',
      entries: [
        {
          type: 'list',
          items: [
            "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
            'The creature has disadvantage on attack rolls.',
            'An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.',
          ],
        } as Entry,
      ],
      source: 'PHB',
      sourceCitation: "Player's Handbook (2014) p. 292",
    },
  },

  [mockKey('item', 'longsword', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Longsword',
      entries: [
        {
          type: 'entries',
          name: 'Weapon Properties',
          entries: [
            '{@b Versatile}: This weapon can be used with one or two hands. Damage: {@damage 1d8} (1H) / {@damage 1d10} (2H) slashing.',
          ],
        } as Entry,
        'Weight: 3 lb. Cost: 15 gp.',
      ],
      source: 'PHB',
      sourceCitation: "Player's Handbook (2014) p. 149",
    },
  },

  [mockKey('creature', 'goblin', 'MM')]: {
    kind: 'ok',
    entry: {
      name: 'Goblin',
      entries: [
        {
          type: 'entries',
          name: 'Small Humanoid (Goblinoid)',
          entries: [
            'AC 15 (leather armor, shield) · HP 7 (2d6) · Speed 30 ft.',
            '{@b STR} 8 (−1) · {@b DEX} 14 (+2) · {@b CON} 10 (+0)',
            'Skills: Stealth +6 · Senses: Darkvision 60 ft.',
          ],
        } as Entry,
        '{@b Nimble Escape.} The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
      ],
      source: 'MM',
      sourceCitation: 'Monster Manual (2014) p. 166',
    },
  },

  [mockKey('race', 'dwarf', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Dwarf',
      entries: [
        'Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal.',
        {
          type: 'list',
          items: [
            '{@b Ability Score Increase}: Constitution +2',
            '{@b Age}: Considered young until 50, live to 350+',
            '{@b Size}: Medium (4–5 ft., 150 lb.)',
            '{@b Speed}: 25 ft. (not reduced by heavy armor)',
            '{@b Darkvision}: 60 ft.',
            '{@b Dwarven Resilience}: Advantage on saves vs. poison',
          ],
        } as Entry,
      ],
      source: 'PHB',
      sourceCitation: "Player's Handbook (2014) p. 18",
    },
  },

  [mockKey('background', 'acolyte', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Acolyte',
      entries: [
        'You have spent your life in the service of a temple, learning sacred rites and providing sacrifices to the god or gods you serve.',
        {
          type: 'list',
          items: [
            '{@b Skill Proficiencies}: Insight, Religion',
            '{@b Languages}: Two of your choice',
            '{@b Equipment}: Holy symbol, prayer book, 5 sticks of incense, vestments, common clothes, and a belt pouch containing 15 gp',
          ],
        } as Entry,
        '{@b Feature — Shelter of the Faithful}: As an acolyte, you command the respect of those who share your faith.',
      ],
      source: 'PHB',
      sourceCitation: "Player's Handbook (2014) p. 127",
    },
  },
};

/**
 * Sample entries used in the Term Hover Demo section.
 * Contains inline ref tags for all 6 fixture kinds so the dev
 * can hover each one to verify card rendering.
 */
export const TERM_DEMO_ENTRIES: Entry[] = [
  'The wizard hurls a {@spell fireball|PHB}, engulfing the {@creature goblin|MM} in flames.',
  'A {@race Dwarf|PHB} stands tall, though he drops {@condition prone|PHB} after the blast.',
  'He tightens his grip on his {@item longsword|PHB} and begins his new life as an {@background Acolyte|PHB}.',
];
