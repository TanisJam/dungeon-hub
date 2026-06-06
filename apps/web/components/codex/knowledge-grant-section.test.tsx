/**
 * Component test: KnowledgeGrantSection — DM "Conocimiento a otorgar"
 *
 * codex-knowledge B-3 (SDD tasks #1950, spec #1947, design #1948 §4.4):
 *   REQ-CK-UNLOCK-08: DM session-complete UI — "Conocimiento a otorgar" section.
 *   REQ-CK-UNLOCK-08: collapsible section, chip toggles per entity.
 *   REQ-CK-UNLOCK-08: onGrantsChange called with knowledgeGrants[] for CompleteForm submit.
 *   REQ-CK-UNLOCK-08: mobile-first 375px, full-width chips, thumb-operable.
 *
 * The KnowledgeGrantSection renders a list of entity chips that the DM can
 * toggle on/off. When confirmed, calls onGrantsChange with the selected
 * { characterId, kind, refKey, refSource }[] grants.
 *
 * Design intent: FORK 1 (#1944). This arc encodes NO PHB rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeGrantSection } from './knowledge-grant-section';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const PARTICIPANTS = [
  { characterId: 'char-1', name: 'Aragorn', leftAt: null },
  { characterId: 'char-2', name: 'Legolas', leftAt: null },
];

const CANDIDATE_ENTITIES = [
  { kind: 'bestiary' as const, refKey: 'goblin', refSource: 'MM', label: 'Goblin' },
  { kind: 'bestiary' as const, refKey: 'orc', refSource: 'MM', label: 'Orc' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeGrantSection (B-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-CK-UNLOCK-08: section heading "Conocimiento a otorgar" renders', () => {
    const onGrantsChange = vi.fn();
    render(
      <KnowledgeGrantSection
        participants={PARTICIPANTS}
        candidateEntities={CANDIDATE_ENTITIES}
        onGrantsChange={onGrantsChange}
      />
    );
    expect(screen.getByText(/conocimiento a otorgar/i)).toBeTruthy();
  });

  it('REQ-CK-UNLOCK-08: entity chips render for each candidate', () => {
    const onGrantsChange = vi.fn();
    render(
      <KnowledgeGrantSection
        participants={PARTICIPANTS}
        candidateEntities={CANDIDATE_ENTITIES}
        onGrantsChange={onGrantsChange}
      />
    );
    expect(screen.getByText('Goblin')).toBeTruthy();
    expect(screen.getByText('Orc')).toBeTruthy();
  });

  it('REQ-CK-UNLOCK-08: selecting a chip adds grants for all active participants', () => {
    const onGrantsChange = vi.fn();
    render(
      <KnowledgeGrantSection
        participants={PARTICIPANTS}
        candidateEntities={CANDIDATE_ENTITIES}
        onGrantsChange={onGrantsChange}
      />
    );

    // Click Goblin chip
    const goblinChip = screen.getByRole('button', { name: /goblin/i });
    fireEvent.click(goblinChip);

    expect(onGrantsChange).toHaveBeenCalledWith([
      { characterId: 'char-1', kind: 'bestiary', refKey: 'goblin', refSource: 'MM' },
      { characterId: 'char-2', kind: 'bestiary', refKey: 'goblin', refSource: 'MM' },
    ]);
  });

  it('REQ-CK-UNLOCK-08: de-selecting chip removes those grants', () => {
    const onGrantsChange = vi.fn();
    render(
      <KnowledgeGrantSection
        participants={PARTICIPANTS}
        candidateEntities={CANDIDATE_ENTITIES}
        onGrantsChange={onGrantsChange}
      />
    );

    const goblinChip = screen.getByRole('button', { name: /goblin/i });
    // Select
    fireEvent.click(goblinChip);
    // De-select
    fireEvent.click(goblinChip);

    // Last call: empty (no goblin grants)
    const calls = vi.mocked(onGrantsChange).mock.calls;
    const lastCall = calls[calls.length - 1][0] as unknown[];
    expect(lastCall).toHaveLength(0);
  });

  it('REQ-CK-UNLOCK-08: empty candidate list renders gracefully (no candidates message)', () => {
    const onGrantsChange = vi.fn();
    render(
      <KnowledgeGrantSection
        participants={PARTICIPANTS}
        candidateEntities={[]}
        onGrantsChange={onGrantsChange}
      />
    );
    // No chips, no error, section still renders heading
    expect(screen.getByText(/conocimiento a otorgar/i)).toBeTruthy();
  });
});
