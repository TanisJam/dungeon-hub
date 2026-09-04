/**
 * upload-map-tiles.ts — Upload the Sword Coast tile pyramid to Supabase Storage.
 *
 * The web map's <TileLayer> loads tiles from the `world-maps` Storage bucket
 * (…/storage/v1/object/public/world-maps/sword-coast/{z}/{x}/{y}.jpg). In local
 * dev the same tiles are served from apps/web/public/world-maps/, so the map
 * renders locally even when the bucket is empty — which is why prod showed a
 * black map. This uploads the local pyramid into the bucket (idempotent upsert).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Storage writes need the service role).
 * Optional: TILES_DIR (defaults to ../web/public/world-maps/sword-coast),
 *           BUCKET (defaults to 'world-maps'), PREFIX (defaults to 'sword-coast'),
 *           CONCURRENCY (defaults to 10).
 *
 * Run: pnpm --filter @dungeon-hub/api tsx scripts/upload-map-tiles.ts
 */
import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.BUCKET ?? 'world-maps';
const PREFIX = process.env.PREFIX ?? 'sword-coast';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const TILES_DIR =
  process.env.TILES_DIR ??
  fileURLToPath(new URL('../../web/public/world-maps/sword-coast', import.meta.url));

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('[upload-tiles] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/** Create the public bucket if it doesn't exist (idempotent). Storage writes need it. */
async function ensureBucket(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok) {
    console.log(`[upload-tiles] bucket "${BUCKET}" created (public).`);
    return;
  }
  const body = await res.text();
  if (res.status === 409 || /already exists|Duplicate/i.test(body)) {
    console.log(`[upload-tiles] bucket "${BUCKET}" already exists.`);
    return;
  }
  throw new Error(`bucket create failed (${res.status}): ${body.slice(0, 200)}`);
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (e.name.endsWith('.jpg')) files.push(full);
  }
  return files;
}

async function uploadOne(absPath: string): Promise<'ok' | 'fail'> {
  const rel = relative(TILES_DIR, absPath).split('\\').join('/'); // e.g. 5/37/3.jpg
  const objectPath = `${PREFIX}/${rel}`;
  const bytes = await readFile(absPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: bytes,
  });
  if (res.ok) return 'ok';
  console.warn(`  [fail ${res.status}] ${objectPath}: ${(await res.text()).slice(0, 140)}`);
  return 'fail';
}

async function main(): Promise<void> {
  console.log(`[upload-tiles] ${TILES_DIR} → ${SUPABASE_URL}/storage → bucket "${BUCKET}"`);
  await ensureBucket();
  const files = await walk(TILES_DIR);
  console.log(`[upload-tiles] ${files.length} tiles, concurrency ${CONCURRENCY}`);

  let ok = 0;
  let fail = 0;
  let i = 0;
  async function worker(): Promise<void> {
    while (i < files.length) {
      const idx = i++;
      const r = await uploadOne(files[idx]!);
      if (r === 'ok') ok++;
      else fail++;
      const done = ok + fail;
      if (done % 100 === 0 || done === files.length) {
        console.log(`  ${done}/${files.length} (ok ${ok}, fail ${fail})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
  console.log(`[upload-tiles] done — ok ${ok}, fail ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[upload-tiles] FAILED:', e);
  process.exit(1);
});
