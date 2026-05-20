# PRD — Dungeon Hub
### Sistema privado de gestión de personajes D&D 5e y campaña West Marches

**Versión:** 1.0  
**Fecha:** Mayo 2026  
**Audiencia:** 5 jugadores + 1 DM  
**Clasificación:** Uso privado / comunidad cerrada

---

## 1. Visión del Producto

**Dungeon Hub** es una plataforma privada full-stack para un grupo de amigos que combina tres capas:

1. **Character Builder** — creación y gestión de personajes D&D 5e con toda la data de 5etools y constraints del reglamento correctamente aplicadas.
2. **API privada** — servicio REST consumible desde la web, bots de Discord, y cualquier cliente futuro.
3. **West Marches Manager** — herramientas para gestionar un mundo compartido con sesiones ad hoc, lore, hexcrawl, y progresión persistente.

El sistema **no requiere cuenta externa ni servicio de terceros** para funcionar. Todo corre en infraestructura propia.

---

## 2. Contexto y Motivación

Un grupo de 5 amigos necesita:

- Crear y guardar personajes con todas las reglas aplicadas correctamente (clases, subclases, multiclassing, feats, equipment constraints, spell slots).
- Consultar datos de D&D 5e desde Discord (bots que busquen hechizos, reglas, stat blocks).
- Gestionar una campaña West Marches: mundo persistente donde distintos subgrupos salen de aventura en fechas distintas, el mapa se va revelando, y los cambios en el mundo afectan futuras sesiones.

Las soluciones existentes (Nivel20, WestMarches.games, D&D Beyond) son públicas, tienen features innecesarias, dependen de servicios externos, o no tienen API abierta para bots.

---

## 3. Usuarios

| Rol | Descripción |
|-----|-------------|
| **Player** | Crea y gestiona sus personajes, consulta reglas, ve el estado del mundo. |
| **Game Master (DM)** | Todo lo anterior + gestiona sesiones, revela zonas del mapa, registra cambios en el mundo, accede a notas privadas. |
| **Bot** | Cliente de API que consulta datos de D&D y del estado del mundo desde Discord. |

---

## 4. Fuentes de Datos

### 4.1 Data de 5etools (self-hosted)

El repositorio MSanteler/5e-Tools contiene la data completa en `/data/*.json`:

| Archivo | Contenido |
|---------|-----------|
| `races.json` | Razas, subrazas, traits raciales |
| `classes.json` | Clases, subclases, features por nivel |
| `spells.json` | Todos los hechizos con componentes, escuelas, clases que los usan |
| `backgrounds.json` | Trasfondos con proficiencias y features |
| `items.json` | Equipo mundano y mágico con propiedades |
| `feats.json` | Feats con prerequisites |
| `bestiary-*.json` | Monstruos y stat blocks |
| `optionalfeatures.json` | Invocaciones, maneuvers, metamagic, etc. |

Esta data se importa una vez a la base de datos propia del proyecto. Se actualiza manualmente al hacer pull del repo.

### 4.2 Constraints del reglamento (implementación propia)

Las reglas se implementan como lógica de negocio en el backend, no como datos. Ejemplos críticos:

- Proficiencias de armadura y arma por clase (el Wizard no puede usar heavy armor).
- Spell slots por clase y nivel (tabla PHB).
- Multiclassing requirements (STR/DEX 13 para Fighter, CHA 13 para Paladin, etc.).
- ASI (Ability Score Improvements) a niveles específicos por clase.
- Subclass unlock levels (Barbarian elige Path en nivel 3, Wizard elige School en nivel 2).
- Spell preparation rules (Cleric/Paladin preparan por WIS/CHA + nivel, Wizard tiene spellbook).
- Feat prerequisites (ej: Heavily Armored requiere Medium Armor Proficiency).
- Carrying capacity (STR × 15 libras, encumbrance variant opcional).

---

## 5. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTES                             │
│  Web App (Next.js)    Discord Bot    Futuro cliente     │
└──────────┬───────────────────┬───────────────┬──────────┘
           │                   │               │
           └──────────┬────────┘               │
                      ▼                        │
┌─────────────────────────────────────────────────────────┐
│               API REST PRIVADA (Node.js / Fastify)      │
│                                                         │
│  /api/v1/characters     /api/v1/world                   │
│  /api/v1/compendium     /api/v1/sessions                │
│  /api/v1/auth           /api/v1/map                     │
│                                                         │
│  Auth: API Keys (bots) + JWT (web)                      │
└──────────┬──────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│              BASE DE DATOS (PostgreSQL)                  │
│                                                         │
│  users / characters / sessions / world_state            │
│  map_hexes / journal_entries / campaign_events          │
│  [Tablas de compendio importadas desde 5etools]         │
└─────────────────────────────────────────────────────────┘
```

### Stack tecnológico recomendado

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| API | Node.js + Fastify | Rápido, excelente soporte TypeScript, fácil de deployar |
| Base de datos | PostgreSQL | Relacional, robusto, JSON columns para data flexible |
| Web frontend | Next.js 14+ | SSR, App Router, fácil auth, Vercel-compatible |
| Bot | discord.js v14 | Estándar, slash commands, embeds ricos |
| Auth web | NextAuth.js | Simple para grupo pequeño, soporta credentials/Discord OAuth |
| Hosting | Railway / Render / VPS | Un solo servicio para API + DB |
| Datos 5etools | Script de importación | Corre una vez, popula PostgreSQL desde los JSON |

---

## 6. Módulos del Sistema

### 6.1 Compendium Module (datos de 5etools)

**Propósito:** Exponer toda la data de 5etools como endpoints REST propios.

**Endpoints:**
```
GET /api/v1/compendium/classes
GET /api/v1/compendium/classes/:id
GET /api/v1/compendium/classes/:id/features?level=5
GET /api/v1/compendium/races
GET /api/v1/compendium/races/:id
GET /api/v1/compendium/spells?class=wizard&level=3&school=evocation
GET /api/v1/compendium/spells/:slug
GET /api/v1/compendium/backgrounds
GET /api/v1/compendium/feats?prerequisite=str13
GET /api/v1/compendium/items?type=weapon&property=finesse
GET /api/v1/compendium/monsters/:slug
GET /api/v1/compendium/search?q=fireball
```

**Features:**
- Búsqueda full-text en nombre + descripción.
- Filtros combinables (clase, nivel, escuela, tipo de equipo, etc.).
- Paginación con cursor.
- Respuestas en inglés (data original de 5etools).

---

### 6.2 Character Module

**Propósito:** Crear, editar, y consultar personajes con todas las constraints del reglamento aplicadas.

#### 6.2.1 Character Builder Flow

```
1. Elegir Race         → aplica ASI raciales, traits, speed, darkvision, etc.
2. Elegir Class        → aplica hit die, saves, proficiencias de armadura/arma/herramienta
3. Elegir Background   → aplica skill proficiencies, languages, feature de trasfondo
4. Distribuir Stats    → Standard Array / Point Buy / Roll (4d6 drop lowest)
5. Elegir Subclass     → según nivel mínimo de la clase (ej: Nivel 1 para Cleric, Nivel 3 para Barbarian)
6. Elegir Spells       → solo spells disponibles para la clase, respetando slots y spell list
7. Elegir Equipment    → solo equipo que la clase puede usar (validación de proficiency)
8. Elegir Feats        → solo feats cuyo prerequisite cumple el personaje
9. Review & Save       → snapshot final con stats calculados
```

#### 6.2.2 Stats Calculados Automáticamente

- **AC** según armadura equipada + DEX modifier (o STR para ciertas armaduras) + shield.
- **HP** total según clase, CON modifier, y nivel.
- **Spell Save DC** = 8 + proficiency bonus + spellcasting ability modifier.
- **Spell Attack Bonus** = proficiency bonus + spellcasting ability modifier.
- **Passive Perception** = 10 + WIS modifier (+ proficiency si hay skill).
- **Initiative** = DEX modifier.
- **Proficiency Bonus** según nivel total del personaje.
- **Saving throws** según saves del clase.
- **Skills** con proficiency y expertise.
- **Carrying Capacity** = STR × 15 (con flag para encumbrance variant).

#### 6.2.3 Multiclassing

- Validar prerequisites (tabla PHB p.163).
- Merge de proficiencias según tabla de multiclassing.
- Spell slots combinados según tabla multiclassing (para spellcasters).
- Track de niveles por clase para features individuales.

#### 6.2.4 Endpoints de Characters

```
POST   /api/v1/characters              → crear personaje
GET    /api/v1/characters              → listar personajes del usuario
GET    /api/v1/characters/:id          → detalle completo
PATCH  /api/v1/characters/:id          → editar (level up, cambiar equipo, etc.)
DELETE /api/v1/characters/:id          → eliminar
GET    /api/v1/characters/:id/sheet    → ficha completa calculada (para renderizar)
POST   /api/v1/characters/:id/levelup  → avanzar nivel con validaciones
GET    /api/v1/characters/:id/spells   → lista de hechizos disponibles + slots usados
PATCH  /api/v1/characters/:id/hp       → modificar HP actual (daño / curación)
POST   /api/v1/characters/:id/rest     → short rest o long rest (recuperar recursos)
```

#### 6.2.5 Modelo de Datos (Character)

```json
{
  "id": "uuid",
  "userId": "uuid",
  "name": "Aldric Vane",
  "status": "active",
  "race": { "id": "elf", "subrace": "high-elf" },
  "classes": [
    { "classId": "wizard", "level": 5, "subclassId": "school-of-evocation", "hitDie": "d6" }
  ],
  "background": "sage",
  "alignment": "CG",
  "baseStats": { "str": 8, "dex": 14, "con": 14, "int": 17, "wis": 12, "cha": 10 },
  "hp": { "max": 32, "current": 28, "temp": 0 },
  "deathSaves": { "successes": 0, "failures": 0 },
  "equipment": {
    "armor": "mage-armor",
    "weapons": ["dagger", "quarterstaff"],
    "items": [],
    "currency": { "gp": 50, "sp": 12, "cp": 0 }
  },
  "spells": {
    "known": ["fireball", "misty-step", "shield"],
    "prepared": ["fireball", "shield"],
    "slots": { "1": { "total": 4, "used": 1 }, "3": { "total": 2, "used": 0 } },
    "cantrips": ["fire-bolt", "mage-hand", "prestidigitation"]
  },
  "features": ["arcane-recovery", "sculpt-spells"],
  "feats": [],
  "proficiencies": { "skills": ["arcana", "history"], "tools": [], "languages": ["common", "elvish", "draconic"] },
  "notes": "",
  "portrait": "url-optional",
  "xp": 6500,
  "sessionHistory": ["session-uuid-1", "session-uuid-2"]
}
```

---

### 6.3 West Marches Module

**Propósito:** Gestionar el mundo compartido, sesiones ad hoc, y la evolución del mundo.

#### 6.3.1 Conceptos West Marches

Un West Marches es una campaña sandbox donde:
- No hay sesión fija: cualquier subgrupo propone una aventura cuando quiere.
- El mundo es persistente: lo que pasa en una sesión afecta el mundo para todos.
- El mapa se revela progresivamente: solo se conoce lo que fue explorado.
- Varios PJs pueden existir pero solo un subgrupo activo por sesión.
- El DM puede ser múltiple (varios GMs en rotación).

#### 6.3.2 Submódulos

**A) Session Manager**

```
POST   /api/v1/sessions              → crear sesión (DM only)
GET    /api/v1/sessions              → listar sesiones (pasadas + próximas)
GET    /api/v1/sessions/:id          → detalle
PATCH  /api/v1/sessions/:id          → editar
POST   /api/v1/sessions/:id/join     → un jugador une su personaje a la sesión
POST   /api/v1/sessions/:id/complete → cerrar sesión + distribuir rewards
```

Estructura de una sesión:
```json
{
  "id": "uuid",
  "title": "Las Ruinas de Kelthara",
  "date": "2026-06-01T20:00:00Z",
  "status": "scheduled | active | completed | cancelled",
  "gmId": "user-uuid",
  "participants": [
    { "userId": "uuid", "characterId": "uuid" }
  ],
  "levelRequirements": { "min": 3, "max": 6 },
  "maxPlayers": 4,
  "location": "hex-id",
  "summary": "Los aventureros exploraron...",
  "rewards": {
    "xp": 1200,
    "gold": 150,
    "items": ["longsword-plus-1"]
  },
  "worldChanges": ["kelthara-ruins-cleared"]
}
```

**B) World State**

Registro de cambios en el mundo generados por sesiones. Permite que los jugadores (y el DM) vean el historial de cómo evolucionó el mundo.

```
GET    /api/v1/world/events           → línea de tiempo de eventos
POST   /api/v1/world/events           → registrar evento (DM only)
GET    /api/v1/world/factions         → facciones y su estado actual
PATCH  /api/v1/world/factions/:id     → actualizar reputación/estado
GET    /api/v1/world/npcs             → NPCs conocidos
POST   /api/v1/world/npcs             → agregar NPC
```

**C) Hexcrawl Map**

El mapa del mundo dividido en hexágonos. Cada hex tiene un estado (unexplored / known / cleared) y puede tener notas, rumores, y POIs (Points of Interest).

```
GET    /api/v1/map/hexes              → todos los hexes (solo los revelados para Players)
GET    /api/v1/map/hexes/:id          → detalle de un hex
PATCH  /api/v1/map/hexes/:id          → actualizar estado/notas (DM only)
GET    /api/v1/map/hexes/:id/pois     → puntos de interés del hex
POST   /api/v1/map/hexes/:id/pois     → agregar POI
```

Estructura de un hex:
```json
{
  "id": "hex-0304",
  "coordinates": { "q": 3, "r": 4 },
  "terrain": "forest | mountain | plains | swamp | desert | coast",
  "status": "unexplored | rumored | explored | cleared",
  "revealedInSession": "session-uuid",
  "name": "Bosque de Silverwood",
  "dmNotes": "Aquí vive un dragón verde (solo visible al DM)",
  "playerNotes": "Los aldeanos hablan de luces extrañas entre los árboles",
  "pois": [
    {
      "id": "poi-uuid",
      "name": "Ruinas de Kelthara",
      "status": "cleared",
      "description": "Una antigua fortaleza élfica ahora saqueada"
    }
  ]
}
```

**D) Journal / Lore**

Wiki interna del mundo donde el DM puede documentar historia, geografía, facciones, y rumores. Soporta visibilidad por rol (DM-only vs público).

```
GET    /api/v1/journal/entries        → entradas (filtradas por visibilidad del rol)
POST   /api/v1/journal/entries        → crear entrada (DM only)
PATCH  /api/v1/journal/entries/:id    → editar
GET    /api/v1/journal/entries/:id    → leer
```

**E) Reward Distribution**

Al cerrar una sesión, el DM distribuye XP, oro, e ítems a los personajes participantes. El sistema aplica automáticamente los cambios en los personajes.

```
POST /api/v1/sessions/:id/complete
Body: {
  "summary": "...",
  "worldChanges": ["event-slug"],
  "rewards": {
    "xpPerPlayer": 600,
    "goldPerPlayer": 75,
    "items": [{ "characterId": "uuid", "item": "ring-of-protection" }]
  }
}
```

Esto actualiza:
- XP de cada personaje participante.
- Alerta si algún personaje llega a un threshold de nivel.
- Registra ítems en el inventario.
- Guarda la sesión en el historial del personaje.

---

### 6.4 Auth Module

Para un grupo de 5 personas, auth simple con dos opciones:

**Opción A (recomendada): Discord OAuth**
- Los usuarios se logean con su cuenta de Discord.
- El DM asigna roles manualmente en la DB.
- El bot de Discord puede autenticarse con la misma cuenta.

**Opción B: Credentials simple**
- Usuario + contraseña para la web.
- API Keys para el bot.

**Roles del sistema:**
- `player` — puede crear/editar sus personajes, leer datos públicos del mundo.
- `gm` — todo lo anterior + gestionar sesiones, editar el mundo, ver notas DM-only.
- `bot` — acceso de solo lectura a compendium y world state, via API Key.

---

### 6.5 Discord Bot Module

El bot consume la API privada y expone comandos útiles en Discord.

**Slash Commands — Compendium:**

| Comando | Descripción |
|---------|-------------|
| `/spell fireball` | Muestra el bloque completo del hechizo |
| `/class wizard level:5` | Features del Wizard al nivel 5 |
| `/race elf subrace:high-elf` | Traits raciales |
| `/item longsword` | Stats y propiedades del ítem |
| `/monster goblin` | Stat block del monstruo |
| `/feat sharpshooter` | Descripción y prerequisite del feat |

**Slash Commands — Personajes:**

| Comando | Descripción |
|---------|-------------|
| `/character show` | Muestra tu personaje activo en un embed |
| `/character hp -5` | Aplica daño a tu personaje activo |
| `/character rest short` | Short rest (recupera hit dice) |
| `/character rest long` | Long rest (recupera todo) |
| `/character spells` | Lista tus hechizos y slots disponibles |

**Slash Commands — West Marches:**

| Comando | Descripción |
|---------|-------------|
| `/session list` | Próximas sesiones disponibles |
| `/session join [id]` | Unirse a una sesión con tu personaje |
| `/world events` | Últimos eventos del mundo |
| `/map reveal [hex]` | (DM only) Revela un hexágono |
| `/lore [término]` | Busca en el journal del mundo |

---

## 7. Modelo de Datos Completo

### Tablas principales

```sql
-- Usuarios
users (id, discord_id, username, role, created_at)

-- Personajes
characters (id, user_id, name, data JSONB, status, xp, created_at, updated_at)

-- Sesiones West Marches
sessions (id, title, date, status, gm_id, location_hex, summary, level_min, level_max, max_players)
session_participants (session_id, user_id, character_id)
session_rewards (session_id, character_id, xp, gold, items JSONB)

-- Mundo
world_events (id, session_id, title, description, date, visibility)
world_factions (id, name, description, status, relationship_to_party)
world_npcs (id, name, description, faction_id, status, notes_dm, notes_public)

-- Mapa
map_hexes (id, q, r, terrain, status, name, dm_notes, player_notes, revealed_session_id)
map_pois (id, hex_id, name, description, status, type)

-- Lore
journal_entries (id, title, content, category, visibility, created_by, created_at)

-- Compendio (importado desde 5etools)
compendium_spells (id, slug, name, level, school, classes, data JSONB)
compendium_classes (id, slug, name, data JSONB)
compendium_races (id, slug, name, data JSONB)
compendium_backgrounds (id, slug, name, data JSONB)
compendium_items (id, slug, name, type, data JSONB)
compendium_feats (id, slug, name, data JSONB)
compendium_monsters (id, slug, name, cr, data JSONB)
```

---

## 8. Script de Importación de 5etools

Un script Node.js que:
1. Lee los JSON del repo clonado de 5etools.
2. Normaliza y mapea los campos a las tablas del compendio.
3. Hace upsert en PostgreSQL.
4. Se puede re-ejecutar al actualizar 5etools.

```bash
# Uso
node scripts/import-5etools.js --source ./5etools/data --db postgres://...

# Output esperado
✓ Importados 316 hechizos
✓ Importadas 12 clases + 84 subclases
✓ Importadas 38 razas + 91 subrazas
✓ Importados 73 trasfondos
✓ Importados 1.200+ ítems
✓ Importados 234 feats
✓ Importados 760+ monstruos
```

---

## 9. Fases de Desarrollo

### Fase 1 — Core (2-3 semanas)
**Objetivo:** API funcional + character builder básico.

- Setup de repositorio monorepo (api/ + web/ + bot/).
- Configuración de PostgreSQL + schema inicial.
- Script de importación de 5etools.
- Endpoints de compendium (spells, classes, races).
- Character CRUD sin validaciones avanzadas.
- Auth básica (Discord OAuth o credentials).
- Web: listar personajes + character builder básico (race/class/background/stats).

### Fase 2 — Constraints & Character Sheet (2 semanas)
**Objetivo:** Todas las reglas de D&D 5e correctamente implementadas.

- Validaciones de equipment proficiency.
- Spell slot system completo.
- Multiclassing con prerequisites y merge de proficiencias.
- Feats con prerequisite check.
- Level up flow completo.
- Character Sheet render completo con stats calculados.

### Fase 3 — West Marches (2-3 semanas)
**Objetivo:** Gestión de campaña funcional.

- Session Manager (crear, listar, unirse, completar).
- World Events + Factions.
- Hexcrawl Map (hexes con reveal progresivo, POIs).
- Reward Distribution automática.
- Journal / Lore básico.

### Fase 4 — Discord Bot (1-2 semanas)
**Objetivo:** Bot funcional con comandos útiles.

- Setup discord.js + registro de slash commands.
- Comandos de compendium (spell, class, race, item, monster).
- Comandos de personaje (show, hp, rest).
- Comandos de West Marches (sessions, world, map).

### Fase 5 — Polish (1 semana)
- UI de hexcrawl map interactivo.
- Notificaciones de Discord al crear sesión, cerrar sesión, revelar hex.
- Export de personaje a PDF.
- Búsqueda global en compendium.

---

## 10. Consideraciones Técnicas

### Sobre los datos de 5etools
- El repo de 5etools se clona localmente y se importa a la DB. No se hacen requests a 5e.tools en runtime.
- Los datos son para uso privado del grupo. No se redistribuyen públicamente.
- La data incluye contenido con copyright de WotC (Xanathar's, Tasha's, etc.) que está bien para uso privado.

### Seguridad
- La API requiere auth en todos los endpoints (excepto health check).
- El bot usa API Keys, no credenciales de usuario.
- Los endpoints DM-only validan el rol en cada request.
- Datos del DM (hex dm_notes, journal DM-only) nunca se exponen a players.

### Performance para 5 usuarios
- Sin necesidad de caching complejo. Redis opcional en el futuro.
- PostgreSQL con índices en slug y búsqueda full-text (tsvector) en compendium.
- Hosting en Railway o Render es más que suficiente (~$5-10/mes).

### API Versioning
- Todos los endpoints bajo `/api/v1/`.
- Versionado para no romper el bot si cambia la API.

---

## 11. Out of Scope (V1)

Las siguientes features quedan fuera de esta versión:

- Virtual tabletop (mapa de combate, miniaturas). Para esto usar Foundry VTT.
- Dice roller integrado (usar dice bots de Discord).
- Sistema de iniciativa y combat tracker.
- Soporte para sistemas distintos a D&D 5e.
- Soporte para Homebrew content (puede agregarse en V2).
- App móvil nativa (la web es responsive).

---

## 12. Métricas de Éxito

Para un grupo de 5 personas, el éxito es cualitativo:

- Todos los jugadores pueden crear su personaje sin errores de reglas.
- El DM puede gestionar una sesión completa (crear → jugar → cerrar → rewards) sin salir del sistema.
- El bot responde consultas de hechizos/reglas en Discord en menos de 1 segundo.
- El mapa del mundo refleja fielmente lo explorado después de cada sesión.
- Ningún personaje termina con stats ilegales (over-encumbered sin saberlo, spells de clase incorrecta, multiclass sin prerequisites, etc.).

---

*Dungeon Hub — Hecho para aventureros, por aventureros.*
