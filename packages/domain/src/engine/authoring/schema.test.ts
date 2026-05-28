/**
 * Tests for ProficiencyModSchema — engine/authoring/schema.ts
 *
 * REQ-PROF-01: ProficiencyMod Zod schema
 *   - `domain` is a CLOSED enum (6 values)
 *   - `ref` is a FREE string (homebrew passes, z.string().min(1))
 *   - // TODO #513: future DB-injected resolver for ref validation
 */
import { describe, it, expect } from 'vitest';
import { ProficiencyModSchema } from './schema.js';

describe('ProficiencyModSchema — Zod schema (REQ-PROF-01)', () => {
  it('accepts a valid ProficiencyMod with a homebrew ref string', () => {
    // REQ-PROF-01 / Scenario: Homebrew ref passes — free string on ref
    const result = ProficiencyModSchema.safeParse({
      kind: 'proficiency',
      domain: 'skill',
      ref: 'lore-of-the-ancients',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid domain value (closed enum)', () => {
    // domain must be one of the 6 closed values — "swimming" is not valid
    const result = ProficiencyModSchema.safeParse({
      kind: 'proficiency',
      domain: 'swimming',
      ref: 'athletics',
    });
    expect(result.success).toBe(false);
  });
});
