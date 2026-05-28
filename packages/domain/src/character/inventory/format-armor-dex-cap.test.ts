/**
 * TDD tests for formatArmorDexCap — STRICT TDD (RED first).
 *
 * Reqs: FADC-CAP-01 (spec #1070)
 *
 * PHB p.144-145 — Armor table:
 *   Light Armor: "add your Dexterity modifier to the base number from your armor type"
 *   Medium Armor: "add your Dexterity modifier, up to a maximum of +2"
 *   Heavy Armor: "you don't add your Dexterity modifier to the AC number"
 *   Shield: flat +2 bonus, no DEX modifier to AC
 */
import { describe, it, expect } from 'vitest';
import { formatArmorDexCap } from './format-armor-dex-cap.js';

describe('formatArmorDexCap — FADC-CAP-01: armor dex-cap formula string', () => {
  it('light armor returns uncapped DEX string (PHB p.145)', () => {
    // PHB p.145 Light Armor: no cap on DEX modifier.
    expect(formatArmorDexCap('LA')).toBe('+ mod. Destreza');
  });

  it('medium armor returns capped DEX string (PHB p.145)', () => {
    // PHB p.145 Medium Armor: "up to a maximum of +2"
    expect(formatArmorDexCap('MA')).toBe('+ DEX (máx +2)');
  });

  it('heavy armor returns no-DEX string (PHB p.145)', () => {
    // PHB p.145 Heavy Armor: "you don't add your Dexterity modifier"
    expect(formatArmorDexCap('HA')).toBe('sin Destreza');
  });

  it('shield returns uncapped DEX string (PHB p.149 — shield adds flat +2 bonus)', () => {
    // PHB p.144: shield adds +2 AC flat; DEX still applies to the base unarmored AC
    expect(formatArmorDexCap('S')).toBe('+ mod. Destreza');
  });

  it('null input returns empty string (no armor equipped)', () => {
    expect(formatArmorDexCap(null)).toBe('');
  });

  it('unknown category returns empty string (defensive fallback)', () => {
    expect(formatArmorDexCap('XX')).toBe('');
  });
});
