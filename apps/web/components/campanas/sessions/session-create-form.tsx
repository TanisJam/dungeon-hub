'use client';

// SessionCreateForm — DM-only create-session form, rendered inside V3Sheet.
// REQ-DPPMB-CREATE-02: all fields from POST /sessions Zod schema.
// REQ-DPPMB-CREATE-03: client-side levelMin ≤ levelMax validation.
// REQ-DPPMB-CREATE-04: pinned submit button; mobile-first.
// REQ-DPPMB-CREATE-05: calls onDone on success (V3Sheet close + revalidation handled by caller).
// REQ-DPPMB-CREATE-06: surfaces 403 FORBIDDEN error inline.

import { useState } from 'react';
import { createSession } from '@/app/campanas/[id]/sessions/actions';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

interface SessionCreateFormProps {
  campaignId: string;
  onDone: () => void;
}

export function SessionCreateForm({ campaignId, onDone }: SessionCreateFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dmNotes, setDmNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [locationHexId, setLocationHexId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client validation: title required
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }

    // Client validation: levelMin ≤ levelMax (REQ-DPPMB-CREATE-03 / SCENARIO CREATE-B)
    const min = levelMin !== '' ? Number(levelMin) : undefined;
    const max = levelMax !== '' ? Number(levelMax) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      setError('El nivel mínimo no puede ser mayor al máximo.');
      return;
    }

    // The datetime-local input yields "YYYY-MM-DDTHH:mm" (local, no tz), but the
    // API expects a full ISO 8601 datetime (Zod .datetime()). Convert before send.
    let scheduledAtIso: string | undefined;
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        setError('La fecha y hora no es válida.');
        return;
      }
      scheduledAtIso = parsed.toISOString();
    }

    setSubmitting(true);

    const body = {
      campaignId,
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(dmNotes.trim() ? { dmNotes: dmNotes.trim() } : {}),
      ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
      ...(min !== undefined ? { levelMin: min } : {}),
      ...(max !== undefined ? { levelMax: max } : {}),
      ...(maxPlayers !== '' ? { maxPlayers: Number(maxPlayers) } : {}),
      ...(locationHexId.trim() ? { locationHexId: locationHexId.trim() } : {}),
    };

    const result = await createSession(body);
    setSubmitting(false);

    if (result.ok) {
      onDone();
    } else {
      // REQ-DPPMB-CREATE-06: surface 403 with a readable message
      if (result.status === 403) {
        setError('Solo los DMs de este mundo pueden crear sesiones.');
      } else {
        setError(result.error ?? 'No se pudo crear la sesión. Intentá de nuevo.');
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormErrorAlert message={error} />

      {/* Title — required (REQ-DPPMB-CREATE-02) */}
      <div>
        <FormLabel htmlFor="session-title" required>
          Título
        </FormLabel>
        <FormInput
          id="session-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre de la sesión"
        />
      </div>

      {/* Scheduled date/time — optional */}
      <div>
        <FormLabel htmlFor="session-scheduled-at">Fecha y hora</FormLabel>
        <FormInput
          id="session-scheduled-at"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      {/* Level range — optional, cross-validated */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel htmlFor="session-level-min">Nivel mínimo</FormLabel>
          <FormInput
            id="session-level-min"
            type="number"
            value={levelMin}
            onChange={(e) => setLevelMin(e.target.value)}
            placeholder="1"
          />
        </div>
        <div>
          <FormLabel htmlFor="session-level-max">Nivel máximo</FormLabel>
          <FormInput
            id="session-level-max"
            type="number"
            value={levelMax}
            onChange={(e) => setLevelMax(e.target.value)}
            placeholder="20"
          />
        </div>
      </div>

      {/* Max players — optional */}
      <div>
        <FormLabel htmlFor="session-max-players">Máximo de jugadores</FormLabel>
        <FormInput
          id="session-max-players"
          type="number"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(e.target.value)}
          placeholder="Ej. 5"
        />
      </div>

      {/* Description — visible to all members */}
      <div>
        <FormLabel htmlFor="session-description">Descripción</FormLabel>
        <FormInput
          id="session-description"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción de la sesión…"
          rows={3}
        />
      </div>

      {/* DM Notes — private, GM-only (REQ-DPPMB-CREATE-02) */}
      <div>
        <FormLabel htmlFor="session-dm-notes">Notas del DM (privado)</FormLabel>
        <FormInput
          id="session-dm-notes"
          multiline
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          placeholder="Notas privadas del DM…"
          rows={3}
        />
      </div>

      {/* Location hex — optional */}
      <div>
        <FormLabel htmlFor="session-location-hex">ID de hex (opcional)</FormLabel>
        <FormInput
          id="session-location-hex"
          type="text"
          value={locationHexId}
          onChange={(e) => setLocationHexId(e.target.value)}
          placeholder="ID del hexágono en el mapa"
        />
      </div>

      {/* Submit — pinned via V3Sheet overflow scroll; full-width, ≥44px (REQ-DPPMB-CREATE-04) */}
      <FormSubmitButton
        pending={submitting}
        idleLabel="Crear sesión"
        pendingLabel="Creando…"
      />
    </form>
  );
}
