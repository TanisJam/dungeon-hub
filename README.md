# Dungeon Hub

Sistema privado de gestión de personajes D&D 5e y campaña West Marches para un grupo de 5 amigos + 1 DM.

📖 **Docs canónicos:**
- [`PRD_DnD_WestMarches.md`](./PRD_DnD_WestMarches.md) — visión completa del producto.
- [`CONSTRAINTS.md`](./CONSTRAINTS.md) — decisiones sobre constraints del reglamento D&D 5e.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — plan de implementación de Fase 1.

---

## Stack

- **Backend:** Node.js 22 + Fastify 5 + TypeScript strict.
- **DB + Auth + Storage:** Supabase self-hosted en Docker.
- **ORM:** Drizzle (apunta al Postgres de Supabase).
- **Validación:** Zod.
- **Tests:** Vitest.
- **Monorepo:** pnpm workspaces.

## Estructura

```
dungeon_hub/
├── apps/
│   └── api/                # Fastify backend
├── packages/
│   └── domain/             # Constraint engine + entities (pure TS)
├── infra/
│   └── supabase/           # Docker Compose de Supabase self-hosted
├── scripts/                # Scripts utilitarios (gen-keys, imports, etc.)
├── CONSTRAINTS.md
├── IMPLEMENTATION_PLAN.md
└── PRD_DnD_WestMarches.md
```

---

## Quickstart (primera vez)

```bash
# 1. Instalar deps
pnpm install

# 2. Bootstrap Supabase (clona el docker-compose oficial)
pnpm supabase:bootstrap

# 3. Generar secrets (JWT, anon key, service role, etc.)
pnpm gen:keys
# → Te imprime las variables. Pegalas en:
#    - infra/supabase/.env
#    - apps/api/.env
# (en infra/supabase/ y apps/api/ hay env.example como referencia)

# 4. Levantar Supabase
pnpm supabase:up

# 5. Generar y aplicar migraciones de Drizzle
pnpm --filter @dungeon-hub/api db:generate
pnpm --filter @dungeon-hub/api db:migrate

# 6. Aplicar el trigger de auth → public.users
psql "$DATABASE_URL" -f apps/api/drizzle/custom/0001-auth-mirror-trigger.sql

# 7. Levantar el API
pnpm dev
```

Healthcheck: `curl http://localhost:4000/api/v1/health`

Debería responder:
```json
{ "status": "ok", "db": "up", "uptime": 1.23, "timestamp": "..." }
```

---

## Workflow diario

```bash
pnpm supabase:up        # Si no está corriendo
pnpm dev                # Arranca el API con hot reload
```

## URLs útiles

| Servicio | URL | Para qué |
|----------|-----|----------|
| API | http://localhost:4000 | Backend de Dungeon Hub |
| Supabase Studio | http://localhost:3000 | Dashboard de la DB |
| Supabase Kong | http://localhost:8000 | Gateway de Auth y APIs |
| Postgres | localhost:5432 | Conexión directa (Drizzle) |

---

## Fases del proyecto

Ver [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) para el plan detallado.

- ✅ **Fase 1.0** — Foundation (monorepo + Supabase + healthcheck)
- ⏳ **Fase 1.1** — Import de 5etools
- ⏳ **Fase 1.2** — Compendium API
- ⏳ **Fase 1.3** — Character CRUD básico
- ⏳ **Fase 1.4** — Constraint Engine v1
- ⏳ **Fase 1.5** — Stats calculados
- ⏳ **Fase 1.6** — Inventario Fase A
- ⏳ **Fase 1.7** — Spellcasting
- ⏳ **Fase 1.8** — Level Up + Rests

---

## Convenciones

- Commits: [Conventional Commits](https://www.conventionalcommits.org/).
- TS strict mode + `noUncheckedIndexedAccess`.
- Constraint engine en `packages/domain` es **puro** — sin IO, sin DB, sin HTTP. Se testea con Vitest sin levantar nada.

---

*Hecho para aventureros, por aventureros.*
