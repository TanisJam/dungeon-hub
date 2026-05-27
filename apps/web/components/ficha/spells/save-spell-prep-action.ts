/**
 * save-spell-prep-action — stub.
 * Full implementation in C5. This file exists only so C4 tests can mock it.
 * DO NOT call this directly — it will be replaced in C5.
 */

export type SaveSpellPrepResult =
  | { ok: true }
  | { ok: false; error: 'auth' | 'validation' | 'over_limit' | 'unknown'; message?: string };

export async function saveSpellPrepForClass(_input: {
  characterId: string;
  classSlug: string;
  cantrips: { slug: string; source: string }[];
  known: { slug: string; source: string }[];
  prepared: { slug: string; source: string }[];
}): Promise<SaveSpellPrepResult> {
  throw new Error('saveSpellPrepForClass: not implemented (stub — implement in C5)');
}
