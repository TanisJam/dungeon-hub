/**
 * Helpers compartidos entre commands. Mantenidos chicos a propósito.
 */

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convierte "high-elf" → "High Elf", "school-of-evocation" → "School of Evocation".
 * Las stopwords (of, the, in, a, an) van en minúscula salvo que sean primera palabra.
 */
const STOPWORDS = new Set(['of', 'the', 'in', 'a', 'an', 'and']);
export function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((w, i) => (i > 0 && STOPWORDS.has(w) ? w : titleCase(w)))
    .join(' ');
}
