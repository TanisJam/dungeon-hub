import type { Entry } from '@/components/compendium';

/**
 * Curated samples for the dev preview page. Each entry has a label (the node
 * type or scenario it demonstrates) and a raw `entries` array shaped exactly
 * like the data we'd find in `compendium_*.data.entries`.
 *
 * Hardcoded (not DB-fetched) so the preview works without auth/network and
 * isn't tied to seed data. Adding new samples here as we ship phases.
 */
export type Sample = {
  label: string;
  notes?: string;
  entries: Entry[];
};

export const SAMPLES: Sample[] = [
  {
    label: 'string + inline reference tags',
    notes: 'A bare paragraph with mixed inline macros.',
    entries: [
      'When you cast {@spell fireball|PHB|fireball}, each creature must make a {@dc 15} {@actSave Dexterity}: on a failed save it takes {@damage 8d6} fire damage, and {@condition prone} on a critical fail.',
    ],
  },
  {
    label: 'entries — nested labelled section',
    entries: [
      {
        type: 'entries',
        name: 'Darkvision',
        entries: [
          "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
        ],
      },
    ],
  },
  {
    label: 'list — bulleted items',
    entries: [
      {
        type: 'list',
        items: [
          'You have proficiency with the {@item longsword|PHB}.',
          'You can use a {@action Dash|PHB} as a bonus action.',
          'You gain {@dice 1d6} temporary hit points.',
        ],
      },
    ],
  },
  {
    label: 'item — definition-list style',
    entries: [
      {
        type: 'item',
        name: 'Action Surge',
        entries: [
          'On your turn, you can take one additional action, on top of your regular action and a possible bonus action.',
        ],
      },
    ],
  },
  {
    label: 'table — wizard progression',
    entries: [
      {
        type: 'table',
        caption: 'The Wizard',
        colLabels: ['Level', 'Proficiency Bonus', 'Features'],
        rows: [
          ['1', '+2', 'Spellcasting, Arcane Recovery'],
          ['2', '+2', 'Arcane Tradition'],
          ['3', '+2', '{@filter 2nd-level spells|spells|level=2}'],
        ],
      },
    ],
  },
  {
    label: 'section — heading h3',
    entries: [
      {
        type: 'section',
        name: 'Racial Traits',
        entries: [
          'Your character has the following racial traits.',
          { type: 'entries', name: 'Ability Score Increase', entries: ['Your {@b Strength} score increases by 2.'] },
        ],
      },
    ],
  },
  {
    label: 'inset + insetReadaloud',
    entries: [
      {
        type: 'inset',
        name: 'Optional Rule: Flanking',
        entries: ['When a creature and at least one of its allies are within 5 feet of an enemy on opposite sides...'],
      },
      {
        type: 'insetReadaloud',
        entries: ['The torchlight flickers as you step into the cold, damp chamber. A faint dripping echoes from somewhere deeper.'],
      },
    ],
  },
  {
    label: 'image — placeholder',
    entries: [
      {
        type: 'image',
        href: { type: 'internal', path: 'imgs/PHB/Dragons/Red.webp' },
        title: 'Adult Red Dragon',
      },
    ],
  },
  {
    label: 'gallery — placeholders',
    entries: [
      {
        type: 'gallery',
        images: [
          { type: 'image', href: { type: 'internal', path: 'imgs/PHB/Goblin.webp' }, title: 'Goblin' },
          { type: 'image', href: { type: 'internal', path: 'imgs/PHB/Hobgoblin.webp' }, title: 'Hobgoblin' },
          { type: 'image', href: { type: 'internal', path: 'imgs/PHB/Bugbear.webp' }, title: 'Bugbear' },
        ],
      },
    ],
  },
  {
    label: 'quote — with attribution',
    entries: [
      {
        type: 'quote',
        entries: ["Magic isn't a tool; it's a force. A river. Channel it well or it drowns you."],
        by: 'Mordenkainen',
      },
    ],
  },
  {
    label: 'mechanic tags (badges) + formatting',
    entries: [
      '{@atk mw} {@hit 5} to hit, reach 5 ft., one target. {@h} {@damage 1d8 + 3} slashing damage.',
      'You can {@b force} a {@dc 13} {@actSave Constitution} or fall {@condition unconscious} for {@dice 1d4} rounds.',
      '{@note This sidebar appears muted.} {@i Italics work too.}',
    ],
  },
  {
    label: 'unknown / fallback handling',
    entries: [
      'This contains {@futureTagXyz some display|args}, a {@thisDoesNotExist plain text} and {@b real bold}.',
      { type: 'unrecognizedNode', name: 'Stub Heading' } as Entry,
      {} as Entry,
    ],
  },
];
