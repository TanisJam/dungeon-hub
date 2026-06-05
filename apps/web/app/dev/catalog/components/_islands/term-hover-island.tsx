'use client';

/**
 * TermHoverIsland — interactive demo of the compendium term-hover system.
 *
 * The production term system (TermProvider / CompendiumEntriesWithTerms) turns
 * inline {@kind slug|source} tags into dotted-underline spans whose hover/focus
 * opens a HoverCard with the referenced entry. Production resolves the entry
 * over the API; here we pass a POPULATED `mockMode` resolver so the catalog
 * shows the real Term/TermCard hovercard with content — no network, no auth.
 *
 * Term and TermCard are intentionally NOT exported from the term package (impl
 * details of TermProvider), so the catalog exercises them through the public
 * `CompendiumEntriesWithTerms` wrapper, the same surface production uses.
 *
 * Interaction: hover (desktop) or tap (mobile) a dotted term to open its card;
 * tap outside / Esc to dismiss. An intentionally-unresolved ref shows the
 * graceful error fallback.
 */

import { CompendiumEntriesWithTerms, createMockResolver, mockKey } from '@/components/compendium/term';
import type { TermFetchResult } from '@/components/compendium/term';
import type { Entry } from '@/components/compendium/types';

// ---------------------------------------------------------------------------
// Mock fixtures — keyed by normalized refKey (kind:slug:source, lowercased).
// PHB/MM citations live in sourceCitation so the card footer shows them.
// ---------------------------------------------------------------------------

const FIXTURES: Record<string, TermFetchResult> = {
  // PHB 2014 p.292 — Prone (Appendix A: Conditions).
  [mockKey('condition', 'prone', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Prone',
      source: 'PHB',
      sourceCitation: 'PHB p.292 — Appendix A: Conditions',
      entries: [
        "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
        'The creature has disadvantage on attack rolls.',
        'An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.',
      ],
    },
  },
  // PHB 2014 p.241 — Fireball. Nested {@damage} tag renders inline inside the card.
  [mockKey('spell', 'fireball', 'PHB')]: {
    kind: 'ok',
    entry: {
      name: 'Fireball',
      source: 'PHB',
      sourceCitation: 'PHB p.241',
      entries: [
        '3rd-level evocation. Casting Time: 1 action. Range: 150 feet.',
        'Each creature in a 20-foot-radius sphere centered on a point you choose within range must make a Dexterity saving throw, taking {@damage 8d6} fire damage on a failed save, or half as much damage on a successful one.',
      ],
    },
  },
  // MM 2014 p.166 — Goblin. Nested entries node shows a trait inside the card.
  [mockKey('creature', 'goblin', 'MM')]: {
    kind: 'ok',
    entry: {
      name: 'Goblin',
      source: 'MM',
      sourceCitation: 'MM p.166',
      entries: [
        'Small humanoid (goblinoid), neutral evil. AC 15, HP 7 (2d6), Speed 30 ft. Challenge 1/4.',
        {
          type: 'entries',
          name: 'Nimble Escape',
          entries: ['The goblin can take the Disengage or Hide action as a bonus action on each of its turns.'],
        },
      ],
    },
  },
};

const MOCK_RESOLVER = createMockResolver(FIXTURES);

// ---------------------------------------------------------------------------
// Body entries — 5etools-style strings carrying inline ref tags. Each {@kind …}
// becomes a dotted-underline span the provider turns into a hovercard trigger.
// The {@spell sending} ref is intentionally absent from FIXTURES to demo the
// graceful "no preview" error state.
// ---------------------------------------------------------------------------

const ENTRIES: Entry[] = [
  'While you are {@condition prone}, your only movement is to crawl, and attackers within 5 feet strike with advantage.',
  'You hurl {@spell fireball|PHB} into the chamber — every creature caught in the blast must brace against the flames.',
  'A {@creature goblin|MM} lunges from the shadows, then vanishes again with Nimble Escape.',
  'You try to reach an ally with {@spell sending} — but that reference has no fixture, so the card shows its error fallback.',
];

// ---------------------------------------------------------------------------
// 375px frame (mobile-first). overflow-x-hidden but NOT overflow-y, so the
// hovercard can escape vertically when anchored near the bottom.
// ---------------------------------------------------------------------------

export function TermHoverIsland() {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-ink-mute font-mono">
        Hover (desktop) or tap (mobile) a dotted term to open its card. Tap outside or press Esc to
        dismiss. Resolved via a mock resolver — no API, no auth.
      </p>
      <div
        className="relative overflow-x-hidden border border-line rounded-md bg-paper"
        style={{ maxWidth: '375px', minWidth: '200px' }}
      >
        <div className="desc p-3">
          <CompendiumEntriesWithTerms
            entries={ENTRIES}
            worldId="dev-catalog"
            accessToken="mock"
            mockMode={MOCK_RESOLVER}
          />
        </div>
      </div>
    </div>
  );
}
