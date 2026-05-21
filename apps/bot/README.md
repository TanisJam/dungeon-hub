# @dungeon-hub/bot

Discord bot que expone el compendium y el world state de Dungeon Hub via slash commands.

## Setup

### 1. Crear la aplicación de Discord

1. Ir a https://discord.com/developers/applications → "New Application".
2. **Bot tab** → reset token → guardar como `DISCORD_TOKEN`.
3. **General Information** → `APPLICATION ID` → `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`.
   - Bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`.
5. Abrir la URL generada en el navegador e invitar al bot al servidor del grupo.
6. Tomar el ID del servidor (right-click → Copy Server ID, requiere Developer Mode en Discord) → `DISCORD_GUILD_ID`.

### 2. Crear el user "bot" en Supabase

El bot se autentica como un user real de Supabase con rol `player`, agregado como miembro de la campaña.

```sql
-- Vía dashboard de Supabase Studio (http://localhost:3000):
-- 1. Authentication → Add user → email/password (ej: bot@dungeonhub.local).
-- 2. Anotar el UUID del user generado.
-- 3. En SQL editor, agregarlo a public.users (si no se replicó automáticamente):
INSERT INTO public.users (id, username, role)
VALUES ('<user-uuid>', 'dungeonhub-bot', 'player')
ON CONFLICT (id) DO NOTHING;

-- 4. Agregarlo como miembro de la campaña que va a atender:
INSERT INTO campaign_members (campaign_id, user_id, role)
VALUES ('<campaign-uuid>', '<user-uuid>', 'player');
```

### 3. Variables de entorno

Crear `apps/bot/.env` con:

```
NODE_ENV=development

DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...    # vacío para registro global

API_BASE_URL=http://localhost:4000

SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=...

BOT_EMAIL=bot@dungeonhub.local
BOT_PASSWORD=...

CAMPAIGN_ID=...    # UUID de la campaña que el bot atiende
```

### 4. Levantar

```bash
# Instalar deps (desde el root del monorepo)
pnpm install

# Registrar los slash commands en Discord (correr una vez por cambio de comandos)
pnpm --filter @dungeon-hub/bot register-commands

# Levantar el bot en watch mode
pnpm --filter @dungeon-hub/bot dev
```

Si `DISCORD_GUILD_ID` está seteado, los comandos aparecen instantáneamente en ese server.
Sin guild ID, los comandos se registran globalmente y pueden tardar hasta 1h en propagar.

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `/spell <name>` | Detalles de un hechizo (casting time, range, components, classes, bonus subclasses, descripción) |
| `/feat <name>` | Detalles de un feat (prerequisite, ASI grant, descripción) |
| `/item <name>` | Detalles de un item (type, weight, cost, properties, damage/AC, magic effects) |
| `/race <name>` | Detalles de una race o subrace (size, speed, ASIs, languages, traits) |
| `/class <name> [level]` | Detalles de una clase (hit die, saves, proficiencies, features por nivel) |

Pendientes — ver roadmap en el PRD:
- `/monster <name>` (necesita importer de bestiary)
- Comandos de personaje (`/character show`, `/character hp`, `/character rest`)
- Comandos West Marches (`/session list`, `/world events`, `/lore`, `/map reveal`)
