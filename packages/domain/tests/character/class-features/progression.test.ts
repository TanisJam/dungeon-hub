import { describe, expect, it } from 'vitest';
import { resolveFeatureSlots } from '../../../src/character/class-features/progression.js';
import type { ClassFeatureSource } from '../../../src/character/class-features/types.js';

const FIGHTER: ClassFeatureSource = {
  optionalfeatureProgression: [
    {
      name: 'Fighting Style',
      featureType: ['FS:F'],
      progression: { '1': 1 },
    },
  ],
};

const BATTLE_MASTER: ClassFeatureSource = {
  optionalfeatureProgression: [
    {
      name: 'Maneuvers',
      featureType: ['MV:B'],
      progression: { '3': 3, '7': 5, '10': 7, '15': 9 },
    },
  ],
};

const WARLOCK: ClassFeatureSource = {
  optionalfeatureProgression: [
    {
      name: 'Eldritch Invocations',
      featureType: ['EI'],
      progression: { '2': 2, '5': 3, '7': 4, '9': 5, '12': 6, '15': 7, '18': 8 },
    },
  ],
};

describe('resolveFeatureSlots — single class progression', () => {
  it('Fighter L1: 1 slot de FS:F', () => {
    const slots = resolveFeatureSlots({ classData: FIGHTER, classLevel: 1 });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ name: 'Fighting Style', featureType: ['FS:F'], count: 1 });
  });

  it('Fighter L1 con Battle Master subclass: FS:F + MV:B', () => {
    const slots = resolveFeatureSlots({
      classData: FIGHTER,
      subclassData: BATTLE_MASTER,
      classLevel: 1,
    });
    // BM activa MV:B desde L3, así que a L1 solo está FS:F.
    expect(slots).toHaveLength(1);
    expect(slots[0]?.featureType).toEqual(['FS:F']);
  });

  it('Fighter L7 con Battle Master: 1 FS:F + 5 MV:B', () => {
    const slots = resolveFeatureSlots({
      classData: FIGHTER,
      subclassData: BATTLE_MASTER,
      classLevel: 7,
    });
    expect(slots).toHaveLength(2);
    const fs = slots.find((s) => s.featureType.includes('FS:F'));
    const mv = slots.find((s) => s.featureType.includes('MV:B'));
    expect(fs?.count).toBe(1);
    expect(mv?.count).toBe(5);
  });

  it('Warlock L5 → 3 invocations', () => {
    const slots = resolveFeatureSlots({ classData: WARLOCK, classLevel: 5 });
    expect(slots[0]?.featureType).toEqual(['EI']);
    expect(slots[0]?.count).toBe(3);
  });

  it('Warlock L1: sin invocations todavía (unlock L2)', () => {
    const slots = resolveFeatureSlots({ classData: WARLOCK, classLevel: 1 });
    expect(slots).toHaveLength(0);
  });

  it('Sin optionalfeatureProgression → sin slots', () => {
    const slots = resolveFeatureSlots({ classData: {}, classLevel: 10 });
    expect(slots).toHaveLength(0);
  });

  it('Highest applicable level: progression desordenada', () => {
    const PRESCIENT: ClassFeatureSource = {
      optionalfeatureProgression: [
        {
          name: 'Some',
          featureType: ['X'],
          progression: { '10': 5, '3': 2, '7': 3 },
        },
      ],
    };
    expect(resolveFeatureSlots({ classData: PRESCIENT, classLevel: 5 })[0]?.count).toBe(2);
    expect(resolveFeatureSlots({ classData: PRESCIENT, classLevel: 8 })[0]?.count).toBe(3);
    expect(resolveFeatureSlots({ classData: PRESCIENT, classLevel: 12 })[0]?.count).toBe(5);
  });
});
