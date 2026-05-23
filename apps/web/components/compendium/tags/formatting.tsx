import type { TagHandler } from '../inline';
import { takeDisplay, takeFirstSegment } from '../inline';

/**
 * Formatting tags map to semantic HTML elements. None emit
 * data-compendium-ref — they're pure presentation.
 */
export const FORMATTING_TAGS: Record<string, TagHandler> = {
  b: (args) => <strong>{takeDisplay(args)}</strong>,
  bold: (args) => <strong>{takeDisplay(args)}</strong>,
  i: (args) => <em>{takeDisplay(args)}</em>,
  italic: (args) => <em>{takeDisplay(args)}</em>,
  // `{@h}` is the "Hit:" prefix in monster attack lines
  h: () => <em className="font-semibold text-ink">Hit:</em>,
  // `{@m}` is "Miss:" (paired with @h)
  m: () => <em className="font-semibold text-ink">Miss:</em>,
  note: (args) => <span className="text-ink-mute italic">{takeDisplay(args)}</span>,
  link: (args) => {
    // `{@link displayText|url}` — external link
    const parts = args.split('|');
    const display = parts[0] ?? '';
    const url = parts[1] ?? '#';
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-deep underline">
        {display}
      </a>
    );
  },
  // `{@u underline}` — rare but real
  u: (args) => <span className="underline">{takeDisplay(args)}</span>,
  // `{@s strikethrough}` — rare
  s: (args) => <span className="line-through">{takeDisplay(args)}</span>,
  // `{@sup superscript}` / `{@sub subscript}`
  sup: (args) => <sup>{takeDisplay(args)}</sup>,
  sub: (args) => <sub>{takeDisplay(args)}</sub>,
  // `{@code mono}` — monospace inline
  code: (args) => <code className="font-mono text-sm bg-paper-soft px-1 rounded-sm">{takeFirstSegment(args)}</code>,
};
