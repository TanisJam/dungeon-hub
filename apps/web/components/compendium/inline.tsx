import type { InlineToken } from './types';
import { TAG_REGISTRY } from './tags/registry';
import { UnknownTag } from './tags/unknown';

/**
 * Tokenize a 5etools string into text and `{@tag args}` tokens.
 *
 * 5etools strings carry inline tags like `{@dice 2d6}`, `{@spell fireball}`,
 * `{@condition prone}`. We split a raw string into a flat list of tokens so
 * the renderer can dispatch on tag name. No nested-tag handling (confirmed
 * unnecessary by the bot renderer's history).
 */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /\{@(\w+)(?:\s+([^}]*))?\}/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: 'text', text: text.slice(lastIndex, m.index) });
    }
    out.push({ kind: 'tag', name: m[1] ?? '', args: m[2] ?? '' });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    out.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return out;
}

/**
 * Pull the user-visible display segment out of a tag's pipe-separated args.
 *
 * 5etools pattern: `{@tag arg|source|displayText}` — when displayText exists,
 * use it; otherwise fall back to the first segment (the slug/name).
 */
export function takeDisplay(args: string): string {
  const parts = args.split('|');
  if (parts.length >= 3 && parts[2]) return parts[2];
  return parts[0] ?? '';
}

/** First pipe-separated segment, no transform. Used for slugs / numeric values. */
export function takeFirstSegment(args: string): string {
  return args.split('|')[0] ?? '';
}

// ---------------------------------------------------------------------------
// Renderer — concrete handlers live in tags/registry.ts; phases B/C/D extend
// that map. Unknown tags fall through to UnknownTag so prose stays readable.
// ---------------------------------------------------------------------------

export type TagHandler = (args: string) => React.ReactNode;

/**
 * Server component. Renders the token stream of a string via TAG_REGISTRY.
 * Unknown tags fall through to `UnknownTag` so the prose stays readable even
 * if a tag isn't implemented yet.
 */
export function InlineRenderer({ text }: { text: string }) {
  const tokens = parseInline(text);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'text') return <span key={i}>{t.text}</span>;
        const handler = TAG_REGISTRY[t.name];
        if (handler) return <span key={i}>{handler(t.args)}</span>;
        return <UnknownTag key={i} args={t.args} />;
      })}
    </>
  );
}
