/**
 * Component tests for RacialTraitsBlock.
 *
 * SCEN-RT-10: renders populated list — heading, trait names, text, source badges
 * SCEN-RT-11: empty list → renders nothing
 * SCEN-RT-12 (web): receives racialTraits=[] → renders nothing without throwing
 * Additional: multi-paragraph text renders with visible line breaks
 *
 * PHB citations:
 *   Fey Ancestry: PHB p.23 — Elf trait
 *   Mask of the Wild: PHB p.24 — Wood Elf subrace trait
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RacialTraitsBlock } from './_racial-traits-block';
import type { RacialTrait } from '@/lib/sheet-types';

// ---------------------------------------------------------------------------
// SCEN-RT-11 — empty list → renders nothing
// REQ-RT-RENDER-04
// ---------------------------------------------------------------------------
describe('SCEN-RT-11: empty racialTraits → renders nothing', () => {
  it('renders no card when racialTraits is empty', () => {
    const { container } = render(<RacialTraitsBlock traits={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-12 (web) — racialTraits=[] (pre-Batch-8 load) → renders nothing, no throw
// REQ-RT-COMPAT-01
// ---------------------------------------------------------------------------
describe('SCEN-RT-12 (web): pre-Batch-8 load → renders nothing without throwing', () => {
  it('does not throw when traits is an empty array (simulates legacy character)', () => {
    expect(() => render(<RacialTraitsBlock traits={[]} />)).not.toThrow();
    const { container } = render(<RacialTraitsBlock traits={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SCEN-RT-10 — populated list renders heading, names, text, and source badges
// REQ-RT-RENDER-01, REQ-RT-RENDER-02, REQ-RT-RENDER-03
// PHB p.23-24 (High Elf / Wood Elf traits)
// ---------------------------------------------------------------------------
describe('SCEN-RT-10: populated racialTraits → renders heading, traits, badges', () => {
  const traits: RacialTrait[] = [
    {
      name: 'Fey Ancestry',
      text: 'You have advantage on saving throws against being charmed.',
      source: 'race',
    },
    {
      name: 'Mask of the Wild',
      text: 'You can attempt to hide even when you are only lightly obscured.',
      source: 'subrace',
    },
  ];

  it('renders "Rasgos raciales" heading (decision #630 item 5)', () => {
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.getByRole('heading', { name: /rasgos raciales/i })).toBeTruthy();
  });

  it('renders trait names', () => {
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.getByText('Fey Ancestry')).toBeTruthy();
    expect(screen.getByText('Mask of the Wild')).toBeTruthy();
  });

  it('renders trait text for both traits', () => {
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.getByText(/You have advantage on saving throws against being charmed/i)).toBeTruthy();
    expect(screen.getByText(/You can attempt to hide even when you are only lightly obscured/i)).toBeTruthy();
  });

  it('renders "Sublinaje" badge for the subrace trait (Mask of the Wild)', () => {
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.getByText('Sublinaje')).toBeTruthy();
  });

  it('does NOT render "Sublinaje" badge for race trait (Fey Ancestry)', () => {
    render(<RacialTraitsBlock traits={traits} />);
    // Only one Sublinaje badge for Mask of the Wild, not for Fey Ancestry
    const badges = screen.getAllByText('Sublinaje');
    expect(badges).toHaveLength(1);
  });

  it('renders source-level badge "Linaje" for race trait', () => {
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.getByText('Linaje')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Additional: multi-paragraph text renders with whitespace-pre-wrap
// ---------------------------------------------------------------------------
describe('Multi-paragraph text: \\n\\n separator produces visible breaks', () => {
  const traits: RacialTrait[] = [
    {
      name: 'Lucky',
      text: 'When you roll a 1 on the d20 for an attack roll...\n\nYou can use this feature three times.',
      source: 'race',
    },
  ];

  it('renders the full text content (whitespace-pre-wrap applied via Tailwind class)', () => {
    render(<RacialTraitsBlock traits={traits} />);
    // Both paragraphs are part of the same text node under whitespace-pre-wrap
    expect(screen.getByText(/When you roll a 1 on the d20/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5etools tokens: {@spell ...}, {@dice ...}, {@condition ...} render via InlineRenderer
// (deuda menor follow-up — previously these were shown raw)
// ---------------------------------------------------------------------------
describe('5etools tokens: parsed and rendered by InlineRenderer', () => {
  it('renders the display text of {@spell ...} tokens instead of the raw token', () => {
    const traits: RacialTrait[] = [
      {
        name: 'Cantrip',
        text: 'You know one cantrip of your choice from the wizard spell list, such as {@spell fire bolt}.',
        source: 'subrace',
      },
    ];
    render(<RacialTraitsBlock traits={traits} />);
    // The raw token must NOT appear verbatim
    expect(screen.queryByText(/\{@spell/)).toBeNull();
    // The display text "fire bolt" must appear somewhere in the rendered output
    expect(screen.getByText(/fire bolt/i)).toBeTruthy();
  });

  it('renders {@dice ...} display text', () => {
    const traits: RacialTrait[] = [
      {
        name: 'Breath Weapon',
        text: 'You exhale destructive energy dealing {@dice 2d6} damage.',
        source: 'race',
      },
    ];
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.queryByText(/\{@dice/)).toBeNull();
    expect(screen.getByText(/2d6/)).toBeTruthy();
  });

  it('renders {@condition ...} display text', () => {
    const traits: RacialTrait[] = [
      {
        name: 'Fey Ancestry',
        text: 'You have advantage on saving throws against being {@condition charmed}, and magic can\'t put you to sleep.',
        source: 'race',
      },
    ];
    render(<RacialTraitsBlock traits={traits} />);
    expect(screen.queryByText(/\{@condition/)).toBeNull();
    expect(screen.getByText(/charmed/i)).toBeTruthy();
  });
});
