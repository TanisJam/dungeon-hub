# CONSTRAINTS.md — Decisiones abiertas de reglas D&D 5e

> **Propósito:** Catálogo de constraints del reglamento que el PRD no resuelve. Cada sección lista las opciones que dan las reglas oficiales y un campo **Decisión** que el equipo completa. Este documento se convierte en la spec del motor de validación del Character Builder.
>
> **Regla de oro:** No inventamos data de D&D. Cada opción referencia la fuente oficial (PHB, XGE, TCE, etc.).

---

## 0. Decisiones ya tomadas

| Tema | Decisión |
|------|----------|
| Edición base | **D&D 5e 2014** + todas las expansiones que soporte 5etools |
| Sources configurables | Sí, vía Rules Profile |
| Scope del Rules Profile | **Por campaña** (un perfil por mesa, lo setea el DM) |

---

## 1. Sources habilitadas (Rules Profile)

5etools etiqueta cada entidad con un `source`. El Rules Profile habilita/deshabilita cada source. Cuando una source está deshabilitada, su contenido no aparece en el compendio ni en el builder.

**Sources soportados por 5etools (selección relevante 2014):**

- [x] `PHB` — Player's Handbook (siempre on)
- [x] `DMG` — Dungeon Master's Guide
- [x] `XGE` — Xanathar's Guide to Everything
- [x] `TCE` — Tasha's Cauldron of Everything
- [x] `MTF` — Mordenkainen's Tome of Foes
- [x] `MPMM` — Mordenkainen Presents: Monsters of the Multiverse
- [x] `SCAG` — Sword Coast Adventurer's Guide
- [x] `FTD` — Fizban's Treasury of Dragons
- [x] `VGM` — Volo's Guide to Monsters
- [x] `EGW` — Explorer's Guide to Wildemount
- [ ] `MOT` — Mythic Odysseys of Theros
- [ ] `AAG` — Astral Adventurer's Guide
- [ ] `SatO` — Strixhaven: A Curriculum of Chaos
- [ ] `AI` — Acquisitions Incorporated

**Decisión — defaults del Rules Profile inicial:**
Cuáles vienen habilitadas out-of-the-box para una campaña nueva.

**Resolución (granularidad fina):** Importamos toda la data de todas las sources marcadas. El Rules Profile no solo activa/desactiva sources enteras, sino que permite **toggle a nivel de entidad individual** (raza, clase, subclase, ítem, etc.). Esto resuelve los conflictos de versiones duplicadas (ej: VGM Aasimar vs MPMM Aasimar — la campaña elige cuál usar).

Implicancia en el modelo del Rules Profile:
```json
{
  "sources": { "PHB": true, "MPMM": true, ... },
  "disabledEntities": {
    "races": ["aasimar-vgm", "tiefling-mtf"],
    "items": [],
    "spells": []
  }
}
```

---

## 2. Variant rules opcionales (PHB / DMG)

### 2.1 Multiclassing

- **Fuente:** PHB cap. 6, p.163.
- **Status oficial:** Opcional (el PHB lo marca como variant rule).
- Si está activo, requiere validar prerequisites (ej: Fighter requiere STR 13 o DEX 13).

**Decisión:**
- [x] Activo siempre
- [ ] Configurable en Rules Profile
- [ ] Desactivado

### 2.2 Feats

- **Fuente:** PHB p.165.
- **Status oficial:** Opcional. Si está activo, reemplaza ASI a niveles 4/8/12/16/19.

**Decisión:**
- [ ] Activo siempre
- [x] Configurable

### 2.3 Feat en nivel 1 (Variant Human / Custom Lineage)

- **Fuente:** PHB p.31 (Variant Human) y TCE p.8 (Custom Lineage).
- Variant Human requiere que Feats estén activos.

**Decisión:** ¿Permitir Variant Human / Custom Lineage cuando feats están on?
- Si, permitir

### 2.4 Encumbrance Variant

- **Fuente:** PHB p.176.
- **Default oficial:** Solo importa el límite máximo (`STR × 15`).
- **Variant:** Tres umbrales — Encumbered (`STR × 5`), Heavily Encumbered (`STR × 10`), Max (`STR × 15`).

**Decisión:**
- [x] Solo límite máximo (default)
- [ ] Variant con tres umbrales
- [ ] Configurable por campaña

### 2.5 Customizing Your Origin (Tasha's)

- **Fuente:** TCE p.8.
- Permite mover ASIs raciales libremente, cambiar idiomas y proficiencias raciales.

**Decisión:**
- [ ] Off (ASIs raciales fijos del PHB)
- [ ] On siempre
- [x] Configurable

**Aclaración importante:** El toggle aplica **solo a razas con ASIs fijos en su print original** (PHB, VGM, SCAG, MTF, etc.). Las razas de **MPMM y posteriores** ya están publicadas con ASIs flotantes — siempre usan floating, sin importar el toggle de Tasha's. Si está off → fixed ASIs para las viejas, floating para las nuevas (RAW). Si está on → floating para todas.

### 2.6 Optional Class Features (Tasha's)

- **Fuente:** TCE cap. 1.
- Reemplazos opcionales para features de clase (ej: Ranger sin Favored Enemy, Cleric con Harness Divine Power).

**Decisión:**
- [ ] Off
- [ ] On
- [x] Configurable

---

## 3. Generación de Stats

- **Fuente:** PHB p.13.
- Los tres métodos oficiales son:
  - **Standard Array:** 15, 14, 13, 12, 10, 8.
  - **Point Buy:** 27 puntos, scores 8–15 antes de modificadores raciales.
  - **Roll:** 4d6 keep highest 3, seis veces.

**Decisión:**
- [ ] Los 3 disponibles, el jugador elige
- [ ] Solo uno, definido por campaña
- [x] Configurable cuáles se permiten

---

## 4. Starting Equipment

- **Fuente:** PHB cap. 5, p.143.
- Cada clase ofrece **paquete fijo** (ej: "(a) chain mail or (b) leather armor, longbow, 20 arrows") **o tirar oro inicial** y comprar (ej: Fighter: 5d4 × 10 gp).

**Decisión:**
- [x] Solo paquete
- [ ] Solo gold roll
- [ ] Ambos (el jugador elige)

---

## 5. HP al subir de nivel

- **Fuente:** PHB p.15.
- **Opción A — Roll:** Tirar el hit die de la clase.
- **Opción B — Average:** Tomar el promedio fijo (ej: d8 → 5, d10 → 6, d12 → 7).

**Decisión:**
- [ ] Solo roll
- [ ] Solo average fijo (más común en mesas)
- [x] Ambos, el jugador elige al subir

---

## 6. Spellcasting

### 6.1 Spell Preparation

- **Fuente:** PHB cap. 10.
- Cada clase tiene reglas distintas:
  - **Wizard:** Spellbook + preparar `INT mod + level` por día.
  - **Cleric / Druid / Paladin:** Preparar `ability mod + level` por día (no spellbook).
  - **Sorcerer / Bard / Warlock / Ranger:** Spells known fijos (no preparation diaria).

Estas reglas son canónicas, no opcionales. **No requieren decisión** — pero el motor las debe implementar tal cual.

### 6.2 Wizard Spellbook

- **Fuente:** PHB p.114.
- Aprender un spell nuevo cuesta **50 gp + 2 horas por nivel del spell** (excepto los gratis al subir nivel).
- El spellbook es un ítem físico — si lo perdés, perdiste los spells.

**Decisión:**
- [x] Modelar el spellbook como ítem con economía (afecta inventario + gold)
- [ ] Simplificar: la lista de spells conocidos vive en `character.spells.known` sin tracking de gold/tiempo

### 6.3 Ritual Casting

- **Fuente:** PHB p.201.
- Algunas clases pueden castear spells con tag `ritual` sin gastar slot (Wizard, Cleric, Druid, Bard).

**Decisión:** ¿Trackeamos esto en el sheet o queda solo como info del spell?
La info en el spell esta mas que suficiente

---

## 7. Inventario — fases A y B

### 7.1 Fase A — MVP

Modelo por ítem:
```json
{
  "instanceId": "uuid",
  "itemSlug": "longsword",
  "quantity": 1,
  "state": "equipped | carried | stowed",
  "attuned": false,
  "customName": null,
  "notes": ""
}
```

Constraints activas en Fase A:
- **Attunement:** máx 3 ítems con `attuned: true` — PHB p.138, **no opcional**.
- **Carga:** suma de `item.weight × quantity`, comparar contra `STR × 15`.
- **Currency:** objeto separado `{ cp, sp, ep, gp, pp }`.
- **Proficiencia al equipar:** validar que la clase pueda usar la armadura/arma. Si no → warning, no bloqueo (es así en RAW).

**Decisión Fase A:**
- [x] OK como está
- [ ] Ajustes

### 7.2 Fase B — Robusto (post-MVP)

Features adicionales:
- Contenedores anidados con cancelación de peso para mágicos (Bag of Holding, Handy Haversack — DMG p.153).
- Equip slots estrictos (1 armor, 1 shield, main/off-hand con validación de versatile / two-handed / light).
- Encumbrance variant (si está on en Rules Profile).
- Munición como stack separado.
- Items con cargas/usos (wands, potions, scrolls) con tracking de consumo.

**Decisión:** ¿Confirmamos que B queda para una segunda etapa?
Queda para una segunda etapa B

---

## 8. Otros constraints menores a confirmar

### 8.1 Hit Dice tracking (short rest)

- **Fuente:** PHB p.186.
- Cada personaje tiene `level` hit dice. Se gastan en short rest para recuperar HP. Se recuperan a la mitad en long rest.
- **El PRD NO incluye este campo en el modelo de Character.**

**Decisión:** Agregamos `hitDice: { total, available }` al modelo.
**Sí, lo agregamos.** Necesario para que `/character rest short` del bot tenga efecto real (RAW: short rest = gastar hit dice para curarse). Modelo: `hitDice: { total: N, available: N }` (donde N = nivel total del personaje, segmentado por hit die según clase en multiclass).

### 8.2 Languages adicionales por feats

- Ej: feat `Linguist` da 3 idiomas extra.
- ¿Trackeamos source de cada idioma o solo la lista final?
Me parece bien trackear el source

### 8.3 Expertise (Rogue, Bard, etc.)

- **Fuente:** PHB. Duplica el proficiency bonus en skills seleccionadas.
- El modelo de Character del PRD tiene `proficiencies.skills: []` pero no diferencia expertise.

**Decisión:** Modelar como `{ proficient: [], expertise: [] }`.
Si, me parece bien

### 8.4 Death Saves persistencia

- El PRD ya incluye `deathSaves: { successes, failures }`. ✅
- ¿Se resetean automáticamente al long rest o full heal?
Si, a long rest.

### 8.5 Inspiration

- **Fuente:** PHB p.125.
- Recurso narrativo otorgado por el DM. ¿Lo trackeamos?
Si, tambien que DM lo dió.

### 8.6 Exhaustion

- **Fuente:** PHB p.291 (6 niveles de exhaustion).
- ¿Se trackea en el sheet?
no hace falta por ahora

---

## 9. Multiclassing — referencia (sin decisión)

Si multiclassing está activo, estos son los prereqs **oficiales** (PHB p.163). No hay decisión que tomar, solo implementar:

| Clase | Prereq para entrar/salir |
|-------|--------------------------|
| Barbarian | STR 13 |
| Bard | CHA 13 |
| Cleric | WIS 13 |
| Druid | WIS 13 |
| Fighter | STR 13 **o** DEX 13 |
| Monk | DEX 13 **y** WIS 13 |
| Paladin | STR 13 **y** CHA 13 |
| Ranger | DEX 13 **y** WIS 13 |
| Rogue | DEX 13 |
| Sorcerer | CHA 13 |
| Warlock | CHA 13 |
| Wizard | INT 13 |

Spell slot table multiclass: PHB p.165.

---

## 10. Orden sugerido de implementación

Una vez completas las decisiones de arriba:

1. **Rules Profile** + tabla `campaigns` (base de todo lo demás).
2. **Compendium import** con filtrado por `source`.
3. **Character CRUD** sin validaciones (Fase 1 del PRD).
4. **Stat generation** (método elegido en sección 3).
5. **Constraint engine v1** — race / class / background / starting equipment / multiclass prereqs.
6. **Inventory Fase A** (sección 7.1).
7. **Spellcasting** (slots, prep, spellbook).
8. **Level up flow** completo.
9. **Inventory Fase B** (post-MVP).

---

*Este documento es la fuente de verdad para el motor de constraints. Cuando completes una decisión, sustituí `> Pendiente` por la opción elegida y una breve justificación.*
