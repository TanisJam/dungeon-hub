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
 *   pnpm tile:generate --zmax=N    — slice + upload only zoom levels MIN_ZOOM..N
 *                                    (useful for iterating on low-zoom appearance
 *                                    without regenerating the full pyramid;
 *                                    e.g. --zmax=1 regenerates z0 + z1 only)
 *
 * After upload, smoke-test manually:
 *   curl -I "${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/world-maps/sword-coast/0/0/0.jpg"
 *   Expect HTTP 200. If 400/403, confirm the bucket is public and the upload succeeded.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs';
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

// ─── Image dimensions ─────────────────────────────────────────────────────────
const IMAGE_W = 10200; // keep in sync with IMAGE_W in apps/web/lib/world/map/coords.ts
const IMAGE_H = 6600; // keep in sync with IMAGE_H in apps/web/lib/world/map/coords.ts
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

// --zmax=N: limit generation to zoom levels MIN_ZOOM..N (inclusive).
// Useful for iterating on low-zoom appearance without regenerating the full
// pyramid. E.g. --zmax=1 regenerates z0 + z1 only (8 tiles total).
const zmaxArg = process.argv.find((a) => a.startsWith('--zmax='));
const zmaxValue = zmaxArg ? parseInt(zmaxArg.slice('--zmax='.length), 10) : null;
const EFFECTIVE_MAX_ZOOM = zmaxValue !== null ? Math.min(zmaxValue, MAX_ZOOM) : MAX_ZOOM;

if (zmaxValue !== null) {
  console.log(`--zmax=${zmaxValue}: generating zoom levels ${MIN_ZOOM}..${EFFECTIVE_MAX_ZOOM} only`);
}

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
 * sliceZoomLevel pads the resized image to the next 256-multiple before cropping,
 * so every emitted tile is exactly 256×256 (no edge stretching in Leaflet).
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
 * Strategy: resize image to (IMAGE_W*scale × IMAGE_H*scale), PAD to the next
 * 256-multiple boundary with -extent, then crop into TILE_SIZE×TILE_SIZE pieces.
 *
 * WHY PAD: scaledW/scaledH are rarely multiples of 256. Without padding, the last
 * column and last row produce partial tiles smaller than 256×256. Leaflet renders
 * every tile at exactly 256×256 CSS px, so those partial tiles get stretched
 * (directional, zoom-dependent). Padding to the next 256 boundary ensures every
 * emitted tile is exactly 256×256. The padding color is the app's dark background
 * (#0B0A12 = --color-paper from globals.css @theme) so it blends with the Leaflet
 * container background at zoomed-out levels where the full map fits on screen.
 *
 * -gravity NorthWest: padding goes to the right/bottom edges so row 0 = top of
 * the image stays aligned, matching the slippy-map tile convention.
 */
function sliceZoomLevel(z, singleTile = false) {
  const { scaledW, scaledH, cols, rows } = tileDimensions(z);
  const paddedW = Math.ceil(scaledW / TILE_SIZE) * TILE_SIZE;
  const paddedH = Math.ceil(scaledH / TILE_SIZE) * TILE_SIZE;
  console.log(`  z=${z}: ${cols}×${rows} tiles (${scaledW}×${scaledH}px → padded to ${paddedW}×${paddedH}px)`);

  mkdirSync(TILES_DIR, { recursive: true });

  // Smoke mode: a single corner tile (z/0/0) is enough to validate the pipeline.
  // Resize + pad + crop in ONE pass — no intermediate JPEG, so the tile is a
  // single encode from the source (no generational loss).
  // Padding color = app dark background (#0B0A12 = --color-paper) so the fringe
  // blends with the Leaflet container background at low zoom levels.
  const PAD_COLOR = '#0B0A12';

  if (singleTile) {
    mkdirSync(join(TILES_DIR, String(z), '0'), { recursive: true });
    execSync(
      `convert "${SOURCE_IMAGE}" -resize ${scaledW}x${scaledH}! ` +
        `-background "${PAD_COLOR}" -gravity NorthWest -extent ${paddedW}x${paddedH} ` +
        `-crop ${TILE_SIZE}x${TILE_SIZE}+0+0 +repage -quality ${JPEG_QUALITY} ` +
        `"${join(TILES_DIR, String(z), '0', '0.jpg')}"`,
      { stdio: 'pipe' },
    );
    return;
  }

  // ONE-SHOT resize + pad + crop: a single decode of the source resizes in memory,
  // pads to the 256-boundary, and emits ALL tiles for this zoom in row-major order
  // (left→right, top→bottom). No intermediate file → each tile is encoded exactly
  // ONCE from the resized pixels (no double-JPEG generational loss), and the 67MP
  // source is decoded once per zoom instead of once per tile (minutes → seconds).
  //
  // IM6 FALLBACK: ImageMagick 6 has a hard policy limit of 256MiB memory + 1GiB disk
  // that cannot be raised via command-line flags (the system policy.xml wins). At z5
  // (10200×6600px) the pixel cache for resize + extent exceeds those limits and IM6
  // aborts with "cache resources exhausted". When that happens we fall back to Python3
  // + Pillow which has no such artificial cap and can tile the full-resolution image.
  const scratch = join(TILES_DIR, `_scratch_z${z}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });

  let useIm = true;
  try {
    execSync(
      `convert "${SOURCE_IMAGE}" -resize ${scaledW}x${scaledH}! ` +
        `-background "${PAD_COLOR}" -gravity NorthWest -extent ${paddedW}x${paddedH} ` +
        `-crop ${TILE_SIZE}x${TILE_SIZE} +repage +adjoin -quality ${JPEG_QUALITY} ` +
        `"${join(scratch, 'out_%d.jpg')}"`,
      { stdio: 'pipe' },
    );
  } catch (err) {
    const msg = err.stderr?.toString() ?? '';
    if (msg.includes('cache resources exhausted')) {
      console.warn(`  IM6 cache limit hit at z=${z} — falling back to Python3/Pillow`);
      useIm = false;
    } else {
      throw err;
    }
  }

  if (!useIm) {
    // Python3 + Pillow fallback: writes tiles directly to TILES_DIR/{z}/{x}/{y}.jpg
    // without a scratch directory, so the rename step below is skipped.
    const pyScript = `
import sys, math
from PIL import Image

src, scaledW, scaledH, paddedW, paddedH, tileSize, tilesDir, z, quality = (
  sys.argv[1], int(sys.argv[2]), int(sys.argv[3]),
  int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]),
  sys.argv[7], int(sys.argv[8]), int(sys.argv[9])
)
cols = math.ceil(scaledW / tileSize)
rows = math.ceil(scaledH / tileSize)
import os

img = Image.open(src)
if img.size != (scaledW, scaledH):
    img = img.resize((scaledW, scaledH), Image.LANCZOS)

if img.size != (paddedW, paddedH):
    # Padding color = app dark background #0B0A12 (--color-paper) = RGB(11, 10, 18)
    padded = Image.new('RGB', (paddedW, paddedH), (11, 10, 18))
    padded.paste(img, (0, 0))
    img = padded

for x in range(cols):
    os.makedirs(os.path.join(tilesDir, str(z), str(x)), exist_ok=True)

for y in range(rows):
    for x in range(cols):
        tile = img.crop((x*tileSize, y*tileSize, (x+1)*tileSize, (y+1)*tileSize))
        tile.save(os.path.join(tilesDir, str(z), str(x), str(y)+'.jpg'), 'JPEG', quality=quality)
`.trim();
    // Write to a temp .py file instead of using `python3 -c "..."` — the -c form
    // passes the script as a double-quoted shell argument where JSON.stringify embeds
    // literal \n sequences rather than real newlines, breaking Python's parser.
    const pyTempFile = join(scratch, 'slice.py');
    writeFileSync(pyTempFile, pyScript, 'utf8');
    execSync(
      `python3 "${pyTempFile}" ` +
        `"${SOURCE_IMAGE}" ${scaledW} ${scaledH} ${paddedW} ${paddedH} ${TILE_SIZE} "${TILES_DIR}" ${z} ${JPEG_QUALITY}`,
      { stdio: 'inherit' },
    );
    rmSync(scratch, { recursive: true, force: true });
    return;
  }

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
 * Upload a single tile to Supabase Storage, with up to maxRetries attempts.
 * Returns true on success, false if all attempts fail.
 */
async function uploadTile(z, x, y, maxRetries = 2) {
  const localPath = join(TILES_DIR, String(z), String(x), `${y}.jpg`);
  const storagePath = `${PATH_PREFIX}/${z}/${x}/${y}.jpg`;
  const buf = readFileSync(localPath);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, {
        upsert: true,
        contentType: 'image/jpeg',
      });

    if (!error) return true;

    const isLast = attempt === maxRetries + 1;
    if (isLast) {
      console.error(`  UPLOAD FAILED ${storagePath} (${attempt} attempts): ${error.message}`);
      return false;
    }
    // Transient failure — wait briefly before retry (exponential: 300ms, 600ms, ...)
    const delay = 300 * attempt;
    console.warn(`  Retry ${attempt}/${maxRetries} for ${storagePath} after ${delay}ms: ${error.message}`);
    await new Promise((r) => setTimeout(r, delay));
  }
  return false; // unreachable, but satisfies type-checker
}

/**
 * Upload tiles in fixed-size batches to avoid overwhelming Supabase Storage.
 *
 * Fire-all-at-once (Promise.all over 260–1040 tiles) causes timeouts at z4/z5.
 * Instead, we chunk into batches of UPLOAD_CONCURRENCY and await each batch
 * before starting the next. Each individual tile has up to UPLOAD_MAX_RETRIES
 * retries with a short exponential back-off. This guarantees forward progress
 * even if a handful of requests are dropped by the storage backend.
 */
const UPLOAD_CONCURRENCY = 8; // max simultaneous uploads per batch
const UPLOAD_MAX_RETRIES = 2; // up to 2 additional attempts per tile on failure

async function uploadZoomLevel(z, colRange, rowRange) {
  // Build the full list of tile coordinates for this zoom level.
  const tiles = [];
  for (let x = 0; x < colRange; x++) {
    for (let y = 0; y < rowRange; y++) {
      tiles.push([x, y]);
    }
  }

  let uploaded = 0;
  let failed = 0;
  const failedTiles = [];

  // Process in fixed-size batches — await each before starting the next.
  for (let i = 0; i < tiles.length; i += UPLOAD_CONCURRENCY) {
    const batch = tiles.slice(i, i + UPLOAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(([x, y]) => uploadTile(z, x, y, UPLOAD_MAX_RETRIES)),
    );
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        uploaded++;
      } else {
        failed++;
        failedTiles.push(`${z}/${batch[j][0]}/${batch[j][1]}`);
      }
    }
  }

  return { uploaded, failed, failedTiles };
}

/**
 * Main — slice + upload all zoom levels (or single tile in smoke mode).
 */
async function main() {
  const modeLabel = smokeMode
    ? '=== SMOKE MODE (z0/0/0 only) ==='
    : zmaxValue !== null
      ? `=== Tile Map Generator (z${MIN_ZOOM}–z${EFFECTIVE_MAX_ZOOM} only) ===`
      : '=== Tile Map Generator ===';
  console.log(modeLabel);
  checkSourceImage();
  await ensureBucket();

  const zoomLevels = smokeMode
    ? [MIN_ZOOM]
    : Array.from({ length: EFFECTIVE_MAX_ZOOM - MIN_ZOOM + 1 }, (_, i) => i + MIN_ZOOM);

  let totalUploaded = 0;
  let totalFailed = 0;
  const allFailedTiles = [];

  for (const z of zoomLevels) {
    console.log(`\nProcessing zoom level ${z}...`);
    sliceZoomLevel(z, smokeMode);

    const { cols, rows } = tileDimensions(z);
    const colRange = smokeMode ? 1 : cols;
    const rowRange = smokeMode ? 1 : rows;

    const tileCount = colRange * rowRange;
    const batchCount = Math.ceil(tileCount / UPLOAD_CONCURRENCY);
    console.log(
      `  Uploading ${tileCount} tiles in ${batchCount} batch(es) of ≤${UPLOAD_CONCURRENCY} (retries: ${UPLOAD_MAX_RETRIES})...`,
    );

    const { uploaded, failed, failedTiles } = await uploadZoomLevel(z, colRange, rowRange);
    totalUploaded += uploaded;
    totalFailed += failed;
    allFailedTiles.push(...failedTiles);
    console.log(`  z=${z} done. uploaded=${uploaded} failed=${failed}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Uploaded: ${totalUploaded} tiles`);
  if (totalFailed > 0) {
    console.error(`Failed:   ${totalFailed} tiles`);
    console.error(`Failed tile paths:`);
    for (const path of allFailedTiles) {
      console.error(`  ${path}`);
    }
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
