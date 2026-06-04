# @dungeon-hub/bot

Discord bot that exposes the Dungeon Hub compendium, character sheets, and West Marches world data via slash commands.

## Setup

### 1. Create the Discord application

1. Go to https://discord.com/developers/applications → "New Application".
2. **Bot tab** → reset token → save as `DISCORD_TOKEN`.
3. **General Information** → `APPLICATION ID` → `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`.
   - Bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`.
5. Open the generated URL in the browser and invite the bot to the group server.
6. Copy the server ID (right-click → Copy Server ID, requires Developer Mode in Discord) → `DISCORD_GUILD_ID`.

### 2. Create the bot user in Supabase

The bot authenticates as a real Supabase user with role `player`, added as a campaign member.

```sql
-- Via Supabase Studio dashboard (http://localhost:3000):
-- 1. Authentication → Add user → email/password (e.g. bot@dungeonhub.local).
-- 2. Note the generated user UUID.
-- 3. In the SQL editor, add it to public.users (if not mirrored automatically):
INSERT INTO public.users (id, username, role)
VALUES ('<user-uuid>', 'dungeonhub-bot', 'player')
ON CONFLICT (id) DO NOTHING;

-- 4. Grant the bot the impersonation flag:
UPDATE public.users SET can_impersonate = true WHERE username = 'dungeonhub-bot';
```

### 3. Environment variables

Create `apps/bot/.env`:

```
NODE_ENV=development

DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...    # leave blank for global registration

API_BASE_URL=http://localhost:4000

SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=...

BOT_EMAIL=bot@dungeonhub.local
BOT_PASSWORD=...

CAMPAIGN_ID=...    # UUID of the campaign the bot serves
```

See `docs/onboarding/operator-checklist.md §G2` for the full env var reference and production setup.

### 4. Start the bot

```bash
# Install deps (from the monorepo root)
pnpm install

# Register slash commands in Discord (run once after any command change)
pnpm --filter @dungeon-hub/bot register-commands

# Start the bot in watch mode
pnpm --filter @dungeon-hub/bot dev
```

If `DISCORD_GUILD_ID` is set, commands appear instantly in that server. Without a guild ID, global registration can take up to 1 h to propagate.

---

## Available commands

All compendium commands (`/spell`, `/feat`, `/item`, `/race`, `/class`, `/monster`) support live autocomplete. When a query matches multiple entries, the bot shows the first result with a picker component to jump to the others.

### Compendium (5e PHB 2014)

| Command | Description |
|---------|-------------|
| `/spell <name>` | Spell details (casting time, range, components, classes, description) |
| `/feat <name>` | Feat details (prerequisite, ASI grant, description) |
| `/item <name>` | Item/equipment details (type, weight, cost, properties, damage/AC) |
| `/race <name>` | Race or subrace details (size, speed, ASIs, languages, traits) |
| `/class <name>` | Class details (hit die, saves, proficiencies, features by level) |
| `/monster <name>` | Full stat block (CR, AC, HP, abilities, saves, immunities, actions, legendary) |

### Identity (account linking)

| Command | Description |
|---------|-------------|
| `/link` | Generate a one-time link to connect your Discord to your backend account |
| `/unlink` | Disconnect your Discord from the backend (reversible with `/link`) |
| `/whoami` | Show your Discord ID and link status |

The first use of any character command requires `/link` first:

1. `/link` → the bot sends you a private (ephemeral) URL
2. Open the URL in a browser, log in with your Supabase account
3. Confirm the link
4. All character commands are now available

### Character (requires account link)

| Command | Description |
|---------|-------------|
| `/character list` | List your active characters in the campaign |
| `/character show <name>` | Full sheet (HP, AC, abilities, saves, skills, spell slots) |
| `/character hp <name> <delta> [note]` | Apply damage (negative delta) or healing (positive). Temp HP absorbs damage first. |
| `/character rest <name> <type>` | Short or long rest. Short refreshes short-rest resources; long restores HP, slots, and exhaustion. |

`/mi-hoja` is a shortcut for `/character show` when you have exactly one active character — no arguments needed.

### West Marches (campaign-scoped)

| Command | Description |
|---------|-------------|
| `/session list [status]` | List sessions, optionally filtered by status |
| `/session show <session>` | Session details (dates, level range, participants) |
| `/world events [tag]` | Timeline of world events, optional tag filter |
| `/world factions` | Factions in the campaign |
| `/world npcs [status]` | NPCs with status and faction/hex |
| `/lore list [tag]` | Campaign journal/lore entries, optional tag filter |
| `/lore show <entry>` | Full body of a lore entry |
| `/map list [scope]` | Hexes (top-level by default, or all visible) |
| `/map show <hex>` | Hex details + its POIs |

---

## Tests

```bash
pnpm --filter @dungeon-hub/bot test
```

Unit tests only (Vitest). No E2E — smoke manually against a live Discord server.
