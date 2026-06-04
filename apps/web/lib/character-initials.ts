/**
 * characterInitials — shared helper for character portrait initials.
 *
 * @param name     The character's display name (raw, may have whitespace).
 * @param opts.maxChars  1 (default) = first letter only; 2 = two-letter initials.
 *
 * Behaviour:
 * - Empty / whitespace-only → '?'
 * - maxChars=1: first char of first word, uppercased
 * - maxChars=2, single word: first 2 chars of word, uppercased
 * - maxChars=2, multi-word: first chars of first two words, uppercased
 */
export function characterInitials(
  name: string,
  opts?: { maxChars?: 1 | 2 },
): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/);
  const maxChars = opts?.maxChars ?? 1;

  if (maxChars === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // maxChars === 2
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}
