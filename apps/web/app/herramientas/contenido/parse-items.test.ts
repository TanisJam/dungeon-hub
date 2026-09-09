/**
 * parseHomebrewItemsJson — Custom content via JSON upload, items only
 * (MVP #3.8, DEC-1). Pure parse/validate logic for the DM-pasted textarea.
 *
 * afterEach(cleanup) is already global (apps/web/vitest.setup.ts) — not
 * re-added here (no DOM rendering in this file anyway).
 */
import { describe, expect, it } from 'vitest';
import { parseHomebrewItemsJson, HOMEBREW_JSON_EXAMPLE } from './parse-items';

describe('parseHomebrewItemsJson', () => {
  it('parses a valid array of items with all optional fields', () => {
    const result = parseHomebrewItemsJson(
      JSON.stringify([
        { name: 'Espada del Alba', type: 'M', weight: 3, data: { rarity: 'rare' } },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items).toEqual([
      { name: 'Espada del Alba', type: 'M', weight: 3, data: { rarity: 'rare' } },
    ]);
  });

  it('parses an item with only the required "name" field', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'Piedra Rara' }]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items).toEqual([{ name: 'Piedra Rara' }]);
  });

  it('empty/whitespace input → friendly Spanish error, never throws', () => {
    const result = parseHomebrewItemsJson('   ');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('Pegá un array JSON');
  });

  it('invalid JSON → friendly Spanish error, never throws', () => {
    const result = parseHomebrewItemsJson('{ not valid json');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toBe('El texto no es JSON válido. Revisá comas, comillas y corchetes.');
  });

  it('valid JSON but not an array (e.g. a bare object) → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify({ name: 'Not an array' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('array de items');
  });

  it('empty array → friendly error', () => {
    const result = parseHomebrewItemsJson('[]');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('vacío');
  });

  it('more than 200 items → friendly error naming the max', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ name: `Item ${i}` }));
    const result = parseHomebrewItemsJson(JSON.stringify(items));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('201');
    expect(result.error).toContain('200');
  });

  it('item missing "name" → friendly error naming the item index', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ type: 'M' }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('item #1');
    expect(result.error).toContain('name');
  });

  it('item with an empty "name" string → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: '   ' }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('item #1');
  });

  it('item with "name" over 120 chars → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'a'.repeat(121) }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('120');
  });

  it('item with wrong "type" type → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'X', type: 42 }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('"type"');
  });

  it('item with a negative "weight" → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'X', weight: -1 }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('"weight"');
  });

  it('item with a non-object "data" → friendly error', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'X', data: 'nope' }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('"data"');
  });

  it('a non-object item in the array (e.g. a string) → friendly error naming the index', () => {
    const result = parseHomebrewItemsJson(JSON.stringify([{ name: 'ok' }, 'not-an-object']));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('item #2');
  });

  it('HOMEBREW_JSON_EXAMPLE itself parses successfully (keeps the on-page example valid)', () => {
    const result = parseHomebrewItemsJson(HOMEBREW_JSON_EXAMPLE);
    expect(result.ok).toBe(true);
  });
});
