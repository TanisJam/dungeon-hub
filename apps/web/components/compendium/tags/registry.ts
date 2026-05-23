import type { TagHandler } from '../inline';
import { REFERENCE_TAGS } from './reference';
import { MECHANIC_TAGS } from './mechanic';
import { FORMATTING_TAGS } from './formatting';

/**
 * Map of `{@tag}` name → handler. Phases B/C/D fill this; the InlineRenderer
 * looks up each tag and falls back to UnknownTag if missing.
 */
export const TAG_REGISTRY: Record<string, TagHandler> = {
  ...REFERENCE_TAGS,
  ...MECHANIC_TAGS,
  ...FORMATTING_TAGS,
};
