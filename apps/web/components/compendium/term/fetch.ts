import { KIND_TO_PATH, parseRefKey } from './registry';
import type { TermFetchResult, TermEntry } from './types';

export interface FetchTermOptions {
  apiBaseUrl: string;
  worldId: string;
  accessToken: string;
}

/**
 * Fetch a single compendium term entry from the API.
 *
 * @param rawRefKey - Pipe-delimited value from `data-compendium-ref`: `{kind}|{slug}|{source}`
 * @param opts - Runtime auth + base URL options
 * @returns TermFetchResult — either `{ kind: 'ok', entry }` or `{ kind: 'error', message }`
 *
 * Notes:
 * - Does NOT cache — caching (Promise-as-cache) lives in TermProvider's useRef<Map>.
 * - Throws synchronously if apiBaseUrl is missing (config error, not a fetch error).
 * - 4xx/5xx responses resolve to `{ kind: 'error' }` and are safe to cache.
 */
export async function fetchTermEntry(
  rawRefKey: string,
  opts: FetchTermOptions
): Promise<TermFetchResult> {
  const { apiBaseUrl, worldId, accessToken } = opts;

  // Guard: missing base URL is a configuration error, not a runtime error
  if (!apiBaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_API_URL / apiBaseUrl is required but was not provided. ' +
        'Check your .env or TermProvider props.'
    );
  }

  const parsed = parseRefKey(rawRefKey);
  if (!parsed) {
    return { kind: 'error', message: `Invalid refKey format: "${rawRefKey}"` };
  }

  const { kind, slug, source } = parsed;
  const path = KIND_TO_PATH[kind as keyof typeof KIND_TO_PATH];

  if (!path) {
    return { kind: 'error', message: `Unsupported ref kind: "${kind}"` };
  }

  const url = buildUrl(apiBaseUrl, path, slug, worldId, source);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (networkError) {
    return {
      kind: 'error',
      message: networkError instanceof Error ? networkError.message : 'Network error',
    };
  }

  if (!response.ok) {
    return {
      kind: 'error',
      message: `HTTP ${response.status} fetching term "${rawRefKey}"`,
    };
  }

  try {
    const json = (await response.json()) as { data: TermEntry };
    return { kind: 'ok', entry: json.data };
  } catch {
    return { kind: 'error', message: `Failed to parse response for "${rawRefKey}"` };
  }
}

/**
 * Compose the full API URL for a compendium term fetch.
 * Pure function — easy to test and reason about in isolation.
 *
 * Result: `{base}/api/v1/compendium/{path}/{slug}?world={worldId}&source={source}`
 */
function buildUrl(
  base: string,
  path: string,
  slug: string,
  worldId: string,
  source: string
): string {
  const trimmed = base.replace(/\/$/, '');
  const params = new URLSearchParams({ world: worldId, source });
  return `${trimmed}/api/v1/compendium/${path}/${slug}?${params.toString()}`;
}
