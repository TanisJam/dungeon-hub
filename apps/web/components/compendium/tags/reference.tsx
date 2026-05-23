import type { TagHandler } from '../inline';
import { slugify } from '../slugify';

/**
 * Build a handler for a "reference" inline tag — emits a styled span carrying
 * `data-compendium-ref="{kind}|{slug}|{source}"` so the future term-hover SDD
 * can wire popovers without re-parsing strings.
 *
 * Args shape: `slug[|source][|displayText]`. Missing source → "PHB" (5etools
 * convention for unsourced refs).
 *
 * Some tags (deck/card/itemMastery) use the 2nd pipe for grouping (e.g. deck
 * name) rather than source. v1 accepts that ambiguity — future SDDs can refine
 * per-tag if downstream resolution misses.
 */
function refHandler(kind: string): TagHandler {
  return (args) => {
    const parts = args.split('|');
    const rawSlug = parts[0] ?? '';
    const slug = slugify(rawSlug);
    const source = parts[1] && parts[1].length > 0 ? parts[1] : 'PHB';
    const display = parts[2] && parts[2].length > 0 ? parts[2] : rawSlug;
    return (
      <span
        data-compendium-ref={`${kind}|${slug}|${source}`}
        className="italic text-ink-soft cursor-help"
      >
        {display}
      </span>
    );
  };
}

/**
 * Tier-1 reference tags. Each links to another entity stored in our DB.
 * The kind value matches the compendium table (or sub-kind, e.g. `status` is
 * stored inside compendium_conditions with kind='status').
 */
export const REFERENCE_TAGS: Record<string, TagHandler> = {
  creature: refHandler('creature'),
  spell: refHandler('spell'),
  item: refHandler('item'),
  condition: refHandler('condition'),
  status: refHandler('status'),
  skill: refHandler('skill'),
  sense: refHandler('sense'),
  feat: refHandler('feat'),
  race: refHandler('race'),
  class: refHandler('class'),
  background: refHandler('background'),
  action: refHandler('action'),
  language: refHandler('language'),
  deity: refHandler('deity'),
  vehicle: refHandler('vehicle'),
  hazard: refHandler('hazard'),
  reward: refHandler('reward'),
  recipe: refHandler('recipe'),
  deck: refHandler('deck'),
  card: refHandler('card'),
  itemProperty: refHandler('itemProperty'),
  itemMastery: refHandler('itemMastery'),
  facility: refHandler('facility'),
  disease: refHandler('disease'),
  // `refClass` rare alias
  refClass: refHandler('class'),
  // B.3 — extended reference tags
  table: refHandler('table'),
  variantrule: refHandler('variantrule'),
  optfeature: refHandler('optfeature'),
  // `{@classFeature Name|ClassName|ClassSrc|level}` — source is at index 2, not 1.
  classFeature: (args) => {
    const parts = args.split('|');
    const rawSlug = parts[0] ?? '';
    const slug = slugify(rawSlug);
    const source = parts[2] && parts[2].length > 0 ? parts[2] : 'PHB';
    return (
      <span
        data-compendium-ref={`classFeature|${slug}|${source}`}
        className="italic text-ink-soft cursor-help"
      >
        {rawSlug}
      </span>
    );
  },
  // `{@subclassFeature Name|Class|ClassSrc|Subclass|SubclassSrc|level|src}` — source is index 6 (sometimes), display is the name
  subclassFeature: (args) => {
    const parts = args.split('|');
    const rawSlug = parts[0] ?? '';
    const slug = slugify(rawSlug);
    const source = parts[6] || parts[4] || 'PHB';
    return (
      <span
        data-compendium-ref={`subclassFeature|${slug}|${source}`}
        className="italic text-ink-soft cursor-help"
      >
        {rawSlug}
      </span>
    );
  },
  // `area` references in-world map regions — different namespace
  area: (args) => {
    const parts = args.split('|');
    const id = parts[0] ?? '';
    const display = parts[1] && parts[1].length > 0 ? parts[1] : id;
    return <span data-area-ref={id} className="italic text-ink-soft">{display}</span>;
  },
  // `quickref` resolves to a rules-glossary anchor (no source mapping); v1 just shows display text
  quickref: (args) => {
    const parts = args.split('|');
    // 5etools layout: {@quickref reference|book|chapter|chapterHash|displayText}
    const display = parts[4] || parts[3] || parts[0] || '';
    return <span className="text-ink">{display}</span>;
  },
  // Citations — small, muted
  book: (args) => {
    const parts = args.split('|');
    const display = parts[2] || parts[0] || '';
    return <span className="text-ink-mute text-sm">{display}</span>;
  },
  adventure: (args) => {
    const parts = args.split('|');
    const display = parts[2] || parts[0] || '';
    return <span className="text-ink-mute text-sm">{display}</span>;
  },
  comic: (args) => {
    const parts = args.split('|');
    const display = parts[2] || parts[0] || '';
    return <span className="text-ink-mute text-sm">{display}</span>;
  },
  // `filter` is a 5etools search shortcut; just show display + title-tooltip with filter spec
  filter: (args) => {
    const parts = args.split('|');
    const display = parts[0] ?? '';
    const filterSpec = parts.slice(2).join(' ');
    return <span title={filterSpec} className="text-ink underline decoration-dotted">{display}</span>;
  },
  // External link tag (always points to 5etools.com)
  '5etools': (args) => {
    const parts = args.split('|');
    const display = parts[0] ?? '';
    return <span className="text-primary-deep">{display}</span>;
  },
  // Image macro — defer real asset hosting; figure placeholder per CER-IMG
  '5etoolsImg': (args) => {
    const parts = args.split('|');
    const path = parts[1] || parts[0] || '';
    const caption = parts[0] || '';
    return (
      <figure
        data-image-ref={path}
        className="border border-line rounded-md bg-surface-soft p-2 text-ink-mute text-xs inline-block"
      >
        <figcaption>{caption || '(image)'}</figcaption>
      </figure>
    );
  },
};
