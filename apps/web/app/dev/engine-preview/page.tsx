import { notFound } from 'next/navigation';
import {
  resolveStat,
  createInMemoryRegistry,
  buildCloakOfProtectionModifiers,
} from '@dungeon-hub/domain';
import type { EvaluationContext, EntityId } from '@dungeon-hub/domain';
import { computeArmorClass } from '@dungeon-hub/domain/character/sheet';
import type { ComputeArmorClassInput } from '@dungeon-hub/domain/character/sheet';
import { Card } from '@/components/ui';
import { BreakdownTree } from './_breakdown-tree';

/**
 * Dev-only engine preview page (REQ-PREVIEW-01, REQ-PREVIEW-02, REQ-PREVIEW-03,
 * REQ-FIXTURE-HONESTY-01). NODE_ENV-gated — returns 404 in production.
 *
 * Fixture: unarmored DEX-14 fighter + Cloak of Protection.
 * BEFORE: computeArmorClass → { ac: 12, formula: '10 + DEX(2)' }  (PHB p.144)
 * AFTER : resolveStat       → { value: 13, breakdown: [...] }      (DMG 159)
 *
 * Side-by-side layout: stacked at 375px, md:grid-cols-2 on desktop.
 * Design ref: sdd/engine-integration/design #1112.
 */
export default function EnginePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  // ── BEFORE: legacy computeArmorClass ───────────────────────────────────────
  // Unarmored, DEX 14 (+2). PHB p.144: no armor → 10 + DEX mod (2) = 12.
  const acInput: ComputeArmorClassInput = {
    inventory: [],
    itemLites: {},
    classes: [{ classSlug: 'fighter', level: 1 }],
    abilities: { str: 10, dex: 14, con: 12, wis: 10 },
  };
  const before = computeArmorClass(acInput); // { ac: 12, formula: '10 + DEX(2)', warnings: [] }
  const baseAc = before.ac;                  // 12

  // ── AFTER: engine resolveStat ──────────────────────────────────────────────
  // DMG 159: Cloak of Protection → +1 AC + +1 saving throws.
  const charId = 'fixture-char' as EntityId;
  const itemId = 'fixture-cloak-1';

  const registry = createInMemoryRegistry();
  for (const inst of buildCloakOfProtectionModifiers(charId, itemId)) {
    registry.register(inst);
  }

  // exactOptionalPropertyTypes: omit absent optional keys entirely.
  // EntityRef requires `conditions: ConditionRef[]` (REQUIRED in types.ts — not optional).
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };

  const after = resolveStat(charId, 'ac', baseAc, ctx, registry);
  // after.value === 13 (12 base + 1 Cloak item mod)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Header ──────────────────────────────────────────────────────────── */}
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Engine Preview</h1>
        {/* REQ-FIXTURE-HONESTY-01: visible fixture label at all screen sizes */}
        <p className="mt-1 text-sm text-ink-mute">
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            Fixture · dev-only · NOT real character data.
          </span>{' '}
          Unarmored DEX-14 fighter + Cloak of Protection.
          Proves <code className="font-mono text-ink-soft">resolveStat</code> connects
          end-to-end inside the web app (Option B direct import).
        </p>
      </header>

      {/* Side-by-side grid ────────────────────────────────────────────────── */}
      {/* REQ-PREVIEW-02: stacked 375px → md:grid-cols-2 desktop              */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* LEFT — BEFORE: computeArmorClass (legacy flat) ───────────────── */}
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-ink">
            BEFORE — computeArmorClass
          </h2>
          <p className="text-xs text-ink-mute">
            Flat formula, no provenance. PHB p.144 unarmored branch.
          </p>
          <Card variant="surface" className="p-4 space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs uppercase text-ink-mute">ac</span>
              <span className="text-2xl font-bold text-ink tabular-nums">{before.ac}</span>
            </div>
            <div className="text-sm text-ink-soft font-mono">{before.formula}</div>
          </Card>
        </section>

        {/* RIGHT — AFTER: resolveStat (engine with provenance) ─────────── */}
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-ink">
            AFTER — resolveStat
          </h2>
          <p className="text-xs text-ink-mute">
            Engine provenance. Same AC, richer explanation.
          </p>
          <Card variant="surface" className="p-4">
            <BreakdownTree
              stat="ac"
              value={after.value}
              breakdown={after.breakdown}
            />
          </Card>
        </section>
      </div>

      {/* Both sides must agree on AC ──────────────────────────────────────── */}
      {before.ac !== after.value && (
        <p className="text-sm text-red-600 font-semibold">
          ⚠ Mismatch: computeArmorClass = {before.ac}, resolveStat = {after.value}
        </p>
      )}
    </main>
  );
}
