/**
 * TDD tests for buildOnHitDamageRider — STRICT TDD (RED first).
 *
 * PHB p.251 — Hunter's Mark: "deal an extra 1d6 damage to the target whenever
 * you hit it with a weapon attack."
 *
 * This factory is the on-hit damage mechanism exemplar (Slice 2).
 * Full Hunter's Mark target-tracking and concentration are OUT OF SCOPE.
 *
 * Scenario REQ-ONHIT-RIDER-01.1 — rider_factory_produces_valid_nummod
 */
import { describe, it, expect } from 'vitest';
import { buildOnHitDamageRider } from './on-hit-damage-rider.js';
import type { EntityId } from '../types.js';
import type { ModifierInstanceId } from '../registry/types.js';

function eid(s: string): EntityId {
  return s as EntityId;
}

const ATTACKER_ID = eid('ranger-1');
const TARGET_ID = eid('goblin-1');

describe("buildOnHitDamageRider — REQ-ONHIT-RIDER-01: rider factory produces valid NumMod", () => {
  it(
    "returns exactly 1 ModifierInstance with kind='num', op='add', value='1d6', stat='damage', trigger='on-hit' — PHB p.251",
    () => {
      // PHB p.251 — Hunter's Mark: "+1d6 damage to the marked target on a hit".
      const instances = buildOnHitDamageRider(ATTACKER_ID, TARGET_ID, '1d6', "Hunter's Mark");

      expect(instances).toHaveLength(1);
      const inst = instances[0]!;

      // Def shape
      expect(inst.def.kind).toBe('num');
      expect((inst.def as { kind: 'num'; op: string }).op).toBe('add');
      expect((inst.def as { kind: 'num'; value: unknown }).value).toBe('1d6');
      expect((inst.def as { kind: 'num'; stat: string }).stat).toBe('damage');

      // Scope trigger
      expect(inst.scope.trigger).toBe('on-hit');

      // Label (provenance)
      expect(inst.label).toBe("Hunter's Mark");
    },
  );

  it("scope.target is axis='entities' with attackerId in ids (so registry.query({self:attackerId}) finds it)", () => {
    // The modifier is scoped to the attacker (ids=[attackerId]) so that
    // registry.query({trigger:'on-hit', self:attackerId, ...}) finds it at ON_HIT phase.
    // targetId is embedded in the instance id for bookkeeping only.
    const instances = buildOnHitDamageRider(ATTACKER_ID, TARGET_ID, '1d6', "Hunter's Mark");
    const inst = instances[0]!;

    expect(inst.scope.target.axis).toBe('entities');
    if (inst.scope.target.axis === 'entities') {
      expect(inst.scope.target.ids).toContain(ATTACKER_ID);
    }
  });

  it("scope.owner is attackerId", () => {
    const instances = buildOnHitDamageRider(ATTACKER_ID, TARGET_ID, '1d6', "Hunter's Mark");
    const inst = instances[0]!;
    expect(inst.scope.owner).toBe(ATTACKER_ID);
  });

  it("instance id is non-empty string", () => {
    const instances = buildOnHitDamageRider(ATTACKER_ID, TARGET_ID, '2d6', 'Test Rider');
    const inst = instances[0]!;
    expect(typeof inst.id).toBe('string');
    expect((inst.id as string).length).toBeGreaterThan(0);
  });

  it("factory accepts different dice expressions (e.g. '2d6')", () => {
    const instances = buildOnHitDamageRider(ATTACKER_ID, TARGET_ID, '2d6', 'Sneak Attack (exemplar)');
    const inst = instances[0]!;
    expect((inst.def as { kind: 'num'; value: unknown }).value).toBe('2d6');
    expect(inst.label).toBe('Sneak Attack (exemplar)');
  });
});
