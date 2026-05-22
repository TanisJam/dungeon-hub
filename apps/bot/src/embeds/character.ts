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
