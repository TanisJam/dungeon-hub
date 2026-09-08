import { ApiNetworkError } from './api';

/**
 * Maps a caught `ApiNetworkError` to a Spanish, user-facing outage message.
 * Returns `undefined` for anything else, so callers that already extract a
 * more specific message from `ApiError` (status/body-based branching) can
 * layer this in without disturbing their existing logic:
 *
 *   const msg = err instanceof ApiError
 *     ? (err.body as { message?: string } | null)?.message
 *     : networkErrorMessage(err);
 *
 * The seven page-local `handleApiError` helpers (ADR-B1: deliberately
 * duplicated per page) already inline this same distinction — this export
 * exists for the many ordinary catch sites that don't have their own
 * `handleApiError` and would otherwise leak `ApiNetworkError#message`
 * (e.g. "Request to /x timed out after 10000ms") straight to the UI.
 */
export function networkErrorMessage(err: unknown): string | undefined {
  const clause = networkErrorClause(err);
  return clause === undefined ? undefined : `${clause}. Probá de nuevo en unos segundos.`;
}

/**
 * Short, unpunctuated variant of the same distinction, for slots that are
 * interpolated mid-sentence by their caller. `networkErrorMessage` would
 * produce a doubled full stop there, and its "probá de nuevo" tail tends to
 * duplicate a retry affordance the surrounding copy already offers.
 */
export function networkErrorClause(err: unknown): string | undefined {
  if (!(err instanceof ApiNetworkError)) return undefined;
  return err.kind === 'timeout'
    ? 'El servidor tardó demasiado en responder'
    : 'No se pudo conectar con el servidor';
}

/**
 * General-purpose replacement for the common
 * `err instanceof Error ? err.message : fallback` fallback expression.
 *
 * Distinguishes `ApiNetworkError` first so a home-lab-tunnel outage reads as
 * a clear Spanish "no se pudo conectar" / "tardó demasiado" message instead
 * of the raw English `Error#message` the network layer throws internally.
 * Does NOT special-case `ApiError` — callers that branch on `err.status` or
 * `err.body` keep doing that themselves; this only covers what happens once
 * those checks fall through.
 */
export function getErrorMessage(err: unknown, fallback = 'Error desconocido'): string {
  return networkErrorMessage(err) ?? (err instanceof Error ? err.message : fallback);
}
