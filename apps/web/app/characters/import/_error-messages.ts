/**
 * Spanish, user-facing error copy for the character-import flow
 * (POST /characters/import — see apps/api/src/http/routes/characters.ts).
 *
 * `describeEnvelopeIssues` is shared between two call sites that both carry
 * the exact same `ImportEnvelopeIssue[]` shape:
 *   - the client-side pre-check (`validateImportEnvelope` called directly in
 *     `_form.tsx` before the file is sent — a courtesy, never the gate);
 *   - the server's `400 VALIDATION_FAILED` response, which runs the very
 *     same pure domain function and can therefore reject a file the client
 *     check missed (e.g. an older client, a hand-edited file).
 * One mapping keeps both paths saying the same thing.
 */
import { ApiError } from '@/lib/api';
import { networkErrorMessage, getErrorMessage } from '@/lib/error-message';
import type {
  CompendiumRef,
  CompendiumRefKind,
  ImportEnvelopeIssue,
} from '@dungeon-hub/domain/character/import';

export interface ImportErrorDisplay {
  message: string;
  /** Optional itemized breakdown (e.g. one line per unresolved reference). */
  details?: string[];
}

const KIND_LABELS: Record<CompendiumRefKind, string> = {
  race: 'Raza',
  subrace: 'Sublinaje',
  class: 'Clase',
  subclass: 'Subclase',
  background: 'Trasfondo',
  spell: 'Hechizo',
  item: 'Objeto',
};

function isSchemaVersionIssue(
  issue: ImportEnvelopeIssue,
): issue is Extract<ImportEnvelopeIssue, { code: 'SCHEMA_VERSION_UNSUPPORTED' }> {
  return issue.code === 'SCHEMA_VERSION_UNSUPPORTED';
}

/** Shape-validation failures (SCHEMA_VERSION_UNSUPPORTED | MALFORMED_ENVELOPE). */
export function describeEnvelopeIssues(issues: ImportEnvelopeIssue[]): ImportErrorDisplay {
  const versionIssue = issues.find(isSchemaVersionIssue);
  if (versionIssue) {
    return {
      message: `Este archivo se exportó con una versión de formato distinta (encontrada: ${versionIssue.got}, esperada: ${versionIssue.expected}). Volvé a exportarlo desde una ficha actualizada.`,
    };
  }

  return {
    message: 'El archivo no tiene el formato de una ficha exportada.',
    details: issues.map((issue) =>
      issue.code === 'MALFORMED_ENVELOPE'
        ? `${issue.path || '(raíz)'}: ${issue.message}`
        : issue.code,
    ),
  };
}

/** 400 UNRESOLVED_REFS — the target world's compendium is missing these entries. */
export function describeUnresolvedRefs(refs: CompendiumRef[]): ImportErrorDisplay {
  return {
    message:
      'El mundo elegido no tiene estos elementos del compendio. Tienen que existir en la base del mundo antes de poder importar:',
    details: refs.map((ref) => `${KIND_LABELS[ref.kind] ?? ref.kind}: ${ref.slug} (${ref.source})`),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Maps any error thrown by `api.post('/characters/import', ...)` to Spanish copy. */
export function describeImportError(err: unknown): ImportErrorDisplay {
  const netMsg = networkErrorMessage(err);
  if (netMsg) return { message: netMsg };

  if (err instanceof ApiError) {
    const body = isRecord(err.body) ? err.body : null;
    const code = body && typeof body.error === 'string' ? body.error : undefined;
    const issues = body && Array.isArray(body.issues) ? body.issues : null;

    if (err.status === 400 && code === 'UNRESOLVED_REFS' && issues) {
      return describeUnresolvedRefs(issues as CompendiumRef[]);
    }

    if (err.status === 400 && code === 'VALIDATION_FAILED' && issues) {
      return describeEnvelopeIssues(issues as ImportEnvelopeIssue[]);
    }

    if (err.status === 403 && code === 'NOT_WORLD_MEMBER') {
      return { message: 'No sos miembro de ese mundo. Pedile al DM que te invite antes de importar.' };
    }

    if (err.status === 404) {
      return { message: 'Ese mundo ya no existe. Elegí otro e intentá de nuevo.' };
    }

    return { message: code ?? `No se pudo importar el personaje (error ${err.status}).` };
  }

  return { message: getErrorMessage(err, 'No se pudo importar el personaje.') };
}
