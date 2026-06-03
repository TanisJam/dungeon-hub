/**
 * seed-poi-coords.mjs — Assign worldX/worldY to POIs with null coords.
 *
 * PURPOSE: Makes the marker layer in the Mapa view visually testable by seeding
 * coordinate data for POIs that lack coords. This is NOT a DB migration.
 *
 * ALGORITHM:
 *   For POIs whose parent hex HAS coords:
 *     Deterministic ring offset — siblings ordered by (createdAt, id);
 *     angle = 2π·k/max(m,1), radius=120; x = hexX + radius·cos(angle), y = hexY + radius·sin(angle).
 *   For POIs whose parent hex lacks coords:
 *     Deterministic sample coords in [0..10200]×[0..6600] (hash keyed by POI id).
 *   POIs that cannot be resolved: remain null — will not render on the map.
 *
 * IDEMPOTENT: Updates only WHERE world_x IS NULL OR world_y IS NULL.
 * Re-running after coords are seeded = 0 rows updated.
 *
 * USAGE:
 *   node apps/web/scripts/seed-poi-coords.mjs             -- write coords
 *   node apps/web/scripts/seed-poi-coords.mjs --dry-run   -- log only, no writes
 *
 * PREREQUISITE: DATABASE_URL must be set (from infra/supabase/.env).
 *   set -a; source infra/supabase/.env; set +a
 *
 * ADR-5 (design #1688): tile-map.mjs precedent. Standalone node script.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('Source infra/supabase/.env before running:');
  console.error('  set -a; source infra/supabase/.env; set +a');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('[dry-run] No writes will be made.\n');
}

// ---------------------------------------------------------------------------
// postgres-js — resolve from the API package that declares it as a dependency.
// This is a dev/infra script; the relative path is intentional and stable.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '..', '..', 'api');
const require = createRequire(import.meta.url);
let postgres;
try {
  // Try workspace node_modules first
  postgres = require(resolve(apiRoot, 'node_modules', 'postgres'));
} catch {
  console.error('ERROR: Could not resolve postgres from apps/api/node_modules/postgres.');
  console.error('Run `pnpm install` from the repo root and retry.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Image dimensions — keep in sync with IMAGE_W/IMAGE_H in apps/web/lib/world/map/coords.ts
// (This .mjs script cannot import TS modules directly; literals are intentional.)
// ---------------------------------------------------------------------------
const IMAGE_W = 10200; // keep in sync with IMAGE_W in apps/web/lib/world/map/coords.ts
const IMAGE_H = 6600; // keep in sync with IMAGE_H in apps/web/lib/world/map/coords.ts

// Radius for ring offset when multiple POIs share a hex
const RING_RADIUS = 120;

// ---------------------------------------------------------------------------
// Deterministic hash helper (simple djb2 variant for POI id string)
// ---------------------------------------------------------------------------
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & h; // 32-bit int
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    // 1. Load all hexes (id, worldX, worldY)
    const hexRows = await sql`
      SELECT id, world_x AS "worldX", world_y AS "worldY"
      FROM hexes
    `;

    // 2. Load all POIs with null coords (id, hex_id, created_at)
    const poiRows = await sql`
      SELECT id, hex_id AS "hexId", created_at AS "createdAt"
      FROM pois
      WHERE world_x IS NULL OR world_y IS NULL
      ORDER BY hex_id, created_at, id
    `;

    if (poiRows.length === 0) {
      console.log('No POIs with null coords — nothing to update.');
      return;
    }

    console.log(`Found ${poiRows.length} POI(s) with null coords.`);

    // Build hex lookup map
    const hexById = new Map(hexRows.map((h) => [h.id, h]));

    // Group POIs by hexId
    const byHex = new Map();
    for (const p of poiRows) {
      if (!byHex.has(p.hexId)) byHex.set(p.hexId, []);
      byHex.get(p.hexId).push(p);
    }

    // 3. Compute coords
    const updates = []; // [{ id, worldX, worldY }]

    for (const [hexId, siblings] of byHex.entries()) {
      const hex = hexById.get(hexId);
      const m = siblings.length;

      for (let k = 0; k < m; k++) {
        const poi = siblings[k];

        if (hex && hex.worldX != null && hex.worldY != null) {
          // Derive from hex coords via deterministic ring offset
          const angle = (2 * Math.PI * k) / Math.max(m, 1);
          const radius = m > 1 ? RING_RADIUS : 0; // no offset for lone POI
          const worldX = hex.worldX + radius * Math.cos(angle);
          const worldY = hex.worldY + radius * Math.sin(angle);
          updates.push({ id: poi.id, worldX, worldY });
        } else {
          // Fallback: deterministic sample within image bounds (keyed by POI id hash)
          const hash = hashString(poi.id);
          const worldX = (hash % IMAGE_W);
          const worldY = (hashString(poi.id + 'y') % IMAGE_H);
          updates.push({ id: poi.id, worldX, worldY });
        }
      }
    }

    // 4. Print summary
    const withHexCoords = updates.filter((u) => {
      const p = poiRows.find((r) => r.id === u.id);
      if (!p) return false;
      const hex = hexById.get(p.hexId);
      return hex && hex.worldX != null;
    });
    const fallback = updates.length - withHexCoords.length;

    console.log(`  ${withHexCoords.length} POI(s) derived from parent hex coords`);
    console.log(`  ${fallback} POI(s) using deterministic fallback (parent hex has no coords)`);

    if (updates.length > 0) {
      console.log('\nSample updates (first 3):');
      updates.slice(0, 3).forEach((u) =>
        console.log(`  poi ${u.id} → worldX=${u.worldX.toFixed(1)}, worldY=${u.worldY.toFixed(1)}`),
      );
    }

    if (dryRun) {
      console.log(`\n[dry-run] Would update ${updates.length} row(s). No writes made.`);
      return;
    }

    // 5. Apply updates (batch WHERE world_x IS NULL OR world_y IS NULL — idempotent guard)
    let written = 0;
    for (const u of updates) {
      const result = await sql`
        UPDATE pois
        SET world_x = ${u.worldX}, world_y = ${u.worldY}, updated_at = NOW()
        WHERE id = ${u.id}
          AND (world_x IS NULL OR world_y IS NULL)
      `;
      written += result.count;
    }

    console.log(`\nDone. Updated ${written} row(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
