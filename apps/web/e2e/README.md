# E2E tests (Playwright)

## Pre-requisitos

El stack tiene que estar corriendo (Playwright NO lo arranca por vos):

```bash
# Terminal 1: Supabase
pnpm supabase:up

# Terminal 2: API
pnpm --filter @dungeon-hub/api dev

# Terminal 3: Web
pnpm --filter @dungeon-hub/web dev
```

## Env vars necesarios

En `apps/web/.env.local`, además de los que ya tenés para dev:

```
# Service role key — solo dev/test. Está en infra/supabase/.env, copiala acá.
SUPABASE_SERVICE_ROLE_KEY=<el service_role JWT>

# Test user creds — opcionales, hay defaults si no los seteás.
TEST_USER_EMAIL=e2e@dungeon-hub.test
TEST_USER_PASSWORD=e2e-test-pass-1234
```

El test user se crea automáticamente en el setup (idempotente). Si el user ya
existe y la password no matchea, el setup la sincroniza.

## Comandos

```bash
pnpm --filter @dungeon-hub/web test:e2e         # headless, todos los specs
pnpm --filter @dungeon-hub/web test:e2e:ui      # modo interactivo UI

# Un solo spec
pnpm --filter @dungeon-hub/web test:e2e e2e/home.public.spec.ts

# Solo el setup
pnpm --filter @dungeon-hub/web test:e2e --project=setup
```

## Estructura

Tres tipos de spec, gateados por filename pattern:

- `*.setup.ts` — setup projects (no son tests "reales", preparan estado)
- `*.public.spec.ts` — tests sin auth (homepage, etc.)
- `*.auth.spec.ts` — tests con sesión cargada desde `e2e/.auth/user.json`

El project `setup` corre primero y genera el storage state. Los `*.auth.spec.ts`
tienen `dependencies: ['setup']` así que Playwright se asegura del orden.

## Cómo funciona el auth setup

`auth.setup.ts`:
1. Usa el SERVICE_ROLE_KEY para crear/actualizar el test user via admin API
2. El trigger `handle_new_auth_user` crea el row correspondiente en `public.users` (role='player')
3. Llama `POST /api/dev/login` (route handler gated por NODE_ENV !== 'production')
4. El route usa `@supabase/ssr` para sign-in con password y setear las cookies de sesión
5. Guarda `storageState` con cookies + localStorage en `e2e/.auth/user.json`

Los `*.auth.spec.ts` arrancan con esas cookies ya cargadas — sin pasar por OAuth.

## Limpieza del test user

El test user no se borra entre runs (sería caro re-crearlo). Sus characters y
campaigns SÍ se acumulan. Si querés reset, borralo via SQL en Studio:

```sql
DELETE FROM auth.users WHERE email = 'e2e@dungeon-hub.test';
-- cascade limpia public.users + characters + campaigns
```
