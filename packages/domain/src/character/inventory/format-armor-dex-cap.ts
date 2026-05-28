/**
 * formatArmorDexCap — pure domain function.
 *
 * Reqs: FADC-CAP-01 (spec #1070)
 * Design: DB3 (design #1071)
 *
 * PHB p.144-145 — Armor table:
 *   Light Armor (LA):  "add your Dexterity modifier" — no cap
 *   Medium Armor (MA): "add your Dexterity modifier, up to a maximum of +2"
 *   Heavy Armor (HA):  "you don't add your Dexterity modifier to the AC number"
 *   Shield (S):        flat AC bonus; DEX still applies to unarmored/base AC
 *
 * Returns a human-readable DEX-cap formula string for display in the
 * armor detail sheet. Returns empty string for unknown or null category.
 */
export function formatArmorDexCap(category: 'LA' | 'MA' | 'HA' | 'S' | string | null): string {
  switch (category) {
    case 'LA':
      // PHB p.145: Light Armor — full DEX modifier added, no cap.
      return '+ mod. Destreza';
    case 'MA':
      // PHB p.145: Medium Armor — DEX capped at +2.
      return '+ DEX (máx +2)';
    case 'HA':
      // PHB p.145: Heavy Armor — DEX not added to AC.
      return 'sin Destreza';
    case 'S':
      // PHB p.144: Shield adds flat +2 AC; DEX applies to base unarmored AC.
      return '+ mod. Destreza';
    default:
      return '';
  }
}
