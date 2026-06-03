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
import { existsSync, mkdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
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
// JPEG quality for emitted tiles. 90 = visually lossless for map labels at a
// reasonable size; tiles are encoded ONCE from the resized source (no double pass).
const JPEG_QUALITY = 90;

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
 *
 * STANDARD DEEP-ZOOM PYRAMID: zoom MAX_ZOOM = NATIVE resolution; each lower zoom
 * HALVES the image (downscale). This is the inverse of a "z0=native, upscale"
 * scheme — which would 32× UPSCALE at z5 (≈1M tiles + an OOM-class resize).
 *
 * For CRS.Simple + 256px tiles, at zoom z:
 *   scale   = 2^(z - MAX_ZOOM)            (= 1 at MAX_ZOOM, <1 below)
 *   scaledW = round(IMAGE_W * scale)
 *   cols    = ceil(scaledW / TILE_SIZE)
 *
 * Total ≈ 1398 tiles (z5:1040, z4:260, z3:70, z2:20, z1:6, z0:2).
 * ImageMagick's -crop handles boundary tiles (smaller than 256×256 — valid;
 * Leaflet renders partial edge tiles correctly).
 */
function tileDimensions(z) {
  const scale = Math.pow(2, z - MAX_ZOOM);
  const scaledW = Math.max(1, Math.round(IMAGE_W * scale));
  const scaledH = Math.max(1, Math.round(IMAGE_H * scale));
  const cols = Math.ceil(scaledW / TILE_SIZE);
  const rows = Math.ceil(scaledH / TILE_SIZE);
  return { scale, scaledW, scaledH, cols, rows };
}

/**
 * Slice the source image at zoom z and write tiles to TILES_DIR/{z}/{x}/{y}.jpg.
 * Row 0 = TOP of image (standard ImageMagick order → tms={false} in Leaflet).
 *
 * Strategy: resize image to (IMAGE_W*scale × IMAGE_H*scale), then crop into
 * TILE_SIZE×TILE_SIZE pieces with ImageMagick's -crop.
 */
function sliceZoomLevel(z, singleTile = false) {
  const { scaledW, scaledH, cols, rows } = tileDimensions(z);
  console.log(`  z=${z}: ${cols}×${rows} tiles (${scaledW}×${scaledH}px)`);

  mkdirSync(TILES_DIR, { recursive: true });

  // Smoke mode: a single corner tile (z/0/0) is enough to validate the pipeline.
  // Resize + crop in ONE pass — no intermediate JPEG, so the tile is a single
  // encode from the source (no generational loss).
  if (singleTile) {
    mkdirSync(join(TILES_DIR, String(z), '0'), { recursive: true });
    execSync(
      `convert "${SOURCE_IMAGE}" -resize ${scaledW}x${scaledH}! ` +
        `-crop ${TILE_SIZE}x${TILE_SIZE}+0+0 +repage -quality ${JPEG_QUALITY} ` +
        `"${join(TILES_DIR, String(z), '0', '0.jpg')}"`,
      { stdio: 'pipe' },
    );
    return;
  }

  // ONE-SHOT resize + crop: a single decode of the source resizes in memory and
  // emits ALL tiles for this zoom in row-major order (left→right, top→bottom).
  // No intermediate file → each tile is encoded exactly ONCE from the resized
  // pixels (no double-JPEG generational loss), and the 67MP source is decoded
  // once per zoom instead of once per tile (minutes → seconds).
  const scratch = join(TILES_DIR, `_scratch_z${z}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  execSync(
    `convert "${SOURCE_IMAGE}" -resize ${scaledW}x${scaledH}! ` +
      `-crop ${TILE_SIZE}x${TILE_SIZE} +repage +adjoin -quality ${JPEG_QUALITY} ` +
      `"${join(scratch, 'out_%d.jpg')}"`,
    { stdio: 'pipe' },
  );

  // Map row-major scene index → {z}/{x}/{y}.jpg  (x = i % cols, y = floor(i / cols)).
  for (let x = 0; x < cols; x++) {
    mkdirSync(join(TILES_DIR, String(z), String(x)), { recursive: true });
  }
  for (let i = 0; i < cols * rows; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    renameSync(join(scratch, `out_${i}.jpg`), join(TILES_DIR, String(z), String(x), `${y}.jpg`));
  }

  rmSync(scratch, { recursive: true, force: true });
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
