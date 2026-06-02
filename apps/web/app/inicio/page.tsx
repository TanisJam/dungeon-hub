import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRole } from '@/lib/role';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { getActiveWorld } from '@/lib/active-world';
import { HeroNextSession } from '@/components/inicio/hero-next-session';
import { QuickActions } from '@/components/inicio/quick-actions';
import { ActiveCharacterCard } from '@/components/inicio/active-character-card';
import { NovedadesFeed } from '@/components/inicio/novedades-feed';
import { PendingFichasCardTrigger } from '@/components/inicio/dm/pending-fichas-card-trigger';
import { DMNextSessionCard } from '@/components/inicio/dm/dm-next-session-card';
import { DMQuickActions } from '@/components/inicio/dm/dm-quick-actions';
import { QuestsSinTocarList } from '@/components/inicio/dm/quests-sin-tocar-list';
import { SectionHead, V3Empty } from '@/components/ui';
import type {
  NextCampaign,
  ActiveCharacter,
  DMCampaignNextSession,
  PendingFichaSummary,
} from '@/components/inicio/types';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface UserCampaignRow {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
  createdAt: string;
  memberRole: 'gm' | 'player';
  playersCount: number;
  sessionsCount: number;
  nextSession: string | null;
  pendingFichas: number | null;
}

interface RosterRow {
  id: string;
  worldId: string;
  name: string;
  status: string;
  xp: number;
  lineage: string;
  hpCurrent: number | null;
  hpMax: number | null;
}

interface SheetResponse {
  sheet: {
    armorClass: { value: number };
    initiative: number;
  };
}

interface WorldCharacter {
  id: string;
  name: string;
  status: string;
  classes: Array<{ classSlug: string; level: number }>;
  level: number;
  ownerUserId: string;
  ownerUsername: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const DAY_ABBR = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

function formatNextSession(iso: string): string {
  const d = new Date(iso);
  const day = DAY_ABBR[d.getDay()];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${h}:${m}`;
}

function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/** Relative age string from ISO createdAt, e.g. "hace 2 horas", "hace 3 días". */
function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const weeks = Math.floor(days / 7);
  return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Resolve role + activeWorld in parallel (REQ-WIS-01 latency mitigation: parallel, not serial).
  // Slice 3 will replace getRole() with aw?.callerRole; for now both run in parallel.
  const [role, aw] = await Promise.all([
    getRole(),
    getActiveWorld(token),
  ]);

  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={aw?.callerRole ?? null}
    />
  ) : undefined;

  if (role === 'dm') {
    return <DMView token={token} worldSwitcher={worldSwitcher} />;
  }

  return <PlayerView token={token} worldSwitcher={worldSwitcher} />;
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

async function PlayerView({ token, worldSwitcher }: { token?: string; worldSwitcher?: ReactNode }) {
  // Fetch campaigns and roster in parallel
  const [campaignsResult, rosterResult] = await Promise.allSettled([
    token ? api.get<{ data: UserCampaignRow[] }>('/campaigns', token) : Promise.resolve(null),
    token ? api.get<{ data: RosterRow[] }>('/characters?status=active', token) : Promise.resolve(null),
  ]);

  const campaigns = campaignsResult.status === 'fulfilled' ? campaignsResult.value?.data ?? [] : [];
  const roster = rosterResult.status === 'fulfilled' ? rosterResult.value?.data ?? [] : [];

  // Nearest future session from player's campaigns
  const campaignWithSession = campaigns
    .filter((c) => c.memberRole === 'player' && c.nextSession !== null)
    .sort((a, b) => new Date(a.nextSession!).getTime() - new Date(b.nextSession!).getTime())[0] ?? null;

  let heroData: NextCampaign | null = null;
  if (campaignWithSession) {
    heroData = {
      id: campaignWithSession.id,
      name: campaignWithSession.name,
      daysToSession: daysUntil(campaignWithSession.nextSession!),
      nextSession: formatNextSession(campaignWithSession.nextSession!),
      sessions: campaignWithSession.sessionsCount,
    };
  }

  // First active character + sheet data
  const firstChar = roster[0] ?? null;
  let charData: ActiveCharacter | null = null;

  if (firstChar) {
    const sheetResult = await (token
      ? api.get<SheetResponse>(`/characters/${firstChar.id}/sheet`, token).catch(() => null)
      : Promise.resolve(null));

    const ac = sheetResult?.sheet?.armorClass?.value ?? 0;
    const init = sheetResult?.sheet?.initiative ?? 0;
    const hp =
      firstChar.hpCurrent !== null && firstChar.hpMax !== null
        ? `${firstChar.hpCurrent}/${firstChar.hpMax}`
        : '—';

    charData = {
      id: firstChar.id,
      name: firstChar.name,
      initial: firstChar.name[0]?.toUpperCase() ?? '?',
      lineage: firstChar.lineage,
      hp,
      ac,
      init,
    };
  }

  return (
    <AppShell title="Inicio" subtitle="TU GREMIO" roleDefault="player" worldSwitcher={worldSwitcher}>
      <div className="flex flex-col gap-4">
        {heroData ? (
          <HeroNextSession campaign={heroData} />
        ) : (
          <V3Empty
            glyph="dice"
            title="Sin sesiones programadas"
            sub="No tenés sesiones programadas. Coordiná con tu DM."
          />
        )}
        <QuickActions />
        {charData ? (
          <ActiveCharacterCard char={charData} />
        ) : (
          <>
            <SectionHead title="Tu personaje activo" />
            <V3Empty
              glyph="user"
              title="Sin personajes activos"
              sub="No tenés personajes activos. Creá uno para comenzar."
            />
          </>
        )}
        <NovedadesFeed items={[]} />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// DM view
// ---------------------------------------------------------------------------

async function DMView({ token, worldSwitcher }: { token?: string; worldSwitcher?: ReactNode }) {
  // Fetch campaigns in parallel with world characters (need worldId from campaign first)
  const campaignsResult = await (token
    ? api.get<{ data: UserCampaignRow[] }>('/campaigns', token).catch(() => null)
    : Promise.resolve(null));

  const campaigns = campaignsResult?.data ?? [];
  const gmCampaign = campaigns.find((c) => c.memberRole === 'gm') ?? null;

  // Fetch pending fichas list if we have a GM campaign with a worldId
  let fichasData: PendingFichaSummary[] = [];
  if (gmCampaign && token) {
    const worldCharsResult = await api
      .get<{ characters: WorldCharacter[] }>(
        `/worlds/${gmCampaign.worldId}/characters?status=pending_approval`,
        token,
      )
      .catch(() => null);

    if (worldCharsResult?.characters) {
      fichasData = worldCharsResult.characters.map((c) => ({
        id: c.id,
        portraitInitial: c.name[0]?.toUpperCase() ?? '?',
        pj: c.name,
        lineage: c.classes.length > 0
          ? c.classes.map((cls) => `${cls.classSlug} ${cls.level}`).join(' / ')
          : '—',
        player: c.ownerUsername,
        sent: c.createdAt ? relativeAge(c.createdAt) : '—',
        fresh: c.createdAt
          ? Date.now() - new Date(c.createdAt).getTime() < 24 * 60 * 60 * 1000
          : false,
      }));
    }
  }

  // Derive oldestAge from fichasData
  let oldestAge: string | undefined;
  if (fichasData.length > 0) {
    oldestAge = fichasData[fichasData.length - 1]?.sent;
  }

  // Build DM campaign display data
  let dmCampaignData: DMCampaignNextSession | null = null;
  if (gmCampaign) {
    dmCampaignData = {
      id: gmCampaign.id,
      name: gmCampaign.name,
      nextSession: gmCampaign.nextSession ? formatNextSession(gmCampaign.nextSession) : '—',
      players: gmCampaign.playersCount,
      sessions: gmCampaign.sessionsCount,
    };
  }

  const pendingCount = gmCampaign?.pendingFichas ?? fichasData.length;

  return (
    <AppShell title="Inicio" subtitle="TU GREMIO — DM" roleDefault="dm" worldSwitcher={worldSwitcher}>
      <div className="flex flex-col gap-4">
        <PendingFichasCardTrigger
          fichas={fichasData}
          oldestAge={oldestAge ?? '—'}
          quests={[]}
        />
        {dmCampaignData ? (
          <DMNextSessionCard campaign={dmCampaignData} />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <V3Empty
              glyph="scroll"
              title="Sin campaña activa"
              sub="Creá una campaña para comenzar."
            />
            <Link
              href="/campanas/new"
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-3 font-sans text-[13px] font-semibold text-ink-mute transition-colors hover:border-accent hover:text-accent"
            >
              <span className="text-lg text-accent">+</span>
              <span>Crear campaña nueva</span>
            </Link>
          </div>
        )}
        <DMQuickActions />
        <QuestsSinTocarList quests={[]} />
      </div>
    </AppShell>
  );
}
