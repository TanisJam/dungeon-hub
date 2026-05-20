# IMPLEMENTATION_PLAN.md — Character Builder + Persistencia + Inventario

> **Scope:** Fase 1 del PRD (Character Builder con constraints + persistencia + inventario Fase A).
> **Fuente de constraints:** [`CONSTRAINTS.md`](./CONSTRAINTS.md) (decisiones cerradas).
> **Fuera de scope acá:** West Marches Manager, Discord Bot, Web frontend (Next.js). Se planifican aparte cuando lleguemos.

---

## 1. Stack confirmado

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Runtime | Node.js LTS 22 | |
| Lenguaje | TypeScript 5.x strict | `strict: true`, `noUncheckedIndexedAccess: true` |
| HTTP | Fastify 5 | Rápido, schemas con `@fastify/type-provider-typebox` o Zod |
| DB | PostgreSQL 16 (vía **Supabase self-hosted** en homelab) | JSONB para data flexible, columnas concretas para queries |
| ORM | **Drizzle ORM** | SQL-first, inference TS real, sin magia. Apunta al Postgres de Supabase con connection string |
| Validación | Zod | Para request bodies + parsing de data de 5etools |
| Auth | **Supabase Auth (GoTrue)** self-hosted | Discord OAuth listo desde el día 1. El backend valida el JWT de Supabase |
| Storage | Supabase Storage self-hosted | Para portraits de personajes |
| Dashboard | Supabase Studio self-hosted | Navegar/editar data manualmente |
| Infra | Docker Compose en homelab | docker-compose oficial de Supabase |
| Tests | Vitest | Constraint engine = 100% testeable (puro) |
| Package manager | pnpm + workspaces | |
| Lint/Format | ESLint + Prettier | |

> **Default propuesto = Drizzle.** Si preferís Prisma o Kysely, lo cambiamos. Es la decisión técnica más cara de revertir, por eso la marco.

---

## 2. Estructura del repo (monorepo)

```
dungeon_hub/
├── apps/
│   └── api/                     # Fastify backend (Fase 1 entera vive acá)
├── packages/
│   ├── domain/                  # Entities + constraint engine (pure TS, sin IO)
│   ├── compendium-import/       # Script + parsers de 5etools
│   └── shared-types/            # Tipos compartidos (DTOs, schemas Zod)
├── scripts/
│   └── import-5etools.ts        # Entrypoint del import
├── data/
│   └── 5etools/                 # Submódulo o gitignored, clonado del repo MSanteler/5e-Tools
├── CONSTRAINTS.md
├── PRD_DnD_WestMarches.md
├── IMPLEMENTATION_PLAN.md
└── pnpm-workspace.yaml
```

**Justificación arquitectónica:** clean/hexagonal. `packages/domain` no conoce Fastify, Drizzle, ni nada de IO. Es 100% lógica de negocio testeable con `vitest` sin levantar DB. La API lo consume; el bot futuro y la web también lo consumirán.

---

## 3. Capas (hexagonal)

```
┌────────────────────────────────────────────────────────┐
│  HTTP Layer (apps/api)                                 │
│  - Fastify routes                                      │
│  - Validación de request con Zod                       │
│  - Mapea request → use case → response                 │
└──────────────┬─────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────┐
│  Application Layer (apps/api/src/use-cases)            │
│  - Orquesta use cases del dominio                      │
│  - Maneja transacciones                                │
└──────────────┬─────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────┐
│  Domain Layer (packages/domain)                        │
│  - Entities: Character, Campaign, RulesProfile         │
│  - Constraint Engine (validators puros)                │
│  - Calculators (AC, HP, DC, etc.)                      │
│  - Use cases (create, equip, level-up, rest)           │
└──────────────┬─────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────┐
│  Infrastructure (apps/api/src/infra)                   │
│  - Repositories (Drizzle)                              │
│  - Auth providers                                      │
│  - Compendium readers                                  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Modelo de datos (schema PostgreSQL)

### Tablas operacionales

```sql
-- Usuarios
users (
  id              UUID PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  discord_id      TEXT UNIQUE NULL,
  role            TEXT NOT NULL DEFAULT 'player',  -- 'player' | 'gm' | 'admin'
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Campañas (Rules Profile vive acá)
campaigns (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL,
  gm_user_id      UUID NOT NULL REFERENCES users(id),
  rules_profile   JSONB NOT NULL,                  -- ver shape abajo
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Membresías (un user puede jugar en varias campañas)
campaign_members (
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,                   -- 'player' | 'gm'
  PRIMARY KEY (campaign_id, user_id)
)

-- Personajes
characters (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id),
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'active' | 'retired' | 'dead'
  data            JSONB NOT NULL,                  -- snapshot del personaje (ver shape abajo)
  inventory       JSONB NOT NULL DEFAULT '[]',     -- array Fase A
  xp              INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)

CREATE INDEX idx_characters_user ON characters(user_id);
CREATE INDEX idx_characters_campaign ON characters(campaign_id);
```

### Tablas de compendio (importadas desde 5etools)

Siguiendo el PRD — una tabla por tipo. Más type-safe y queries simples.

```sql
compendium_races        (id, slug, source, name, data JSONB, reprinted_as TEXT NULL)
compendium_classes      (id, slug, source, name, data JSONB)
compendium_subclasses   (id, slug, source, name, class_slug, data JSONB)
compendium_backgrounds  (id, slug, source, name, data JSONB)
compendium_spells       (id, slug, source, name, level, school, classes TEXT[], data JSONB)
compendium_items        (id, slug, source, name, type, weight NUMERIC, data JSONB)
compendium_feats        (id, slug, source, name, data JSONB, prerequisites JSONB)
compendium_monsters     (id, slug, source, name, cr NUMERIC, data JSONB)

-- Índices clave
CREATE UNIQUE INDEX ON compendium_spells (slug, source);
CREATE INDEX ON compendium_spells USING gin (to_tsvector('english', name || ' ' || (data->>'description')));
-- (similar para las otras tablas con búsqueda full-text)
```

### Shape de `campaigns.rules_profile`

```json
{
  "sources": {
    "PHB": true, "DMG": true, "XGE": true, "TCE": true,
    "MPMM": true, "VGM": true, "MTF": true, "SCAG": true,
    "FTD": true, "EGW": true,
    "MOT": false, "AAG": false, "SatO": false, "AI": false
  },
  "disabledEntities": {
    "races":   ["aasimar-vgm"],
    "items":   [],
    "spells":  [],
    "feats":   []
  },
  "variantRules": {
    "multiclassing": true,
    "feats": true,
    "variantHumanAndCustomLineage": true,
    "encumbranceVariant": false,
    "tashasCustomOrigin": false,
    "tashasOptionalClassFeatures": false
  },
  "statGeneration": {
    "standardArray": true,
    "pointBuy": true,
    "roll": true
  },
  "hpOnLevelUp": "player-choice"     // 'roll' | 'average' | 'player-choice'
}
```

### Shape de `characters.data`

```json
{
  "race":       { "slug": "elf",   "source": "PHB", "subrace": "high-elf" },
  "background": { "slug": "sage",  "source": "PHB" },
  "classes": [
    {
      "slug": "wizard", "source": "PHB",
      "level": 5,
      "subclass": { "slug": "school-of-evocation", "source": "PHB" },
      "hitDie": "d6"
    }
  ],
  "alignment": "CG",
  "baseStats": { "str": 8, "dex": 14, "con": 14, "int": 17, "wis": 12, "cha": 10 },
  "asisApplied": [
    { "source": "race", "str": 0, "dex": 0, "con": 0, "int": 2, "wis": 0, "cha": 0 },
    { "source": "subrace:high-elf", "str": 0, "dex": 1, "con": 0, "int": 0, "wis": 0, "cha": 0 }
  ],
  "hp":         { "max": 32, "current": 28, "temp": 0 },
  "hitDice":    { "d6": { "total": 5, "available": 5 } },
  "deathSaves": { "successes": 0, "failures": 0 },
  "spells": {
    "known":    ["fireball-PHB", "misty-step-PHB"],
    "prepared": ["fireball-PHB"],
    "slotsUsed":{ "1": 1, "2": 0, "3": 0 },
    "cantrips": ["fire-bolt-PHB", "mage-hand-PHB"]
  },
  "features":   ["arcane-recovery", "sculpt-spells"],
  "feats":      [],
  "proficiencies": {
    "skills":    { "proficient": ["arcana"], "expertise": [] },
    "tools":     [],
    "languages": [
      { "name": "common",   "source": "race" },
      { "name": "elvish",   "source": "race" },
      { "name": "draconic", "source": "background:sage" }
    ],
    "savingThrows": ["int", "wis"],
    "armor":   ["light"],
    "weapons": ["simple", "longsword", "shortsword"]
  },
  "currency":   { "cp": 0, "sp": 12, "ep": 0, "gp": 50, "pp": 0 },
  "inspiration":{ "has": false, "grantedBy": null },
  "notes":      "",
  "portrait":   null
}
```

### Shape de `characters.inventory` (Fase A)

```json
[
  {
    "instanceId": "uuid",
    "itemSlug":   "longsword",
    "source":     "PHB",
    "quantity":   1,
    "state":      "equipped",
    "attuned":    false,
    "customName": null,
    "notes":      ""
  }
]
```

---

## 5. Constraint Engine — diseño

Es la pieza central del Character Builder. Diseño funcional puro:

```
packages/domain/src/
├── entities/
│   ├── character.ts
│   ├── campaign.ts
│   ├── rules-profile.ts
│   └── compendium-types.ts
├── constraints/
│   ├── race.ts              # ASIs raciales (con Tasha's toggle)
│   ├── class.ts             # Hit die, saves, proficiencias
│   ├── multiclass.ts        # Prereqs PHB p.163
│   ├── feat.ts              # Prerequisites de feats
│   ├── spell.ts             # Class spell list, prep limits, slot table
│   ├── equipment.ts         # Proficiency warnings (no bloqueante)
│   ├── inventory.ts         # Attunement máx 3, peso, currency
│   └── stats.ts             # Point buy 27pts, standard array, roll
├── calculations/
│   ├── ability-modifiers.ts
│   ├── proficiency-bonus.ts
│   ├── armor-class.ts
│   ├── hit-points.ts
│   ├── spell-save-dc.ts
│   ├── spell-attack.ts
│   ├── passive-perception.ts
│   ├── carrying-capacity.ts
│   └── spell-slots.ts        # Tabla PHB + multiclass
└── use-cases/
    ├── create-character.ts
    ├── set-race.ts
    ├── set-class.ts
    ├── set-background.ts
    ├── set-stats.ts
    ├── equip-item.ts
    ├── attune-item.ts
    ├── add-item.ts
    ├── level-up.ts
    ├── short-rest.ts
    ├── long-rest.ts
    └── prepare-spells.ts
```

**Shape de cada constraint:**

```typescript
type ConstraintResult<T> = 
  | { ok: true; value: T }
  | { ok: false; errors: ValidationError[]; warnings?: ValidationWarning[] };

type Constraint<Input, Output> = (
  input: Input,
  rulesProfile: RulesProfile,
  compendium: CompendiumPort,
) => ConstraintResult<Output>;
```

**Por qué pura:** la lógica del reglamento se testea con tests unitarios sin DB ni HTTP. Un test típico:

```typescript
test('Paladin requires CHA 13 to multiclass into', () => {
  const char = makeCharacter({ classes: [{ slug: 'fighter', level: 3 }], baseStats: { ..., cha: 12 } });
  const result = addClassLevel(char, { slug: 'paladin' }, profile, compendium);
  expect(result.ok).toBe(false);
  expect(result.errors).toContainEqual({ code: 'MULTICLASS_PREREQ_FAILED', class: 'paladin', missing: 'cha>=13' });
});
```

---

## 6. Contratos API — Fase 1

```
# Auth (mínimo viable)
POST   /api/v1/auth/register
POST   /api/v1/auth/login           → { token }

# Campañas
POST   /api/v1/campaigns                          → crear (default Rules Profile)
GET    /api/v1/campaigns                          → listar las mías
GET    /api/v1/campaigns/:id
PATCH  /api/v1/campaigns/:id                      → editar Rules Profile (DM only)

# Compendium (filtrado por Rules Profile de la campaña)
GET    /api/v1/compendium/races?campaign=:id
GET    /api/v1/compendium/classes?campaign=:id
GET    /api/v1/compendium/classes/:slug/features?level=5
GET    /api/v1/compendium/subclasses?class=:slug&campaign=:id
GET    /api/v1/compendium/backgrounds?campaign=:id
GET    /api/v1/compendium/spells?class=:slug&level=:n&campaign=:id
GET    /api/v1/compendium/items?type=:t&campaign=:id
GET    /api/v1/compendium/feats?campaign=:id
GET    /api/v1/compendium/search?q=:q&campaign=:id

# Characters (CRUD)
POST   /api/v1/characters                         → crea draft vacío en una campaña
GET    /api/v1/characters
GET    /api/v1/characters/:id                     → raw data
GET    /api/v1/characters/:id/sheet               → con stats calculados
PATCH  /api/v1/characters/:id
DELETE /api/v1/characters/:id

# Character builder (step-by-step, valida cada paso)
PUT    /api/v1/characters/:id/race                → { slug, subrace, asiChoices? (Tasha's) }
PUT    /api/v1/characters/:id/class               → { slug, subclass?, level }
PUT    /api/v1/characters/:id/background          → { slug }
PUT    /api/v1/characters/:id/stats               → { method, scores }
PUT    /api/v1/characters/:id/starting-equipment  → { choiceA, choiceB, ... } (paquete)
PUT    /api/v1/characters/:id/spells              → { known[], prepared[], cantrips[] }
PUT    /api/v1/characters/:id/feats               → { feats[] }

# Inventario (Fase A)
POST   /api/v1/characters/:id/inventory           → add { itemSlug, quantity }
PATCH  /api/v1/characters/:id/inventory/:instanceId   → { quantity?, state?, customName?, notes? }
POST   /api/v1/characters/:id/inventory/:instanceId/attune     → toggle attunement
POST   /api/v1/characters/:id/inventory/:instanceId/equip      → toggle equipped
DELETE /api/v1/characters/:id/inventory/:instanceId

PATCH  /api/v1/characters/:id/currency            → { cp?, sp?, ep?, gp?, pp? }

# Level up + Rest
POST   /api/v1/characters/:id/level-up            → { classSlug, hpMethod, asiOrFeat, spellAdditions }
POST   /api/v1/characters/:id/rest/short          → { hitDiceToSpend: [{ die, count }] }
POST   /api/v1/characters/:id/rest/long

# HP changes
PATCH  /api/v1/characters/:id/hp                  → { delta }  o  { setCurrent, temp }
POST   /api/v1/characters/:id/death-save          → { type: 'success'|'failure'|'natural-20'|'natural-1' }

# Inspiration
POST   /api/v1/characters/:id/inspiration         → { grantedBy: userId }
DELETE /api/v1/characters/:id/inspiration         → consume
```

**Respuestas de validación:**
```json
// 400 Bad Request con detalle estructurado
{
  "error": "VALIDATION_FAILED",
  "issues": [
    { "code": "STAT_OVER_POINT_BUY_LIMIT", "field": "baseStats.str", "max": 15, "got": 16 },
    { "code": "MULTICLASS_PREREQ_FAILED", "class": "paladin", "missing": "cha>=13" }
  ],
  "warnings": [
    { "code": "EQUIP_NOT_PROFICIENT", "item": "plate-armor", "class": "wizard" }
  ]
}
```

---

## 7. Plan por fases con "Done criteria"

### Fase 1.0 — Foundation (3-4 días)

- pnpm workspace + apps/api + packages/domain + packages/compendium-import.
- TS strict, ESLint, Prettier, Vitest.
- Schema inicial DB (users, campaigns, campaign_members, characters).
- Migraciones con Drizzle Kit.
- JWT auth (register + login).
- Healthcheck.

**✅ Done cuando:** `pnpm dev` levanta el API, registro un user, hago login, creo una campaña con un Rules Profile default, listo mis campañas.

---

### Fase 1.1 — 5etools Import (4-5 días)

- Submodulo o clone de `MSanteler/5e-Tools` en `data/5etools`.
- Parsers en `packages/compendium-import` para: races, classes, subclasses, backgrounds, spells, items, feats.
- Resolución de `reprintedAs` → poblar columna `reprinted_as`.
- Comando `pnpm import:5etools`.
- Tests del parser contra ejemplos fijos.

**✅ Done cuando:** corro el import, la DB tiene >300 spells, >12 clases, >38 razas (con sus subrazas), >70 backgrounds, >1000 items, >200 feats. Reprints están linkeados.

---

### Fase 1.2 — Compendium API (2-3 días)

- Endpoints GET `/compendium/*` con filtrado por `rules_profile` de la campaña.
- Filtros: source habilitada, entidad no en `disabledEntities`, filtros adicionales (class, level, school, etc.).
- Full-text search en `name + description`.
- Paginación con cursor.

**✅ Done cuando:** `/compendium/races?campaign=:id` solo devuelve razas habilitadas. `/compendium/spells?class=wizard&level=3` devuelve solo spells arcanas de nivel 3 disponibles para Wizard.

---

### Fase 1.3 — Character CRUD básico (2 días)

- POST/GET/PATCH/DELETE characters.
- Draft con `data` casi vacío.
- Sheet endpoint sin stats calculados todavía (echo de `data`).

**✅ Done cuando:** creo un personaje draft asociado a una campaña, lo edito, lo borro.

---

### Fase 1.4 — Constraint Engine v1 (5-7 días)

Implementar en `packages/domain` con tests primero:

- **Stats:** validar Standard Array, Point Buy (27 puntos, scores 8-15 pre-racial), Roll (acepta cualquier set tirado).
- **Race:** aplicar ASIs raciales. Si Tasha's Origin está on → mover libremente. Si MPMM → siempre floating.
- **Class:** aplicar proficiencias (armor, weapon, tool, save). Sumar hit die.
- **Background:** aplicar skill profs, languages, tool profs.
- **Multiclass:** validar prereqs tabla PHB p.163.
- **Feat:** validar prerequisites cuando se selecciona.
- **Equipment package:** asignar paquete de starting equipment de la clase elegida.

Endpoints `PUT /characters/:id/{race|class|background|stats|...}` cablean estas validaciones.

**✅ Done cuando:**
- Si pongo CHA 12 en un Paladin → rechaza.
- Si intento Point Buy con un score 16 → rechaza.
- Si Tasha's está on, un Half-Orc puede subir INT con sus ASIs raciales → válido.
- Si un Wizard intenta multiclass a Fighter sin STR 13 ni DEX 13 → rechaza.
- Si seleciono el feat `Heavy Armor Master` sin proficiencia en heavy armor → rechaza.

---

### Fase 1.5 — Stats calculados + sheet completa (3-4 días)

- Implementar calculators en `packages/domain/src/calculations`.
- Endpoint `GET /characters/:id/sheet` devuelve:
  - Modifiers de cada stat.
  - Proficiency bonus.
  - AC (con armadura + dex + shield).
  - HP max.
  - Hit dice por clase.
  - Spell save DC + spell attack bonus.
  - Passive Perception.
  - Initiative.
  - Saves + skills (con expertise duplicando bonus).
  - Carrying capacity.

**✅ Done cuando:** la sheet de un Wizard nivel 5 muestra: PB +3, AC 12 (mage armor + dex 14), HP 32, Spell DC 14, Spell Attack +6, etc., todo verificado a mano contra el PHB.

---

### Fase 1.6 — Inventario Fase A (3-4 días)

- Modelo flat en `characters.inventory`.
- POST add item, PATCH update, DELETE remove.
- Toggles equip / attune.
- Validaciones:
  - Attunement máx 3 (hard rule).
  - Carga > `STR × 15` → marca `over_encumbered: true` en la sheet (warning, no bloquea).
  - Equipar arma/armadura sin proficiencia → warning en respuesta, no bloquea.
- Currency: PATCH separado, sin conversión automática.

**✅ Done cuando:**
- Atunar un 4to ítem mágico → rechaza.
- Cargar peso > STR×15 → la sheet muestra `encumbrance.status: "over"`.
- Equipar plate armor como wizard → warning, queda equipado igual.
- Sumar y restar gp funciona.

---

### Fase 1.7 — Spellcasting completo (4-5 días)

- Calculator de spell slots (tabla PHB single class + tabla multiclass PHB p.165).
- Validación de spell preparation:
  - Wizard: `INT mod + level` preparados, lista limitada a su spellbook.
  - Cleric/Druid/Paladin: `mod + level` preparados, lista completa de la clase.
  - Sorcerer/Bard/Warlock/Ranger: spells known fijos, sin prep diaria.
- Cantrips known según clase + nivel.
- Endpoint `PUT /characters/:id/spells` valida límites.
- **Wizard spellbook como ítem:**
  - Al crear Wizard, se le agrega un item `spellbook` automáticamente.
  - Aprender un spell nuevo en el spellbook (fuera del level up) cuesta `50gp × nivel` y `2h × nivel`. Endpoint específico: `POST /characters/:id/spellbook/copy { spellSlug }` valida gold disponible.

**✅ Done cuando:**
- Un Wizard nivel 5 tiene slots [4,3,2,0,0,0,0,0,0].
- Preparar 1 spell más allá de `INT mod + nivel` → rechaza.
- Multiclass Wizard 3 / Cleric 2 calcula slots multiclass correctamente (4,2,0,...).
- Copiar un spell al spellbook resta 50gp × nivel y agrega el spell a la lista.

---

### Fase 1.8 — Level Up + Rests (3-4 días)

- `POST /characters/:id/level-up`:
  - Valida XP suficiente (tabla PHB p.15).
  - HP nuevo: `player-choice` → body `hpMethod: 'roll' | 'average'`.
  - Si nivel da subclass → exige selección.
  - Si nivel da ASI (4/8/12/16/19) y feats on → permite ASI o feat.
  - Si nivel da spells (Wizard: 2 spells nuevos gratis al spellbook) → exige selección.
  - Recalcula prof bonus.
- `POST /characters/:id/rest/short`:
  - Body: `hitDiceToSpend`.
  - Resta hit dice, suma `roll(die) + conMod` al HP por cada uno.
  - Recupera Warlock pact slots, features con uso "per short rest".
- `POST /characters/:id/rest/long`:
  - HP full, slots full, recover `floor(level/2)` hit dice, reset death saves, reset prepared spells.

**✅ Done cuando:**
- Subo Wizard 4 → 5: gana slot de nivel 3, 2 spells gratis al spellbook, +1 cantrip si toca, recalcula HP con el método elegido.
- Short rest gastando 2 hit dice cura HP correctamente.
- Long rest deja al personaje "fresco".

---

## 8. Resumen de tiempos

| Fase | Estimado |
|------|----------|
| 1.0 Foundation | 3-4 días |
| 1.1 5etools Import | 4-5 días |
| 1.2 Compendium API | 2-3 días |
| 1.3 Character CRUD | 2 días |
| 1.4 Constraint Engine v1 | 5-7 días |
| 1.5 Stats calculados | 3-4 días |
| 1.6 Inventario Fase A | 3-4 días |
| 1.7 Spellcasting | 4-5 días |
| 1.8 Level Up + Rests | 3-4 días |
| **Total Fase 1** | **~30-40 días de trabajo** |

> Estimaciones para un dev senior trabajando solo. Asumen que las decisiones del CONSTRAINTS.md no cambian a mitad de camino.

---

## 9. Decisiones técnicas — cerradas

1. ✅ **ORM = Drizzle.** SQL-first, sin magia, libre para queries complejas del constraint engine + compendio.
2. ✅ **Schema de compendio: una tabla por tipo** (siguiendo el PRD). Type safety y queries simples.
3. ✅ **Step-by-step endpoints del builder** (`PUT /race`, `PUT /class`, etc.). Validación incremental, encaja con wizard UI.
4. ✅ **Inventory en `characters.inventory` (columna JSONB)** para Fase A. Cuando entre Fase B (contenedores anidados, slots), se migra a tabla `character_items`.
5. ✅ **Auth = Supabase Auth (GoTrue) self-hosted.** Discord OAuth listo desde día 1. Backend valida JWT de Supabase. No JWT propio.
6. ✅ **Submódulo git de 5etools** en `data/5etools/`. Re-pull controlado, gitignore al usar solo metadata.
7. ✅ **Infra = Docker Compose en homelab.** Supabase + nuestro `apps/api` corren juntos en el homelab. Un solo `docker-compose up`.

## 10. Infraestructura — Homelab setup

```
homelab/
├── docker-compose.supabase.yml     # docker-compose oficial de Supabase
├── docker-compose.app.yml          # nuestro apps/api
└── .env                            # secrets (JWT secret, anon key, service role, DB password)
```

Servicios expuestos (ejemplo, ajustá puertos):
- Postgres → `:5432` (uso interno, no expuesto al LAN salvo para Drizzle Studio)
- GoTrue (Auth) → `:9999`
- Kong (API gateway de Supabase) → `:8000`
- Supabase Studio → `:3000`
- Nuestro API → `:4000`

Pre-requisitos pendientes de definir:
- [ ] ¿Dominio + reverse proxy (Traefik/Caddy) o acceso directo por IP del homelab?
- [ ] ¿Discord OAuth callback URL? (necesita ser accesible desde Discord para el flow)
- [ ] ¿Backups de Postgres? (`pg_dump` + cron, o `pgbackrest`)

---

*Este plan se actualiza a medida que avanzan las fases. Cuando una fase se cierra, se marca con ✅ y se anota la fecha + commit que la cerró.*
