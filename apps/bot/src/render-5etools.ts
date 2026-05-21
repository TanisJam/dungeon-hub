/**
 * 5etools usa un formato custom de inline tags en sus textos:
 *   "{@damage 8d6} fire damage", "{@condition prone}", "{@spell fireball}".
 *
 * Para Discord renderizamos los tags más comunes a markdown plano. Si aparece
 * un tag desconocido, lo dejamos pasar como texto entre llaves (mejor que
 * romper la respuesta).
 *
 * Refs: https://wiki.tercessuinotlim.com/index.php/5etools_Markup_Language
 */

const TAG_HANDLERS: Record<string, (rest: string) => string> = {
  // Tags donde solo nos interesa el primer pipe-segment
  damage: (r) => takeFirstSegment(r),
  dice: (r) => takeFirstSegment(r),
  scaledice: (r) => takeFirstSegment(r),
  scaledamage: (r) => takeFirstSegment(r),
  hit: (r) => `+${takeFirstSegment(r)}`,
  d20: (r) => takeFirstSegment(r),
  recharge: (r) => `(Recharge ${takeFirstSegment(r) || '6'})`,
  chance: (r) => `${takeFirstSegment(r)}%`,
  h: () => '*Hit:*',
  m: () => '*Miss:*',

  // Tags donde mostramos el texto opcional o el primer segment
  spell: (r) => `*${takeDisplay(r)}*`,
  item: (r) => `*${takeDisplay(r)}*`,
  creature: (r) => `*${takeDisplay(r)}*`,
  condition: (r) => `*${takeDisplay(r)}*`,
  skill: (r) => `*${takeDisplay(r)}*`,
  sense: (r) => `*${takeDisplay(r)}*`,
  feat: (r) => `*${takeDisplay(r)}*`,
  race: (r) => `*${takeDisplay(r)}*`,
  class: (r) => `*${takeDisplay(r)}*`,
  background: (r) => `*${takeDisplay(r)}*`,

  // Tags de DC + saving throws
  dc: (r) => `DC ${takeDisplay(r)}`,
  filter: (r) => takeDisplay(r),

  // Tags de meta (formato): mostramos el contenido sin marcar
  b: (r) => `**${takeDisplay(r)}**`,
  bold: (r) => `**${takeDisplay(r)}**`,
  i: (r) => `*${takeDisplay(r)}*`,
  italic: (r) => `*${takeDisplay(r)}*`,
  note: (r) => takeDisplay(r),
  atk: (r) => mapAttackTag(takeFirstSegment(r)),

  // Tags que no tienen contenido visible útil
  variantrule: (r) => takeDisplay(r),
  table: (r) => takeDisplay(r),
  book: (r) => takeDisplay(r),
  adventure: (r) => takeDisplay(r),
};

/**
 * Para `{@spell fireball}` → "fireball".
 * Para `{@spell fireball|XPHB|Fireball}` → "Fireball" (último segment si existe display).
 * En 5etools: el patrón es `{@tag arg|source|displayText}`.
 */
function takeDisplay(rest: string): string {
  const parts = rest.split('|');
  if (parts.length >= 3 && parts[2]) return parts[2];
  return parts[0] ?? '';
}

function takeFirstSegment(rest: string): string {
  return rest.split('|')[0] ?? '';
}

function mapAttackTag(code: string): string {
  // 5etools `{@atk mw}` = melee weapon, `rw` = ranged weapon, `ms` = melee spell, etc.
  const m: Record<string, string> = {
    mw: '*Melee Weapon Attack:*',
    rw: '*Ranged Weapon Attack:*',
    ms: '*Melee Spell Attack:*',
    rs: '*Ranged Spell Attack:*',
    mw_rw: '*Melee or Ranged Weapon Attack:*',
    ms_rs: '*Melee or Ranged Spell Attack:*',
  };
  return m[code] ?? `*${code}*`;
}

/**
 * Reemplaza `{@tag arg|source|display}` por el output del handler.
 * Tags desconocidos se reemplazan por su `display` o primer segment.
 */
export function renderInline(text: string): string {
  // El @ es opcional para algunos tags raros, pero los oficiales empiezan con @.
  return text.replace(/\{@(\w+)\s*([^}]*)\}/g, (_match, tag: string, rest: string) => {
    const handler = TAG_HANDLERS[tag.toLowerCase()];
    if (handler) return handler(rest);
    // Fallback: mostramos el primer segment o el display si está
    return takeDisplay(rest);
  });
}

/**
 * Entries en 5etools son `(string | object)[]`. Los objetos son bloques
 * tipados: `{type: "list", items: [...]}`, `{type: "entries", entries: [...]}`, etc.
 * Aplanamos a un array de strings (uno por párrafo) renderizando inline tags.
 *
 * Para el embed limitamos largo total para no pasar el cap de Discord (4096 chars).
 */
export function flattenEntries(entries: unknown, maxChars = 1800): string {
  const out: string[] = [];
  const queue: unknown[] = Array.isArray(entries) ? [...entries] : [entries];
  while (queue.length > 0) {
    const e = queue.shift();
    if (e == null) continue;
    if (typeof e === 'string') {
      out.push(renderInline(e));
      continue;
    }
    if (typeof e !== 'object') continue;
    const obj = e as Record<string, unknown>;
    const type = typeof obj['type'] === 'string' ? (obj['type'] as string) : undefined;

    if (type === 'list' && Array.isArray(obj['items'])) {
      for (const item of obj['items']) {
        if (typeof item === 'string') out.push(`• ${renderInline(item)}`);
        else queue.unshift(item);
      }
      continue;
    }
    if ((type === 'entries' || type === 'inset' || type === 'section') && Array.isArray(obj['entries'])) {
      if (typeof obj['name'] === 'string') out.push(`**${obj['name']}.**`);
      queue.unshift(...(obj['entries'] as unknown[]));
      continue;
    }
    if (type === 'table') {
      // Tablas son raras de renderizar bien en embed. Mostramos un placeholder.
      const cap = typeof obj['caption'] === 'string' ? obj['caption'] : 'table';
      out.push(`*(table: ${cap})*`);
      continue;
    }
    if (Array.isArray(obj['entries'])) {
      queue.unshift(...(obj['entries'] as unknown[]));
    }
  }

  const joined = out.join('\n\n');
  if (joined.length <= maxChars) return joined;
  return joined.slice(0, maxChars - 1).trimEnd() + '…';
}
