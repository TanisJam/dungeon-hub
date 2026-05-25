/** Promedio "fijo" por hit die (PHB rounded up). d6=4, d8=5, d10=6, d12=7. */
export const HIT_DIE_AVG: Readonly<Record<string, number>> = Object.freeze({
  d6: 4,
  d8: 5,
  d10: 6,
  d12: 7,
});

/** Máximo de un die. */
export function hitDieFaces(hitDie: string): number {
  const n = Number(hitDie.replace(/^d/, ''));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`hit die inválido: ${hitDie}`);
  return n;
}

export type HpMethod = 'roll' | 'average';

export type HpDeltaIssue =
  | { code: 'HP_ROLL_REQUIRED'; hitDie: string }
  | { code: 'HP_ROLL_OUT_OF_RANGE'; hitDie: string; roll: number; min: 1; max: number }
  | { code: 'INVALID_HP_METHOD'; method: string };

export type HpDeltaResult =
  | { ok: true; delta: number; rollUsed: number | null; method: HpMethod }
  | { ok: false; issues: HpDeltaIssue[] };

/**
 * Calcula el delta de HP máximo al subir un nivel (de L2 en adelante; el L1 se
 * computa en el sheet calculator). Sigue PHB:
 *
 *   - average: avg(die) + conMod
 *   - roll:    roll(die) + conMod  — `roll` debe ser 1..faces. Si no se provee,
 *              el caller debe rollear (server o cliente) ANTES de invocar y pasarlo.
 *
 * Mínimo HP ganado por nivel = 1 (CON mod muy negativo no puede llevarlo a 0).
 */
export function hpDeltaForLevelUp(args: {
  hitDie: string;
  conMod: number;
  method: HpMethod;
  roll?: number | null;
}): HpDeltaResult {
  const faces = hitDieFaces(args.hitDie);

  if (args.method === 'average') {
    const avg = HIT_DIE_AVG[args.hitDie] ?? Math.floor(faces / 2) + 1;
    const delta = Math.max(1, avg + args.conMod);
    return { ok: true, delta, rollUsed: null, method: 'average' };
  }

  if (args.method === 'roll') {
    if (args.roll == null) {
      return { ok: false, issues: [{ code: 'HP_ROLL_REQUIRED', hitDie: args.hitDie }] };
    }
    if (!Number.isInteger(args.roll) || args.roll < 1 || args.roll > faces) {
      return {
        ok: false,
        issues: [
          {
            code: 'HP_ROLL_OUT_OF_RANGE',
            hitDie: args.hitDie,
            roll: args.roll,
            min: 1,
            max: faces,
          },
        ],
      };
    }
    const delta = Math.max(1, args.roll + args.conMod);
    return { ok: true, delta, rollUsed: args.roll, method: 'roll' };
  }

  return { ok: false, issues: [{ code: 'INVALID_HP_METHOD', method: args.method }] };
}

/**
 * HP recuperados al gastar un hit die en un short rest.
 * PHB p.186 — "the character regains hit points equal to the total (minimum of 0)".
 * NOTA: el piso es 0, NO 1. El nivel-up usa min 1 — ver hpDeltaForLevelUp.
 */
export function hitDieHpGain(roll: number, conMod: number): number {
  return Math.max(0, roll + conMod);
}

/**
 * Genera un roll aleatorio para un hit die. El caller usa esto cuando el cliente
 * NO mandó `hpRoll` y quiere que el server tire. Usa crypto.getRandomValues
 * para que sea no-trivial de manipular.
 */
export function rollHitDie(hitDie: string): number {
  const faces = hitDieFaces(hitDie);
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0]! % faces) + 1;
}
