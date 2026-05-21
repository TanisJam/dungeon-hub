/**
 * Clases con la feature "Spellcasting" o equivalente (Pact Magic) según PHB
 * y expansiones core. Hardcoded — al final de cuentas la regla es canónica.
 *
 * NOTA: algunas (Eldritch Knight, Arcane Trickster, etc.) solo casean por
 * subclass — esas no las consideramos "spellcasting class" por defecto.
 * Si necesitamos granularidad subclass, lo expandimos.
 */
export const SPELLCASTING_CLASS_SLUGS: ReadonlySet<string> = new Set([
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
  'artificer',
]);

export function classGrantsSpellcasting(classSlug: string): boolean {
  return SPELLCASTING_CLASS_SLUGS.has(classSlug);
}
