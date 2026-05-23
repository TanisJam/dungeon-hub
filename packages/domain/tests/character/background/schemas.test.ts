import { describe, expect, it } from 'vitest';
import {
  CustomizationSchema,
  MixedPoolSelectionSchema,
  EquipmentSelectionSchema,
  FeatureSelectionSchema,
  AppliedBackgroundSchema,
  SetBackgroundBodyCustomizationSchema,
} from '../../../src/character/background/schemas.js';

// ── MixedPoolSelectionSchema ──────────────────────────────────────────────────

describe('MixedPoolSelectionSchema', () => {
  it('parses lang2 shape with 2 langs, 0 tools', () => {
    const result = MixedPoolSelectionSchema.safeParse({
      shape: 'lang2',
      langs: ['elvish', 'dwarvish'],
      tools: [],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shape).toBe('lang2');
    expect(result.data.langs).toHaveLength(2);
  });

  it('parses lang1tool1 shape', () => {
    const result = MixedPoolSelectionSchema.safeParse({
      shape: 'lang1tool1',
      langs: ['elvish'],
      tools: ['lute'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shape).toBe('lang1tool1');
  });

  it('parses tool2 shape with 2 tools, 0 langs', () => {
    const result = MixedPoolSelectionSchema.safeParse({
      shape: 'tool2',
      langs: [],
      tools: ['lute', 'drum'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shape).toBe('tool2');
    expect(result.data.tools).toHaveLength(2);
  });

  it('rejects invalid shape enum value', () => {
    const result = MixedPoolSelectionSchema.safeParse({
      shape: 'lang3tool0',
      langs: ['elvish'],
      tools: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing shape field', () => {
    const result = MixedPoolSelectionSchema.safeParse({
      langs: ['elvish'],
      tools: [],
    });
    expect(result.success).toBe(false);
  });
});

// ── EquipmentSelectionSchema ──────────────────────────────────────────────────

describe('EquipmentSelectionSchema', () => {
  it('parses kind:package with backgroundSlug + backgroundSource', () => {
    const result = EquipmentSelectionSchema.safeParse({
      kind: 'package',
      backgroundSlug: 'acolyte',
      backgroundSource: 'phb',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.kind).toBe('package');
    if (result.data.kind !== 'package') return;
    expect(result.data.backgroundSlug).toBe('acolyte');
  });

  it('parses kind:package with optional choiceSlot', () => {
    const result = EquipmentSelectionSchema.safeParse({
      kind: 'package',
      backgroundSlug: 'criminal',
      backgroundSource: 'phb',
      choiceSlot: 'a',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.kind !== 'package') return;
    expect(result.data.choiceSlot).toBe('a');
  });

  it('parses kind:coin with no other fields', () => {
    const result = EquipmentSelectionSchema.safeParse({ kind: 'coin' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.kind).toBe('coin');
  });

  it('rejects invalid kind value', () => {
    const result = EquipmentSelectionSchema.safeParse({ kind: 'gold' });
    expect(result.success).toBe(false);
  });

  it('rejects kind:package missing backgroundSlug', () => {
    const result = EquipmentSelectionSchema.safeParse({
      kind: 'package',
      backgroundSource: 'phb',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid choiceSlot value', () => {
    const result = EquipmentSelectionSchema.safeParse({
      kind: 'package',
      backgroundSlug: 'acolyte',
      backgroundSource: 'phb',
      choiceSlot: 'z',
    });
    expect(result.success).toBe(false);
  });
});

// ── FeatureSelectionSchema ────────────────────────────────────────────────────

describe('FeatureSelectionSchema', () => {
  it('parses a valid slug', () => {
    const result = FeatureSelectionSchema.safeParse({
      slug: 'acolyte-shelter-of-the-faithful',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('rejects empty slug string', () => {
    const result = FeatureSelectionSchema.safeParse({ slug: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing slug field', () => {
    const result = FeatureSelectionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── CustomizationSchema ───────────────────────────────────────────────────────

describe('CustomizationSchema', () => {
  it('parses full customization with all three axes', () => {
    const result = CustomizationSchema.safeParse({
      mixedPool: { shape: 'lang2', langs: ['elvish', 'draconic'], tools: [] },
      equipment: { kind: 'package', backgroundSlug: 'acolyte', backgroundSource: 'phb' },
      feature: { slug: 'acolyte-shelter-of-the-faithful' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mixedPool?.shape).toBe('lang2');
    expect(result.data.equipment?.kind).toBe('package');
    expect(result.data.feature?.slug).toBe('acolyte-shelter-of-the-faithful');
  });

  it('parses empty object — all axes optional', () => {
    const result = CustomizationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mixedPool).toBeUndefined();
    expect(result.data.equipment).toBeUndefined();
    expect(result.data.feature).toBeUndefined();
  });

  it('parses partial — mixedPool only', () => {
    const result = CustomizationSchema.safeParse({
      mixedPool: { shape: 'tool2', langs: [], tools: ['lute', 'drum'] },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mixedPool?.shape).toBe('tool2');
    expect(result.data.feature).toBeUndefined();
  });

  it('rejects invalid nested data (invalid shape enum)', () => {
    const result = CustomizationSchema.safeParse({
      mixedPool: { shape: 'invalid', langs: [], tools: [] },
    });
    expect(result.success).toBe(false);
  });
});

// ── AppliedBackgroundSchema ───────────────────────────────────────────────────

describe('AppliedBackgroundSchema', () => {
  it('parses legacy shape (no customization)', () => {
    const result = AppliedBackgroundSchema.safeParse({
      slug: 'acolyte',
      source: 'PHB',
      skills: ['insight', 'religion'],
      languages: ['draconic'],
      tools: [],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.customization).toBeUndefined();
  });

  it('parses full shape with customization', () => {
    const result = AppliedBackgroundSchema.safeParse({
      slug: 'custom',
      source: 'PHB',
      skills: ['perception', 'stealth'],
      languages: [],
      tools: [],
      customization: {
        mixedPool: { shape: 'lang2', langs: ['elvish', 'dwarvish'], tools: [] },
        equipment: { kind: 'coin' },
        feature: { slug: 'acolyte-shelter-of-the-faithful' },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.customization?.mixedPool?.shape).toBe('lang2');
  });

  it('rejects missing slug', () => {
    const result = AppliedBackgroundSchema.safeParse({
      source: 'PHB',
      skills: [],
      languages: [],
      tools: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty slug string', () => {
    const result = AppliedBackgroundSchema.safeParse({
      slug: '',
      source: 'PHB',
      skills: [],
      languages: [],
      tools: [],
    });
    expect(result.success).toBe(false);
  });
});

// ── SetBackgroundBodyCustomizationSchema ──────────────────────────────────────

describe('SetBackgroundBodyCustomizationSchema', () => {
  it('is the same schema as CustomizationSchema (identity check)', () => {
    // Both schemas accept the same inputs
    const payload = {
      mixedPool: { shape: 'tool2' as const, langs: [], tools: ['lute', 'drum'] },
      equipment: { kind: 'coin' as const },
    };
    expect(SetBackgroundBodyCustomizationSchema.safeParse(payload).success).toBe(true);
    expect(CustomizationSchema.safeParse(payload).success).toBe(true);
  });
});
