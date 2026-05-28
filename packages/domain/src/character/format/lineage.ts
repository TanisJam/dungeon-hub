export interface LineageInput {
  race: { name?: string; slug: string };
  subrace?: { name?: string; slug: string } | null;
  classes: Array<{
    name?: string;
    slug: string;
    level: number;
    subclassName?: string | null;
  }>;
}

function capSlug(slug: string): string {
  if (!slug) return '';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function resolveName(entry: { name?: string; slug: string }): string {
  return entry.name ?? capSlug(entry.slug);
}

export function formatLineage(input: LineageInput): string {
  const lineagePart = input.subrace
    ? resolveName(input.subrace)
    : resolveName(input.race);

  if (input.classes.length === 0) {
    return lineagePart;
  }

  const classesPart = [...input.classes]
    .sort((a, b) => b.level - a.level)
    .map((c) => {
      const className = resolveName(c);
      const sub = c.subclassName ? ` (${c.subclassName})` : '';
      return `${className}${sub} ${c.level}`;
    })
    .join(' / ');

  return `${lineagePart} · ${classesPart}`;
}
