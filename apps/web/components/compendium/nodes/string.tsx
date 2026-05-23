import { InlineRenderer } from '../inline';

/** Paragraph rendering of a plain string entry, including inline `{@tag}` parsing. */
export function StringNode({ text }: { text: string }) {
  return (
    <p className="leading-relaxed text-ink">
      <InlineRenderer text={text} />
    </p>
  );
}
