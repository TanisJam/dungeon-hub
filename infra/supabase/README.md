# Supabase self-hosted

Esta carpeta contiene el setup de Supabase corriendo en Docker para Dungeon Hub.

## Bootstrap (solo la primera vez)

Desde la raíz del repo:

```bash
pnpm supabase:bootstrap
```

Esto clona la versión `master` del repo oficial de Supabase y copia `docker/` acá, exceptuando los volúmenes de data (que se generan al levantar).

## Configuración

1. Generá secrets:
   ```bash
   pnpm gen:keys
   ```

2. Copiá `env.example` a `.env` y reemplazá los valores con los generados:
   ```bash
   cp infra/supabase/env.example infra/supabase/.env
   ```

3. Hacé lo mismo en `apps/api/.env` (el script `gen:keys` te imprime ambos).

## Levantar Supabase

```bash
pnpm supabase:up        # docker compose up -d
pnpm supabase:logs      # ver logs en vivo
pnpm supabase:down      # detener
```

## Servicios expuestos

| Servicio | URL | Para qué |
|----------|-----|----------|
| Postgres | `localhost:5432` | DB principal (Drizzle apunta acá) |
| Kong | `localhost:8000` | API gateway de Supabase |
| Studio | `localhost:3000` | Dashboard web (login con `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`) |
| Auth (vía Kong) | `localhost:8000/auth/v1` | GoTrue |

## Actualizar Supabase

Re-ejecutá el bootstrap:

```bash
pnpm supabase:bootstrap
```

> ⚠️ Esto sobrescribe el `docker-compose.yml` con la última versión. Tu `.env` se preserva.

## Backups

> Pendiente — definir estrategia (pg_dump + cron, o pgbackrest).
