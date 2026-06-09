/**
 * TDD tests for ResistMod 11th schema arm + UsageMod count variant
 * in engine/authoring/schema.ts.
 *
 * T-01 / T-05: RED baselines (must fail before production changes)
 * T-02 / T-06: GREEN after schema updates
 *
 * PHB p.48 — Rage (Barbarian):
 *   "You have resistance to bludgeoning, piercing, and slashing damage."
 *   Rages per long rest: 2/3/4/5/6/unlimited (PHB p.48 table)
 *
 * REQ-SCHEMA-RESIST-01..03, REQ-SCHEMA-USAGE-COUNT-01..04
 */
import { describe, it, expect } from 'vitest';
import { RuleDocSchema } from './schema.js';

// ── Helper: minimal valid RuleDoc wrapper ─────────────────────────────────────

function wrapEmit(def: unknown) {
  return {
    id: 'test',
    source: 'PHB p.48',
    params: [],
    emits: [
      {
        def,
        scope: {
          owner: 'a',
          target: { axis: 'self' },
          trigger: 'always',
        },
      },
    ],
  };
}

// ── ResistMod schema arm ──────────────────────────────────────────────────────

describe('ModifierDefSchema — ResistMod 11th arm (REQ-SCHEMA-RESIST-01..03)', () => {
  it('accepts kind:resist with valid damageType and mode (PHB p.48)', () => {
    // REQ-SCHEMA-RESIST-01, REQ-SCHEMA-RESIST-03
    // PHB p.48 — "You have resistance to bludgeoning, piercing, and slashing damage."
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'resist', damageType: 'bludgeoning', mode: 'half' }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects mode:quarter (invalid mode — must be half or immune)', () => {
    // REQ-SCHEMA-RESIST-03: invalid shapes still fail
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'resist', damageType: 'fire', mode: 'quarter' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects resist emit missing damageType', () => {
    // REQ-SCHEMA-RESIST-03: missing required field
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'resist', mode: 'half' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts mode:immune (valid resist mode)', () => {
    // REQ-SCHEMA-RESIST-01: immune is a valid mode
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'resist', damageType: 'poison', mode: 'immune' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts damageType:all (special petrified wildcard)', () => {
    // PHB p.291 — Petrified has resistance to all damage; damageType:all is valid
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'resist', damageType: 'all', mode: 'half' }),
    );
    expect(result.success).toBe(true);
  });
});

// ── UsageMod count variant ────────────────────────────────────────────────────

describe('ModifierDefSchema — UsageMod pool:count variant (REQ-SCHEMA-USAGE-COUNT-01..04)', () => {
  it('accepts pool:count with numeric count and resetOn:long-rest (PHB p.48)', () => {
    // REQ-SCHEMA-USAGE-COUNT-01, REQ-SCHEMA-USAGE-COUNT-03
    // PHB p.48 — rages per long rest: 2 at L1-8
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'usage', pool: 'count', count: 2, resetOn: 'long-rest' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts pool:count with string template count — {rageCount} slot (R-COUNT-SCHEMA trap)', () => {
    // REQ-SCHEMA-USAGE-COUNT-01: count MUST accept string (template slot).
    // z.number() alone would reject {rageCount} — must be z.union([z.number(), z.string()])
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'usage', pool: 'count', count: '{rageCount}', resetOn: 'long-rest' }),
    );
    expect(result.success).toBe(true);
  });

  it('S-07: backward compat — pool:tiered still parses after enum extension', () => {
    // REQ-SCHEMA-USAGE-COUNT-03: no regression on existing tiered variant
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'usage', pool: 'tiered', resetOn: 'long-rest' }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects pool:count with invalid resetOn:weekly', () => {
    // REQ-SCHEMA-USAGE-COUNT-04: invalid resetOn still fails
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'usage', pool: 'count', count: 2, resetOn: 'weekly' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts pool:count without count field (count is optional)', () => {
    // REQ-SCHEMA-USAGE-COUNT-01: count is optional to keep backward compat
    const result = RuleDocSchema.safeParse(
      wrapEmit({ kind: 'usage', pool: 'count', resetOn: 'short-rest' }),
    );
    expect(result.success).toBe(true);
  });
});
