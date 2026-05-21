import { describe, expect, it } from 'vitest';
import { validateClassFeaturePicks } from '../../../src/character/class-features/validate.js';
import type {
  OptionalFeatureLite,
  ResolvedSlot,
} from '../../../src/character/class-features/types.js';

const ARCHERY: OptionalFeatureLite = { slug: 'archery', source: 'PHB', featureType: ['FS:F', 'FS:R'] };
const DEFENSE: OptionalFeatureLite = { slug: 'defense', source: 'PHB', featureType: ['FS:F', 'FS:R'] };
const RIPOSTE: OptionalFeatureLite = { slug: 'riposte', source: 'PHB', featureType: ['MV:B'] };
const FEINTING_ATTACK: OptionalFeatureLite = { slug: 'feinting-attack', source: 'PHB', featureType: ['MV:B'] };
const PRECISION_ATTACK: OptionalFeatureLite = { slug: 'precision-attack', source: 'PHB', featureType: ['MV:B'] };
const ELDRITCH_BLAST: OptionalFeatureLite = { slug: 'eldritch-blast', source: 'PHB', featureType: ['EI'] };

const ALL_AVAIL = [ARCHERY, DEFENSE, RIPOSTE, FEINTING_ATTACK, PRECISION_ATTACK, ELDRITCH_BLAST];

const FIGHTER_L7_BM_SLOTS: ResolvedSlot[] = [
  { name: 'Fighting Style', featureType: ['FS:F'], count: 1 },
  { name: 'Maneuvers', featureType: ['MV:B'], count: 5 },
];

describe('validateClassFeaturePicks — happy path', () => {
  it('Fighter L1 BM L7: 1 FS:F + 5 MV:B', () => {
    const res = validateClassFeaturePicks({
      picks: {
        'FS:F': [{ slug: 'archery', source: 'PHB' }],
        'MV:B': [
          { slug: 'riposte', source: 'PHB' },
          { slug: 'feinting-attack', source: 'PHB' },
          { slug: 'precision-attack', source: 'PHB' },
          { slug: 'riposte', source: 'PHB' },
          { slug: 'feinting-attack', source: 'PHB' },
        ],
      },
      slots: FIGHTER_L7_BM_SLOTS,
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 7,
    });
    // dupes en MV:B → falla
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_DUPLICATE')).toBe(true);
  });

  it('Fighter L1 BM L7: 1 FS:F + 5 MV:B distintos → ok', () => {
    // necesito 5 features distintos de MV:B; tengo 3 únicos en el fixture.
    const MORE_MV = [
      ...ALL_AVAIL,
      { slug: 'parry', source: 'PHB', featureType: ['MV:B'] },
      { slug: 'sweeping-attack', source: 'PHB', featureType: ['MV:B'] },
    ];
    const res = validateClassFeaturePicks({
      picks: {
        'FS:F': [{ slug: 'archery', source: 'PHB' }],
        'MV:B': [
          { slug: 'riposte', source: 'PHB' },
          { slug: 'feinting-attack', source: 'PHB' },
          { slug: 'precision-attack', source: 'PHB' },
          { slug: 'parry', source: 'PHB' },
          { slug: 'sweeping-attack', source: 'PHB' },
        ],
      },
      slots: FIGHTER_L7_BM_SLOTS,
      available: MORE_MV,
      classSlug: 'fighter',
      classLevel: 7,
    });
    expect(res.ok).toBe(true);
  });
});

describe('validateClassFeaturePicks — errores', () => {
  it('cantidad incorrecta: 2 FS:F cuando slot pide 1', () => {
    const res = validateClassFeaturePicks({
      picks: {
        'FS:F': [
          { slug: 'archery', source: 'PHB' },
          { slug: 'defense', source: 'PHB' },
        ],
      },
      slots: [{ name: 'Fighting Style', featureType: ['FS:F'], count: 1 }],
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_COUNT_MISMATCH')).toBe(true);
  });

  it('featureType no permitido a este nivel (MV:B sin Battle Master)', () => {
    const res = validateClassFeaturePicks({
      picks: {
        'FS:F': [{ slug: 'archery', source: 'PHB' }],
        'MV:B': [{ slug: 'riposte', source: 'PHB' }],
      },
      slots: [{ name: 'Fighting Style', featureType: ['FS:F'], count: 1 }],
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_TYPE_NOT_ON_CLASS_AT_LEVEL')).toBe(true);
  });

  it('feature con wrong type (picked como FS:F pero solo tiene MV:B)', () => {
    const res = validateClassFeaturePicks({
      picks: { 'FS:F': [{ slug: 'riposte', source: 'PHB' }] },
      slots: [{ name: 'Fighting Style', featureType: ['FS:F'], count: 1 }],
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_WRONG_TYPE')).toBe(true);
  });

  it('feature no en `available` (deshabilitado por profile)', () => {
    const res = validateClassFeaturePicks({
      picks: { 'FS:F': [{ slug: 'archery', source: 'PHB' }] },
      slots: [{ name: 'Fighting Style', featureType: ['FS:F'], count: 1 }],
      available: [], // ninguno disponible
      classSlug: 'fighter',
      classLevel: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_DISABLED_BY_RULES_PROFILE')).toBe(true);
  });

  it('falta de picks para un featureType esperado', () => {
    const res = validateClassFeaturePicks({
      picks: {}, // ni FS:F ni MV:B picadas
      slots: FIGHTER_L7_BM_SLOTS,
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 7,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.filter((i) => i.code === 'FEATURE_COUNT_MISMATCH')).toHaveLength(2);
  });

  it('duplicado en un mismo featureType', () => {
    const res = validateClassFeaturePicks({
      picks: {
        'MV:B': [
          { slug: 'riposte', source: 'PHB' },
          { slug: 'riposte', source: 'PHB' },
          { slug: 'riposte', source: 'PHB' },
        ],
      },
      slots: [{ name: 'Maneuvers', featureType: ['MV:B'], count: 3 }],
      available: ALL_AVAIL,
      classSlug: 'fighter',
      classLevel: 3,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.issues.some((i) => i.code === 'FEATURE_DUPLICATE')).toBe(true);
  });
});
