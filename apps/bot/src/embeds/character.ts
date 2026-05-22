import { EmbedBuilder } from 'discord.js';

export interface CharacterRow {
  id: string;
  campaignId: string;
  name: string;
  status: 'draft' | 'active' | 'retired' | 'dead';
  xp: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSheetResponse {
  character: { id: string; userId: string; campaignId: string; status: string; xp: number };
  sheet: CharacterSheet;
}

interface CharacterSheet {
  identity: {
    name: string;
    totalLevel: number;
    classes: Array<{
      slug: string;
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
  speed: { walk: number; fly?: number; swim?: number; climb?: number };
  size: string;
  spellSlots: {
    slots: readonly number[];
    pactMagic: { slotLevel: number; slotCount: number } | null;
  };
  exhaustion: { level: number; effects: string[] };
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
  sheet: CharacterSheet,
): EmbedBuilder {
  const id = detail.id;
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
    .setColor(detail.status === 'dead' ? 0x7f8c8d : 0xe67e22);

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

  // ---- Skills proficient ----
  const profSkills = sheet.skills
    .filter((s) => s.proficient || s.expertise)
    .map((s) => `${s.expertise ? '★' : '●'} ${s.name} ${formatModifier(s.modifier)}`);
  if (profSkills.length > 0) {
    embed.addFields({ name: 'Skills (proficient)', value: profSkills.join(' · ') });
  }

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

  // ---- Spell slots (si tiene) ----
  const slotsLine = sheet.spellSlots.slots
    .map((count, i) => (count > 0 ? `L${i + 1}: ${count}` : null))
    .filter(Boolean)
    .join(' · ');
  if (slotsLine) {
    embed.addFields({ name: 'Spell Slots (max)', value: slotsLine });
  }
  if (sheet.spellSlots.pactMagic) {
    const pm = sheet.spellSlots.pactMagic;
    embed.addFields({
      name: 'Pact Magic',
      value: `${pm.slotCount} slots de L${pm.slotLevel}`,
      inline: true,
    });
  }

  // ---- Exhaustion (si activo) ----
  if (sheet.exhaustion.level > 0) {
    embed.addFields({
      name: '⚠️ Exhaustion',
      value: `Level ${sheet.exhaustion.level} — ${sheet.exhaustion.effects.join(', ')}`,
    });
  }

  embed.setFooter({ text: `character ${shortId(id)} · PP ${sheet.passivePerception}` });
  return embed;
}
