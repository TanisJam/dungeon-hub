'use client';

/**
 * KnowledgeGrantSection — DM "Conocimiento a otorgar" collapsible section.
 *
 * codex-knowledge B-3 (SDD tasks #1950, spec #1947, design #1948 §4.4):
 *   REQ-CK-UNLOCK-08: collapsible section inside CompleteForm.
 *   Shows candidate entity chips per session encounter. DM toggles chips
 *   to select which entities to grant knowledge of to ALL active participants.
 *   Calls onGrantsChange with the current selection as knowledgeGrants[].
 *
 * Mobile-first: full-width chips, min-h-[44px] tap targets.
 * Desktop: same — section renders inline within V3Sheet form.
 *
 * Design intent: FORK 1 (#1944). This arc encodes NO PHB rule.
 */

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParticipantRef {
  characterId: string;
  name: string;
  leftAt: string | null;
}

export interface CandidateEntity {
  kind: 'bestiary' | 'item' | 'spell' | 'npc' | 'faction' | 'location' | 'lore';
  refKey: string;
  refSource: string;
  label: string;
}

export interface KnowledgeGrant {
  characterId: string;
  kind: CandidateEntity['kind'];
  refKey: string;
  refSource: string;
}

export interface KnowledgeGrantSectionProps {
  /** Active participants (leftAt IS NULL). Knowledge granted to ALL of them. */
  participants: ParticipantRef[];
  /** Candidate entities to grant (e.g. from session events or DM manual selection). */
  candidateEntities: CandidateEntity[];
  /** Called whenever the selection changes. Parent should include this in the complete body. */
  onGrantsChange: (grants: KnowledgeGrant[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGrantSection({
  participants,
  candidateEntities,
  onGrantsChange,
}: KnowledgeGrantSectionProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const activeParticipants = participants.filter((p) => p.leftAt === null);

  function toggleEntity(entity: CandidateEntity) {
    const key = `${entity.kind}|${entity.refKey}|${entity.refSource}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Build grants for all active participants × selected entities
      const selectedEntities = candidateEntities.filter((e) =>
        next.has(`${e.kind}|${e.refKey}|${e.refSource}`),
      );
      const grants: KnowledgeGrant[] = [];
      for (const e of selectedEntities) {
        for (const p of activeParticipants) {
          grants.push({ characterId: p.characterId, kind: e.kind, refKey: e.refKey, refSource: e.refSource });
        }
      }
      onGrantsChange(grants);
      return next;
    });
  }

  return (
    <section aria-label="Conocimiento a otorgar">
      <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
        Conocimiento a otorgar
      </p>

      {candidateEntities.length === 0 ? (
        <p className="text-xs text-ink-soft">Sin entidades candidatas para esta sesión.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidateEntities.map((entity) => {
            const key = `${entity.kind}|${entity.refKey}|${entity.refSource}`;
            const selected = selectedKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                role="button"
                aria-pressed={selected}
                onClick={() => toggleEntity(entity)}
                className={[
                  'min-h-[44px] rounded-md border px-3 py-2 font-sans text-sm font-medium transition-colors',
                  selected
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-paper-soft text-ink hover:bg-paper',
                ].join(' ')}
              >
                {entity.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
