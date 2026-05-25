import type { RacialTrait } from '../sheet/types.js';

/**
 * Names that are filtered out of `racialTraits` because their content
 * is surfaced elsewhere on the character sheet. Match is case-insensitive
 * on the trimmed name. Exported for test introspection only.
 *
 * Blocklist (locked — decision #628):
 *   Age, Size, Speed, Languages, Darkvision, Alignment
 * PHB citations: PHB p.20 — these are categorical entries that duplicate
 * dedicated sheet fields (speed value, size pill, languages section, senses).
 */
export const RACIAL_TRAIT_NAME_BLOCKLIST: ReadonlySet<string> = new Set([
  'age',
  'size',
  'speed',
  'languages',
  'darkvision',
  'alignment',
]);

/**
 * Serialize a single inner node into a string.
 * Strings are returned as-is (preserving 5etools {@...} tokens verbatim —
 * decision #630: render-time token parsing is a web-layer concern).
 * Structured nodes are recursively reduced; unknown shapes return ''.
 */
function serializeNode(node: unknown): string {
  // String → raw (preserves {@...} tokens)
  if (typeof node === 'string') return node;

  // Not an object → defensive empty
  if (node === null || node === undefined || typeof node !== 'object') return '';

  const obj = node as Record<string, unknown>;
  const type = obj['type'];

  // Nested named entries block: { type: 'entries', name: '...', entries: [...] }
  if (type === 'entries') {
    const inner = Array.isArray(obj['entries']) ? serializeInnerEntries(obj['entries'] as unknown[]) : '';
    const rawName = obj['name'];
    if (typeof rawName === 'string' && rawName.trim() !== '') {
      if (inner === '') return rawName.trim() + '.';
      return rawName.trim() + '. ' + inner;
    }
    return inner;
  }

  // Inline list: { type: 'list', items: [...] }
  if (type === 'list') {
    if (!Array.isArray(obj['items'])) return '';
    const items = (obj['items'] as unknown[])
      .map((item) => serializeNode(item))
      .filter((s) => s !== '');
    if (items.length === 0) return '';
    return '- ' + items.join('\n- ');
  }

  // Tables don't fit linear flow — skip in v1 (design #632 §8)
  if (type === 'table') return '';

  // Any other structured node with .entries — recurse
  if (Array.isArray(obj['entries'])) {
    return serializeInnerEntries(obj['entries'] as unknown[]);
  }

  return '';
}

/**
 * Serialize an array of inner-entry nodes into a single text string.
 * Non-empty parts are joined with '\n\n' (multi-paragraph separator).
 * Design #632 §8.
 */
function serializeInnerEntries(nodes: unknown[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    const s = serializeNode(node);
    if (s !== '') parts.push(s);
  }
  return parts.join('\n\n');
}

/**
 * Collect `RacialTrait` items from an entries array, tagging each with `source`.
 * Mutates `result` in place for performance. Does NOT push items with empty text.
 */
function collectFrom(
  entries: unknown[] | undefined | null,
  source: 'race' | 'subrace',
  result: RacialTrait[],
): void {
  if (!entries || !Array.isArray(entries)) return;

  for (const entry of entries) {
    // Must be a plain object
    if (entry === null || typeof entry !== 'object') continue;

    const obj = entry as Record<string, unknown>;

    // Only process items with type === 'entries'
    if (obj['type'] !== 'entries') continue;

    // Name must be a non-empty string
    const rawName = obj['name'];
    if (typeof rawName !== 'string') continue;
    const trimmed = rawName.trim();
    if (trimmed === '') continue;

    // Blocklist check (case-insensitive) — decision #628
    if (RACIAL_TRAIT_NAME_BLOCKLIST.has(trimmed.toLowerCase())) continue;

    // Inner entries must be a non-empty array
    const inner = obj['entries'];
    if (!Array.isArray(inner) || inner.length === 0) continue;

    // Serialize inner entries into text
    const text = serializeInnerEntries(inner as unknown[]);
    if (text === '') continue; // defensive: don't push empty traits

    result.push({ name: trimmed, text, source });
  }
}

/**
 * Project raw 5etools `entries[]` arrays from a race row and an optional
 * subrace row into a flat list of RacialTrait. Pure — no IO, no DB, no fetch.
 *
 * Filter: items whose `name` (normalized: trim + lowercase) appears in
 * RACIAL_TRAIT_NAME_BLOCKLIST are dropped. Those entries already render
 * in dedicated sheet fields (decision #628).
 *
 * Order: race entries first (in source order), subrace entries appended
 * (in source order). No sort/dedup (decision #630 items 2 & 3).
 *
 * 5etools formatting tokens ({@spell ...}, {@dice ...}, etc.) are preserved
 * raw in `text` — render-time parsing is a web concern (decision #630 item 1).
 */
export function extractRacialTraits(
  raceEntries: unknown[] | undefined,
  subraceEntries: unknown[] | undefined,
): RacialTrait[] {
  const result: RacialTrait[] = [];
  collectFrom(raceEntries, 'race', result);
  collectFrom(subraceEntries, 'subrace', result);
  return result;
}
