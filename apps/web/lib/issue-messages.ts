// Maps validation issue codes coming from the API into friendly ES messages.
// Used by the wizard server actions so the user sees prose instead of codes
// like "Validation failed: POINT_BUY_INVALID_TOTAL".

const ABILITY_ES: Record<string, string> = {
  str: 'Fuerza',
  dex: 'Destreza',
  con: 'Constitución',
  int: 'Inteligencia',
  wis: 'Sabiduría',
  cha: 'Carisma',
};

type Issue = { code: string; note?: string } & Record<string, unknown>;

function ability(key: unknown): string {
  if (typeof key !== 'string') return String(key);
  return ABILITY_ES[key.toLowerCase()] ?? key.toUpperCase();
}

function num(v: unknown): string {
  return typeof v === 'number' ? String(v) : '?';
}

function describe(i: Issue): string {
  switch (i.code) {
    // ── Stats ──────────────────────────────────────────────────────────
    case 'STAT_METHOD_NOT_ALLOWED':
      return 'Ese método de generación de atributos no está permitido para esta partida.';
    case 'STANDARD_ARRAY_MISMATCH':
      return 'Los valores no coinciden con el array estándar (15, 14, 13, 12, 10, 8).';
    case 'POINT_BUY_SCORE_OUT_OF_RANGE':
      return `${ability(i.key)} fuera de rango (${num(i.min)}–${num(i.max)} en Point Buy).`;
    case 'POINT_BUY_INVALID_TOTAL': {
      const cost = num(i.cost);
      const budget = num(i.budget);
      return `Te quedan puntos por gastar o te pasaste: usaste ${cost}/${budget} puntos.`;
    }
    case 'STAT_OUT_OF_RANGE':
      return `${ability(i.key)} fuera de rango (${num(i.min)}–${num(i.max)}).`;

    // ── Race / ASI ─────────────────────────────────────────────────────
    case 'RACE_DISABLED':
      return 'Ese linaje no está habilitado para esta partida.';
    case 'SUBRACE_DISABLED':
      return 'Ese sublinaje no está habilitado para esta partida.';
    case 'SUBRACE_DOES_NOT_BELONG_TO_RACE':
      return 'El sublinaje no pertenece al linaje elegido.';
    case 'RACE_CHOOSE_SHAPE_UNSUPPORTED':
      return 'La forma de elección de ese linaje todavía no está soportada.';
    case 'ASI_REQUIRED':
      return 'Faltan asignar los incrementos de atributo del linaje.';
    case 'ASI_UNKNOWN_ABILITY':
      return `Atributo desconocido en los incrementos: ${ability(i.ability)}.`;
    case 'ASI_DUPLICATE_ABILITY':
      return `${ability(i.ability)} aparece dos veces en los incrementos.`;
    case 'ASI_MISMATCH':
      return 'Los incrementos de atributo no coinciden con lo que ofrece el linaje.';
    case 'RACE_ASI_CHOOSE_WRONG_COUNT':
      return 'Elegiste una cantidad incorrecta de atributos para el incremento.';
    case 'RACE_LANGUAGE_COUNT_MISMATCH': {
      const exp = num(i.expectedCount);
      const got = num(i.gotCount);
      return `Elegí ${exp} idioma${exp === '1' ? '' : 's'} del linaje (elegiste ${got}).`;
    }
    case 'RACE_LANGUAGE_DUPLICATE':
      return `El idioma "${String(i.language ?? '')}" está duplicado o ya lo otorga tu linaje.`;

    // ── Class ──────────────────────────────────────────────────────────
    case 'CLASS_DISABLED':
      return 'Esa clase no está habilitada para esta partida.';
    case 'CLASS_NOT_FOUND':
      return 'No encontré esa clase.';
    case 'LEVEL_OUT_OF_RANGE':
      return `Nivel fuera de rango (${num(i.min)}–${num(i.max)}).`;
    case 'SUBCLASS_REQUIRED':
      return 'Elegí una subclase para esta clase.';
    case 'SUBCLASS_NOT_YET_AVAILABLE':
      return 'Todavía no tenés el nivel para elegir subclase.';
    case 'SUBCLASS_DISABLED':
      return 'Esa subclase no está habilitada para esta partida.';
    case 'SUBCLASS_NOT_FOUND':
      return 'No encontré esa subclase.';
    case 'SUBCLASS_DOES_NOT_BELONG_TO_CLASS':
      return 'La subclase no pertenece a la clase elegida.';
    case 'SKILL_CHOICES_REQUIRED':
      return 'Elegí las habilidades de tu clase.';
    case 'SKILL_DUPLICATE':
      return `La habilidad "${String(i.skill ?? '')}" está duplicada.`;
    case 'SKILL_NOT_IN_CLASS_LIST':
      return `La habilidad "${String(i.skill ?? '')}" no está en la lista de tu clase.`;

    // ── Spells ─────────────────────────────────────────────────────────
    case 'CLASS_NOT_CASTER':
      return `Tu clase (${String(i.classSlug ?? '')}) no tiene hechizos.`;
    case 'SPELL_NOT_FOUND':
      return `No encontré el hechizo "${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}".`;
    case 'SPELL_NOT_IN_CLASS_LIST':
      return `El hechizo "${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" no está en la lista de tu clase.`;
    case 'SPELL_LEVEL_TOO_HIGH':
      return `El hechizo "${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" es de nivel ${num(i.level)} (máximo ${num(i.max)}).`;
    case 'CANTRIP_EXPECTED':
      return `"${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" no es un cantrip (se esperaba un cantrip).`;
    case 'NOT_A_CANTRIP':
      return `"${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" no es un cantrip.`;
    case 'CANTRIPS_KNOWN_EXCEEDED':
      return `Demasiados cantrips: ${num(i.got)}/${num(i.max)}.`;
    case 'SPELLS_KNOWN_EXCEEDED':
      return `Demasiados hechizos conocidos: ${num(i.got)}/${num(i.max)}.`;
    case 'PREPARED_LIMIT_EXCEEDED':
      return `Demasiados hechizos preparados: ${num(i.got)}/${num(i.max)}.`;
    case 'PREPARED_NOT_IN_SPELLBOOK':
      return `"${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" no está en tu libro de hechizos.`;
    case 'KNOWN_NOT_ALLOWED':
      return `Tu clase (${String(i.classSlug ?? '')}) no usa hechizos conocidos: preparás de la lista completa.`;
    case 'PREPARED_NOT_ALLOWED':
      return `Tu clase (${String(i.classSlug ?? '')}) no prepara hechizos: los aprendés directamente.`;
    case 'DUPLICATE_SPELL':
      return `El hechizo "${String((i.spell as { slug?: string } | null)?.slug ?? i.slug ?? '')}" está duplicado en ${String(i.bucket ?? '')}.`;
    case 'CLASS_NOT_ON_CHARACTER':
      return `La clase "${String(i.classSlug ?? '')}" no está en este personaje.`;

    // ── Background ─────────────────────────────────────────────────────
    case 'BACKGROUND_DISABLED':
      return 'Ese trasfondo no está habilitado para esta partida.';
    case 'BACKGROUND_SKILL_CHOICES_REQUIRED': {
      const exp = num(i.expectedCount);
      const got = num(i.gotCount);
      return `Elegí ${exp} habilidad${exp === '1' ? '' : 'es'} del trasfondo (elegiste ${got}).`;
    }
    case 'BACKGROUND_SKILL_DUPLICATE':
      return `La habilidad "${String(i.skill ?? '')}" está duplicada en el trasfondo.`;
    case 'BACKGROUND_SKILL_NOT_ALLOWED':
      return `La habilidad "${String(i.skill ?? '')}" no está permitida por este trasfondo.`;
    case 'BACKGROUND_LANGUAGE_COUNT_MISMATCH': {
      const exp = num(i.expectedCount);
      const got = num(i.gotCount);
      return `Elegí ${exp} idioma${exp === '1' ? '' : 's'} del trasfondo (elegiste ${got}).`;
    }
    case 'BACKGROUND_LANGUAGE_DUPLICATE':
      return `El idioma "${String(i.language ?? '')}" está duplicado.`;

    default:
      return i.note ? `${i.code}: ${i.note}` : i.code;
  }
}

export function formatValidationIssues(issues: Issue[]): string {
  if (issues.length === 0) return 'No se pudo validar la información.';
  if (issues.length === 1) return describe(issues[0]);
  return issues.map(describe).join(' · ');
}
