/**
 * tile-map.mjs — Sword Coast map tile generator + Supabase Storage uploader.
 *
 * INFRA PREREQUISITE: The Supabase self-hosted stack (Kong :8000) must be running.
 * Required env vars (from infra/supabase/.env or your shell):
 *   NEXT_PUBLIC_SUPABASE_URL — e.g. http://localhost:8000  (the Kong gateway)
 *   SUPABASE_SERVICE_ROLE_KEY — service-role JWT from infra/supabase/.env
 *
 * SOURCE IMAGE: data/Sword-Coast-Map_HighRes.jpg (10200x6600px)
 * TILE OUTPUT:  temp/tiles/{z}/{x}/{y}.jpg  (NOT committed — see .gitignore)
 *
 * TILE CONVENTION (Y-axis):
 *   Row 0 = TOP of image (standard ImageMagick / slippy-map order).
 *   TileLayer in Leaflet must use tms={false} (default).
 *   The Y-flip lives in lib/world/map/coords.ts, NOT here.
 *
 * BUCKET: "world-maps" (PUBLIC — zero RLS policy required)
 * PATH:   sword-coast/{z}/{x}/{y}.jpg
 * CDN URL derived from existing NEXT_PUBLIC_SUPABASE_URL — no new env var.
 *
 * Usage:
 *   pnpm tile:generate             — slice + upload all tiles (z0–z5)
 *   pnpm tile:generate --smoke     — slice + upload ONE tile (z0/0/0) for smoke-test
 *
 * After upload, smoke-test manually:
 *   curl -I "${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/world-maps/sword-coast/0/0/0.jpg"
 *   Expect HTTP 200. If 400/403, confirm the bucket is public and the upload succeeded.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/web/scripts → apps/web → dungeon_hub root → data/
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SOURCE_IMAGE = join(REPO_ROOT, 'data', 'Sword-Coast-Map_HighRes.jpg');
const TILES_DIR = join(__dirname, '..', 'temp', 'tiles');
const BUCKET = 'world-maps';
const PATH_PREFIX = 'sword-coast';

// ─── Image dimensions (PHB: 10200×6600) ──────────────────────────────────────
const IMAGE_W = 10200;
const IMAGE_H = 6600;
const TILE_SIZE = 256;
const MIN_ZOOM = 0;
const MAX_ZOOM = 5;

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL is not set.');
  console.error('Export it from infra/supabase/.env before running this script.');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.error('Export it from infra/supabase/.env before running this script.');
  process.exit(1);
}

const smokeMode = process.argv.includes('--smoke');

// ─── Supabase client (service-role, through Kong :8000) ───────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ensure the source image exists.
 */
function checkSourceImage() {
  if (!existsSync(SOURCE_IMAGE)) {
    console.error(`ERROR: Source image not found at ${SOURCE_IMAGE}`);
    console.error('Place Sword-Coast-Map_HighRes.jpg in data/ at the repo root.');
    process.exit(1);
  }
  console.log(`Source image: ${SOURCE_IMAGE}`);
}

/**
 * Create the public world-maps bucket (idempotent — safe to re-run).
 */
async function ensureBucket() {
  console.log(`Ensuring bucket "${BUCKET}" exists (public)...`);
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/jpeg'],
  });
  if (error && !error.message.includes('already exists') && !error.message.includes('duplicate')) {
    // If it already exists, that's fine — just log and continue
    console.warn(`Bucket note: ${error.message}`);
  } else if (!error) {
    console.log(`Bucket "${BUCKET}" created.`);
  } else {
    console.log(`Bucket "${BUCKET}" already exists — continuing.`);
  }
}

/**
 * Compute the tile grid dimensions for a given zoom level.
 * Tiles use standard slippy-map subdivision: at z=0 the full image fits in a
 * single tile row×col grid. Each zoom level doubles in each axis.
 *
 * For CRS.Simple + 256px tiles, at zoom z:
 *   scale = 2^z
 *   cols  = ceil(IMAGE_W * scale / TILE_SIZE)
 *   rows  = ceil(IMAGE_H * scale / TILE_SIZE)
 *
 * ImageMagick's -crop handles the boundary tiles (they are smaller than 256×256
 * but that is valid — Leaflet renders partial edge tiles correctly).
 */
function tileDimensions(z) {
  const scale = Math.pow(2, z);
  const cols = Math.ceil((IMAGE_W * scale) / TILE_SIZE);
  const rows = Math.ceil((IMAGE_H * scale) / TILE_SIZE);
  return { scale, cols, rows };
}

/**
 * Slice the source image at zoom z and write tiles to TILES_DIR/{z}/{x}/{y}.jpg.
 * Row 0 = TOP of image (standard ImageMagick order → tms={false} in Leaflet).
 *
 * Strategy: resize image to (IMAGE_W*scale × IMAGE_H*scale), then crop into
 * TILE_SIZE×TILE_SIZE pieces with ImageMagick's -crop.
 */
function sliceZoomLevel(z, singleTile = false) {
  const { scale, cols, rows } = tileDimensions(z);
  const scaledW = Math.round(IMAGE_W * scale);
  const scaledH = Math.round(IMAGE_H * scale);

  // Only z0/0/0 in smoke mode
  const colRange = singleTile ? 1 : cols;
  const rowRange = singleTile ? 1 : rows;

  console.log(`  z=${z}: ${cols}×${rows} tiles (scale ×${scale}, ${scaledW}×${scaledH}px)`);

  // Create output dirs
  for (let x = 0; x < colRange; x++) {
    mkdirSync(join(TILES_DIR, String(z), String(x)), { recursive: true });
  }

  // Use ImageMagick to resize then crop each tile individually.
  // We use a loop to avoid writing a huge intermediate file to disk.
  // For large zoom levels this is slow but correct and memory-safe.
  for (let y = 0; y < rowRange; y++) {
    for (let x = 0; x < colRange; x++) {
      const outPath = join(TILES_DIR, String(z), String(x), `${y}.jpg`);
      const cropX = x * TILE_SIZE;
      const cropY = y * TILE_SIZE;

      // Crop region (may be smaller at edges — ImageMagick clips automatically)
      const cmd = [
        'convert',
        `"${SOURCE_IMAGE}"`,
        `-resize ${scaledW}x${scaledH}!`,
        `-crop ${TILE_SIZE}x${TILE_SIZE}+${cropX}+${cropY}`,
        '+repage',
        '-quality 85',
        `"${outPath}"`,
      ].join(' ');

      execSync(cmd, { stdio: 'pipe' });
    }
  }
}

/**
 * Upload a single tile to Supabase Storage.
 */
async function uploadTile(z, x, y) {
  const localPath = join(TILES_DIR, String(z), String(x), `${y}.jpg`);
  const storagePath = `${PATH_PREFIX}/${z}/${x}/${y}.jpg`;

  const buf = readFileSync(localPath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, {
      upsert: true,
      contentType: 'image/jpeg',
    });

  if (error) {
    console.error(`  UPLOAD FAILED ${storagePath}: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Main — slice + upload all zoom levels (or single tile in smoke mode).
 */
async function main() {
  console.log(smokeMode ? '=== SMOKE MODE (z0/0/0 only) ===' : '=== Tile Map Generator ===');
  checkSourceImage();
  await ensureBucket();

  const zoomLevels = smokeMode ? [MIN_ZOOM] : Array.from({ length: MAX_ZOOM - MIN_ZOOM + 1 }, (_, i) => i + MIN_ZOOM);

  let totalUploaded = 0;
  let totalFailed = 0;

  for (const z of zoomLevels) {
    console.log(`\nProcessing zoom level ${z}...`);
    sliceZoomLevel(z, smokeMode);

    const { cols, rows } = tileDimensions(z);
    const colRange = smokeMode ? 1 : cols;
    const rowRange = smokeMode ? 1 : rows;

    console.log(`  Uploading ${colRange * rowRange} tiles...`);
    const uploads = [];
    for (let x = 0; x < colRange; x++) {
      for (let y = 0; y < rowRange; y++) {
        uploads.push(uploadTile(z, x, y).then((ok) => {
          if (!ok) totalFailed++;
          else totalUploaded++;
        }));
      }
    }
    await Promise.all(uploads);
    console.log(`  z=${z} done.`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Uploaded: ${totalUploaded} tiles`);
  if (totalFailed > 0) {
    console.error(`Failed:   ${totalFailed} tiles`);
    process.exit(1);
  }

  if (smokeMode) {
    console.log(`\nSmoke-test URL (verify 200 in browser or curl):`);
    console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${PATH_PREFIX}/0/0/0.jpg`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
