import { EmbedBuilder } from 'discord.js';

export interface CharacterRow {
  id: string;
  campaignId: string;
  name: string;
  status: 'draft' | 'active' | 'retired' | 'dead' | 'pending_approval';
  xp: number;
  createdAt: string;
  updatedAt: string;
}

// Currency denomination keys (matches domain CURRENCY_KEYS)
export type CurrencyKey = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type Currency = Record<CurrencyKey, number>;

export interface EncumbranceView {
  weight: number;
  max: number;
  status: 'ok' | 'encumbered' | 'heavily-encumbered' | 'over';
  thresholds: { encumbered: number; heavily: number; max: number };
  speedPenalty: number;
  coinWeight: number;
}

export interface InventoryItem {
  instanceId: string;
  itemSlug: string;
  itemSource: string;
  quantity: number;
  state: 'equipped' | 'carried' | 'stowed';
  attuned: boolean;
  customName: string | null;
  notes: string;
  equipHand?: 'main' | 'off' | 'both' | null;
  charges?: number | null;
  containerId?: string | null;
}

export interface RecentGrant {
  id: string;
  eventType: 'item_grant' | 'gold_grant' | 'xp_award';
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface CharacterSheetResponse {
  character: { id: string; userId: string; worldId: string; status: string; xp: number };
  sheet: CharacterSheet;
  inventory: InventoryItem[];
}

interface CharacterSheet {
  identity: {
    name: string;
    totalLevel: number;
    classes: Array<{
      slug: string;
      source: string;
      level: number;
      hitDie: string;
      subclass: { slug: string; source: string } | null;
    }>;
    race: { slug: string; source: string } | null;
    subrace: { slug: string; source: string } | null;
    background: { slug: string; source: string } | null;
  };
  proficiencyBonus: number;
  abilityScores: Record<string, { score: number; modifier: number }>;
  savingThrows: Array<{ ability: string; modifier: number; proficient: boolean }>;
  skills: Array<{ name: string; ability: string; modifier: number; proficient: boolean; expertise: boolean }>;
  passivePerception: number;
  initiative: number;
  armorClass: { value: number; formula: string };
  hitPoints: { max: number; formula: string };
  hitDice: Record<string, number>;
  speed: { walk: number; fly?: number; swim?: number; climb?: number };
  size: string;
  carryingCapacity: number;
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  feats: Array<{ slug: string; source: string }>;
  breathWeapon: null | { damageType: string; area: string; saveDC: number; damageDice: string };
  darkvision: null | { feet: number; isSuperior: boolean };
  racialSpells: unknown[];
  racialTraits: unknown[];
  spellcasting: unknown[];
  currency: Currency;
  encumbrance: EncumbranceView;
  attunement: { used: number; max: number };
  spellSlots: {
    slots: readonly [number, number, number, number, number, number, number, number, number];
    pactMagic: { slotLevel: number; slotCount: number } | null;
    slotsUsed: readonly [number, number, number, number, number, number, number, number, number];
    pactSlotsUsed: number;
  };
  spellsByClass: unknown[];
  exhaustion: { level: number; effects: string[] };
  classFeatures: Record<string, unknown>;
  classResources: Record<string, unknown>;
  warnings: string[];
}

/** El current HP vive en character.data.hp, no en el sheet. Hace falta el detail. */
export interface CharacterDetail extends CharacterRow {
  userId: string;
  data: {
    hp?: { current: number; max: number; temp?: number };
    [k: string]: unknown;
  };
}

// --- Action response shapes (rest, hp delta) -------------------------------

interface HpState {
  current: number;
  max: number;
  temp: number;
}

export interface HpDeltaResponse {
  character: { id: string; name: string; data: { hp?: HpState } };
  hp: {
    before: { current: number; temp: number };
    after: HpState;
    delta: number;
    actualDamage: number;
    actualHeal: number;
    tempAbsorbed: number;
  };
}

export interface ShortRestResponse {
  character: { id: string; name: string };
  shortRest: {
    hpRecovered: number;
    rollsUsed: Record<string, number[]>;
    newHp: HpState;
  };
}

export interface LongRestResponse {
  character: { id: string; name: string };
  longRest: {
    hitDiceRecovered: number;
    deathSavesReset: boolean;
    exhaustionAfter: number;
    newHp: HpState;
    itemsRecharged: Array<{ instanceId: string; name?: string; before: number; after: number }>;
  };
}

const STATUS_BADGE: Record<CharacterRow['status'], string> = {
  draft: '📝 draft',
  active: '🟢 active',
  retired: '🪶 retired',
  dead: '💀 dead',
  pending_approval: '⏳ Pendiente',
};

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Returns "hace X minutos|horas|días" or "ahora" for a past ISO date string. */
export function relativeTime(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'ahora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} minuto${diffMin === 1 ? '' : 's'}`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs} hora${diffHrs === 1 ? '' : 's'}`;
  const diffDays = Math.floor(diffHrs / 24);
  return `hace ${diffDays} día${diffDays === 1 ? '' : 's'}`;
}

/** Maps a grant event to a human-readable Spanish label. */
export function humanLabel(event: RecentGrant): string {
  const p = event.payload;
  switch (event.eventType) {
    case 'gold_grant': {
      const amount = typeof p['amount'] === 'number' ? p['amount'] : '?';
      const denom = typeof p['denomination'] === 'string' ? p['denomination'] : 'gp';
      return `Recibiste ${amount} ${denom} del DM`;
    }
    case 'item_grant': {
      const name = typeof p['itemName'] === 'string' ? p['itemName']
        : typeof p['itemSlug'] === 'string' ? p['itemSlug']
        : 'un ítem';
      return `Recibiste "${name}" del DM`;
    }
    case 'xp_award': {
      const amount = typeof p['amount'] === 'number' ? p['amount'] : '?';
      return `Ganaste ${amount} XP`;
    }
  }
}

export function buildCharactersListEmbed(chars: CharacterRow[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Tus characters').setColor(0x2c3e50);
  if (chars.length === 0) {
    embed.setDescription('_No tenés ningún character creado. Pedile al GM o usá la web app._');
    return embed;
  }
  const lines = chars.map((c) => {
    return `**${c.name}** — ${STATUS_BADGE[c.status]} · ${c.xp} XP · \`${shortId(c.id)}\``;
  });
  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `${chars.length} character(s)` });
  return embed;
}

function hpBar(hp: HpState, width = 12): string {
  if (hp.max <= 0) return '';
  const filled = Math.round((hp.current / hp.max) * width);
  const empty = Math.max(0, width - filled);
  return `\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\``;
}

export function buildHpDeltaEmbed(res: HpDeltaResponse, note: string | null): EmbedBuilder {
  const { hp, character } = res;
  const isHeal = hp.delta > 0;
  const headerEmoji = isHeal ? '💚' : '🩸';
  const action = isHeal ? `+${hp.actualHeal} HP curados` : `${hp.actualDamage} damage`;
  const tempLine =
    hp.tempAbsorbed > 0 ? `\n🛡 ${hp.tempAbsorbed} HP temp absorbieron parte del daño` : '';

  // Color: rojo si quedó en 0, naranja si <25%, amarillo si <50%, verde si full.
  const ratio = hp.after.max > 0 ? hp.after.current / hp.after.max : 0;
  let color = 0x2ecc71;
  if (ratio === 0) color = 0xc0392b;
  else if (ratio < 0.25) color = 0xe67e22;
  else if (ratio < 0.5) color = 0xf1c40f;

  const downedLine = hp.after.current === 0 ? '\n⚠️ **El personaje cayó a 0 HP.**' : '';

  const embed = new EmbedBuilder()
    .setTitle(`${headerEmoji} ${character.name}`)
    .setDescription(
      `**${action}**${tempLine}${downedLine}\n\n` +
        `HP: **${hp.before.current}** → **${hp.after.current}** / ${hp.after.max}` +
        (hp.after.temp > 0 ? ` (+${hp.after.temp} temp)` : '') +
        `\n${hpBar(hp.after)}`,
    )
    .setColor(color);

  if (note) embed.addFields({ name: 'Nota', value: note });
  embed.setFooter({ text: `character ${shortId(character.id)}` });
  return embed;
}

export function buildShortRestEmbed(res: ShortRestResponse): EmbedBuilder {
  const { shortRest, character } = res;
  const lines: string[] = [];
  if (shortRest.hpRecovered > 0) {
    lines.push(`💚 Recuperaste **${shortRest.hpRecovered}** HP gastando hit dice.`);
  } else {
    lines.push('☕ Short rest sin gastar hit dice — recursos por short rest refrescados.');
  }
  lines.push(`\nHP: **${shortRest.newHp.current}** / ${shortRest.newHp.max}\n${hpBar(shortRest.newHp)}`);

  if (Object.keys(shortRest.rollsUsed).length > 0) {
    const rollLines = Object.entries(shortRest.rollsUsed)
      .map(([die, rolls]) => `${die}: ${rolls.join(', ')}`)
      .join(' · ');
    lines.push(`\nDados: ${rollLines}`);
  }

  return new EmbedBuilder()
    .setTitle(`☕ Short rest — ${character.name}`)
    .setDescription(lines.join('\n'))
    .setColor(0xf39c12)
    .setFooter({ text: `character ${shortId(character.id)}` });
}

export function buildLongRestEmbed(res: LongRestResponse): EmbedBuilder {
  const { longRest, character } = res;
  const lines: string[] = [
    `🌙 HP full: **${longRest.newHp.current}** / ${longRest.newHp.max}`,
    hpBar(longRest.newHp),
    '',
    `🎲 Hit dice recuperados: **${longRest.hitDiceRecovered}**`,
    `✨ Spell slots: full · Pact slots: full`,
  ];
  if (longRest.exhaustionAfter > 0) {
    lines.push(`😩 Exhaustion: nivel **${longRest.exhaustionAfter}** (bajaste 1)`);
  } else {
    lines.push('😌 Exhaustion: 0');
  }
  if (longRest.deathSavesReset) lines.push('💀 Death saves reseteados');
  if (longRest.itemsRecharged.length > 0) {
    const itemLines = longRest.itemsRecharged
      .slice(0, 5)
      .map((it) => `• ${it.name ?? it.instanceId.slice(0, 8)}: ${it.before} → ${it.after}`)
      .join('\n');
    lines.push(`\n🔋 Items recargados:\n${itemLines}`);
    if (longRest.itemsRecharged.length > 5) {
      lines.push(`_(+${longRest.itemsRecharged.length - 5} más)_`);
    }
  }

  return new EmbedBuilder()
    .setTitle(`🌙 Long rest — ${character.name}`)
    .setDescription(lines.join('\n'))
    .setColor(0x6c5ce7)
    .setFooter({ text: `character ${shortId(character.id)}` });
}

export function buildCharacterSheetEmbed(
  detail: CharacterDetail,
  sheetRes: CharacterSheetResponse,
  recentGrants?: ReadonlyArray<RecentGrant>,
): EmbedBuilder {
  const id = detail.id;
  const sheet = sheetRes.sheet;
  const identity = sheet.identity;

  const classLine = identity.classes
    .map((c) => `${titleCase(c.slug)} ${c.level}${c.subclass ? ` (${titleCase(c.subclass.slug)})` : ''}`)
    .join(' / ');
  const raceLine = identity.subrace
    ? `${titleCase(identity.subrace.slug)} ${titleCase(identity.race?.slug ?? '')}`
    : identity.race
      ? titleCase(identity.race.slug)
      : '—';

  const hp = detail.data.hp;
  const hpLine = hp
    ? `**${hp.current}** / ${hp.max}${hp.temp ? ` (+${hp.temp} temp)` : ''}`
    : `${sheet.hitPoints.max} (max)`;

  const embed = new EmbedBuilder()
    .setTitle(detail.name)
    .setDescription(
      `*${raceLine} · ${classLine} · Lvl ${identity.totalLevel}*\n` +
        `${STATUS_BADGE[detail.status]} · ${detail.xp} XP`,
    )
    .setColor(
      detail.status === 'dead' || detail.status === 'retired' ? 0x7f8c8d
      : detail.status === 'pending_approval' ? 0xe6a942
      : 0xe67e22,
    );

  // ---- Combat stats inline ----
  embed.addFields(
    { name: '❤️ HP', value: hpLine, inline: true },
    { name: '🛡 AC', value: `${sheet.armorClass.value}`, inline: true },
    { name: '⚡ Init', value: formatModifier(sheet.initiative), inline: true },
  );

  // ---- Ability scores compactos ----
  const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha']
    .map((a) => {
      const sc = sheet.abilityScores[a];
      if (!sc) return '';
      return `**${a.toUpperCase()}** ${sc.score} (${formatModifier(sc.modifier)})`;
    })
    .filter(Boolean)
    .join(' · ');
  embed.addFields({ name: 'Abilities', value: abilities });

  // ---- Saving throws (solo los proficient + bonus de los otros) ----
  const saves = sheet.savingThrows
    .map((s) => {
      const marker = s.proficient ? '●' : '○';
      return `${marker} ${s.ability.toUpperCase()} ${formatModifier(s.modifier)}`;
    })
    .join(' · ');
  embed.addFields({ name: 'Saves', value: saves });

  // ---- Speed + size ----
  const speedParts: string[] = [`${sheet.speed.walk} ft`];
  if (sheet.speed.fly) speedParts.push(`fly ${sheet.speed.fly}`);
  if (sheet.speed.swim) speedParts.push(`swim ${sheet.speed.swim}`);
  if (sheet.speed.climb) speedParts.push(`climb ${sheet.speed.climb}`);
  embed.addFields(
    { name: 'Speed', value: speedParts.join(', '), inline: true },
    { name: 'Size', value: titleCase(sheet.size), inline: true },
    { name: 'PB', value: formatModifier(sheet.proficiencyBonus), inline: true },
  );

  // ---- Spell slots (available = max - used, hide when all zero) ----
  const slotsLine = sheet.spellSlots.slots
    .map((maxCount, i) => {
      if (maxCount <= 0) return null;
      const used = sheet.spellSlots.slotsUsed[i] ?? 0;
      const available = Math.max(0, maxCount - used);
      return `L${i + 1} ${available}/${maxCount}`;
    })
    .filter(Boolean)
    .join(' · ');
  if (slotsLine) {
    embed.addFields({ name: '🔮 Spell Slots', value: slotsLine });
  }
  if (sheet.spellSlots.pactMagic) {
    const pm = sheet.spellSlots.pactMagic;
    const pactUsed = sheet.spellSlots.pactSlotsUsed;
    const pactAvailable = Math.max(0, pm.slotCount - pactUsed);
    embed.addFields({
      name: 'Pact Magic',
      value: `${pactAvailable}/${pm.slotCount} slots L${pm.slotLevel}`,
      inline: true,
    });
  }

  // ---- Currency (hide when all zero) ----
  const currency = sheet.currency;
  const currencyParts: string[] = [];
  if (currency.pp > 0) currencyParts.push(`${currency.pp} pp`);
  if (currency.gp > 0) currencyParts.push(`${currency.gp} gp`);
  if (currency.ep > 0) currencyParts.push(`${currency.ep} ep`);
  if (currency.sp > 0) currencyParts.push(`${currency.sp} sp`);
  if (currency.cp > 0) currencyParts.push(`${currency.cp} cp`);
  if (currencyParts.length > 0) {
    embed.addFields({ name: '💰 Monedas', value: currencyParts.join(' · ') });
  }

  // ---- Inventory summary (equipped items + encumbrance status) ----
  const inventory = sheetRes.inventory;
  const equipped = inventory.filter((it) => it.state === 'equipped');
  if (equipped.length > 0 || sheet.encumbrance.status !== 'ok') {
    const CAP = 5;
    const displayItems = equipped.slice(0, CAP).map((it) => it.customName ?? it.itemSlug);
    let invLine = displayItems.join(', ');
    if (equipped.length > CAP) invLine += ` _(+${equipped.length - CAP} más)_`;
    const encStatus = sheet.encumbrance.status;
    const encLabel = encStatus === 'ok' ? null
      : encStatus === 'encumbered' ? '⚠️ Encumbered'
      : encStatus === 'heavily-encumbered' ? '🔴 Heavily Encumbered'
      : '🚫 Overloaded';
    const invValue = [invLine, encLabel].filter(Boolean).join(' — ');
    const totalItems = inventory.length;
    embed.addFields({
      name: `🎒 Inventario (${totalItems} ítems, ${equipped.length} equipados)`,
      value: invValue || `${totalItems} ítems en total`,
    });
  }

  // ---- Top skills: proficient, sorted by modifier desc, cap 6 ----
  const topSkills = [...sheet.skills]
    .filter((s) => s.proficient || s.expertise)
    .sort((a, b) => b.modifier - a.modifier)
    .slice(0, 6)
    .map((s) => `${s.expertise ? '★' : '●'} ${s.name} ${formatModifier(s.modifier)}`);
  if (topSkills.length > 0) {
    embed.addFields({ name: '🎯 Top Skills', value: topSkills.join(' · ') });
  }

  // ---- Exhaustion (si activo) ----
  if (sheet.exhaustion.level > 0) {
    embed.addFields({
      name: '⚠️ Exhaustion',
      value: `Level ${sheet.exhaustion.level} — ${sheet.exhaustion.effects.join(', ')}`,
    });
  }

  // ---- Recent grants (best-effort — shown when provided) ----
  if (recentGrants && recentGrants.length > 0) {
    const grantLines = recentGrants
      .slice(0, 3)
      .map((g) => `• ${humanLabel(g)} _(${relativeTime(g.occurredAt)})_`);
    embed.addFields({ name: '🎁 Últimas recompensas', value: grantLines.join('\n') });
  }

  embed.setFooter({ text: `character ${shortId(id)} · PP ${sheet.passivePerception}` });
  return embed;
}
