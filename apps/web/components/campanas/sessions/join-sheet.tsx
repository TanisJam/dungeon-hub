'use client';

// JoinSheet — bottom-sheet character picker for joining a session.
// REQ-DPPMB-JOIN-01–08, REQ-DPPMB-CT-02.
// ADR-B4: reuses GET /characters?status=active roster, world-filtered by parent.
// Mobile-first: 375px, ≥44px tap targets, pinned confirm button.

import { useState } from 'react';
import Link from 'next/link';
import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { joinSession } from '@/app/campanas/[id]/sessions/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RosterCharacter {
  id: string;
  name: string;
  /** Composed lineage string from the API, e.g. "Elfo · Bardo (Colegio del Saber) 4" */
  lineage: string;
  worldId: string;
}

interface JoinSheetProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  campaignId: string;
  /** Active characters in this world — world-filtered by the parent before passing in. */
  characters: RosterCharacter[];
  /** Called with the characterId after a successful join — used for optimistic local state. */
  onJoined?: (characterId: string) => void;
}

// ---------------------------------------------------------------------------
// Error code → user message mapping (REQ-DPPMB-JOIN-06)
// All 400 VALIDATION_FAILED — inspect the issue code, NOT the HTTP status.
// ---------------------------------------------------------------------------

interface ApiIssue {
  code: string;
  maxPlayers?: number;
  current?: number;
}

function resolveErrorMessage(rawError: string): string {
  // The action serializes issues as JSON string when the API returns 400
  try {
    const issues = JSON.parse(rawError) as ApiIssue[];
    const first = issues[0];
    if (!first) return 'No se pudo unir a la sesión. Intentá de nuevo.';

    switch (first.code) {
      case 'CHARACTER_ALREADY_IN_LIVE_SESSION':
        return 'Este personaje ya está en otra sesión activa.';
      case 'SESSION_FULL':
        return first.maxPlayers != null
          ? `La sesión ya está completa (${first.current ?? '?'}/${first.maxPlayers} jugadores).`
          : 'La sesión ya está completa.';
      case 'SESSION_TERMINAL':
        return 'Esta sesión ya finalizó.';
      case 'CHARACTER_NOT_IN_WORLD':
      case 'CHARACTER_NOT_ELIGIBLE':
        return 'No se pudo unir a la sesión. Intentá de nuevo.';
      default:
        return 'No se pudo unir a la sesión. Intentá de nuevo.';
    }
  } catch {
    return rawError || 'No se pudo unir a la sesión. Intentá de nuevo.';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinSheet({
  open,
  onClose,
  sessionId,
  campaignId,
  characters,
  onJoined,
}: JoinSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChar = characters.find((c) => c.id === selectedId) ?? null;

  async function handleConfirm() {
    if (!selectedId) return;
    setError(null);
    setSubmitting(true);

    const result = await joinSession(sessionId, selectedId, campaignId);
    setSubmitting(false);

    if (result.ok) {
      // Notify parent with the joined characterId for optimistic local state update.
      onJoined?.(selectedId);
      onClose();
    } else {
      setError(resolveErrorMessage(result.error ?? ''));
    }
  }

  // Reset state when sheet closes so it's clean on next open.
  function handleClose() {
    setSelectedId(null);
    setError(null);
    onClose();
  }

  return (
    <V3Sheet open={open} onClose={handleClose} title="Elegí tu personaje">
      <div className="flex flex-col gap-4">
        {/* Inline error — REQ-DPPMB-JOIN-06 */}
        <FormErrorAlert message={error} />

        {characters.length === 0 ? (
          /* REQ-DPPMB-JOIN-03: empty state */
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="font-sans text-sm text-ink-mute">
              Aún no tenés un personaje activo en este mundo.
            </p>
            <Link
              href="/characters/new"
              className="font-sans text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Crear personaje
            </Link>
          </div>
        ) : (
          <>
            {/* REQ-DPPMB-JOIN-02: character list — ≥44px touch targets */}
            <ul className="flex flex-col gap-2">
              {characters.map((char) => {
                const isSelected = char.id === selectedId;
                return (
                  <li key={char.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(char.id)}
                      className={[
                        'w-full min-h-[44px] rounded-md px-3 py-3 text-left',
                        'flex flex-col gap-0.5 transition-colors',
                        'border',
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-line bg-surface-raised hover:bg-paper-soft',
                      ].join(' ')}
                    >
                      <span className="font-sans text-sm font-semibold text-ink">
                        {char.name}
                      </span>
                      <span className="font-sans text-xs text-ink-mute">{char.lineage}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* REQ-DPPMB-JOIN-04: pinned confirm button — disabled until a char is selected */}
            <Button
              tone="green"
              fullWidth
              disabled={!selectedId || submitting}
              onClick={handleConfirm}
            >
              {selectedChar
                ? `Unirme con ${selectedChar.name}`
                : 'Unirme con …'}
            </Button>
          </>
        )}
      </div>
    </V3Sheet>
  );
}
