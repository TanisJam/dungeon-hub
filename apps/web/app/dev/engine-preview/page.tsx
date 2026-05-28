import { notFound } from 'next/navigation';
import {
  resolveStat,
  createInMemoryRegistry,
  buildCloakOfProtectionModifiers,
} from '@dungeon-hub/domain';
import type { EvaluationContext, EntityId } from '@dungeon-hub/domain';
import { computeArmorClass } from '@dungeon-hub/domain/character/sheet';
import type { ComputeArmorClassInput } from '@dungeon-hub/domain/character/sheet';

/**
 * Dev-only smoke page: first-ever runtime import of @dungeon-hub/domain engine
 * from the web app. Proves the import path resolves and resolveStat executes.
 *
 * Fixture: unarmored DEX-14 fighter → computeArmorClass = 12 (PHB p.144),
 * then engine adds Cloak of Protection +1 (DMG 159) → AC 13.
 *
 * T1 de-risk: Option B (direct Server Component import). See design #1112.
 */
export default function EnginePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  // ── BEFORE: legacy computeArmorClass ─────────────────────────────────────
  // Unarmored DEX-14 fighter. PHB p.144: no armor → 10 + DEX mod (2) = 12.
  const acInput: ComputeArmorClassInput = {
    inventory: [],
    itemLites: {},
    classes: [{ classSlug: 'fighter', level: 1 }],
    abilities: { str: 10, dex: 14, con: 12, wis: 10 },
  };
  const before = computeArmorClass(acInput); // { ac: 12, formula: '10 + DEX(2)', warnings: [] }
  const baseAc = before.ac;

  // ── AFTER: engine resolveStat ──────────────────────────────────────────────
  // DMG 159: Cloak of Protection → +1 AC + +1 saving throws.
  const charId = 'fixture-char' as EntityId;
  const itemId = 'fixture-cloak-1';

  const registry = createInMemoryRegistry();
  for (const inst of buildCloakOfProtectionModifiers(charId, itemId)) {
    registry.register(inst);
  }

  // exactOptionalPropertyTypes: omit absent optional keys entirely.
  // EntityRef requires `conditions: ConditionRef[]` (NOT optional in types.ts).
  const ctx: EvaluationContext = {
    self: { id: charId, conditions: [] },
    activeConditions: [],
  };

  const after = resolveStat(charId, 'ac', baseAc, ctx, registry);
  // Expected: after.value === 13 (12 base + 1 Cloak item mod)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Engine Preview</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Dev-only · import smoke for <code className="font-mono text-ink-soft">@dungeon-hub/domain</code> engine.
          Fixture: unarmored DEX-14 fighter + Cloak of Protection.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-ink">BEFORE — computeArmorClass</h2>
        <pre className="bg-surface rounded p-4 text-sm overflow-x-auto">
          {JSON.stringify(before, null, 2)}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          AFTER — resolveStat (AC = {after.value})
        </h2>
        <pre className="bg-surface rounded p-4 text-sm overflow-x-auto">
          {JSON.stringify(after, null, 2)}
        </pre>
      </section>
    </main>
  );
}
