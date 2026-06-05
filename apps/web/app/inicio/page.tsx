import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { getActiveWorld } from '@/lib/active-world';
import { getActiveCharacter } from '@/lib/active-character';
import { getViewPreference } from '@/lib/role';
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
  QuestSinTocar,
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

  // Resolve active world in parallel (REQ-WIS-01 latency mitigation).
  // Slice 3: effectiveView derived from callerRole (per-world authority), NOT from the
  // global dh:role cookie. REQ-WIS-08.
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // effectiveView rule (REQ-WIS-08 + REQ-WIS-09):
  //   - non-GM (player or null callerRole) ALWAYS sees player view
  //   - GM defaults to DM view (seeded from callerRole); the dh:role cookie is a GM-only
  //     view-preference overlay (toggled client-side via RoleSwitcher) — 'player' makes a
  //     GM preview as player; absent → DM default.
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={aw?.callerRole ?? null}
    />
  ) : undefined;

  const callerRole = aw?.callerRole ?? null;

  if (effectiveView === 'dm') {
    return <DMView token={token} worldSwitcher={worldSwitcher} callerRole={callerRole} />;
  }

  return <PlayerView token={token} worldSwitcher={worldSwitcher} callerRole={callerRole} />;
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

async function PlayerView({ token, worldSwitcher, callerRole }: { token?: string; worldSwitcher?: ReactNode; callerRole?: 'gm' | 'player' | null }) {
  // Fetch campaigns and active character in parallel (REQ-AC-RES-02: getActiveCharacter inside allSettled).
  // getActiveCharacter replaces the previous roster[0] heuristic (REQ-AC-INI-01).
  const [campaignsResult, activeCharResult] = await Promise.allSettled([
    token ? api.get<{ data: UserCampaignRow[] }>('/campaigns', token) : Promise.resolve(null),
    getActiveCharacter(token),
  ]);

  const campaigns = campaignsResult.status === 'fulfilled' ? campaignsResult.value?.data ?? [] : [];

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

  // Active character resolved via cookie lens (REQ-AC-INI-01).
  // The serial sheet fetch (AC + initiative) fires AFTER the active character is resolved —
  // this is intentional and unchanged: the roster allSettled is parallel; only the sheet
  // detail is serial (same as before, REQ-AC-RES-02 note).
  const activeChar = activeCharResult.status === 'fulfilled' ? (activeCharResult.value ?? null) : null;
  let charData: ActiveCharacter | null = null;

  if (activeChar) {
    const sheetResult = await (token
      ? api.get<SheetResponse>(`/characters/${activeChar.id}/sheet`, token).catch(() => null)
      : Promise.resolve(null));

    const ac = sheetResult?.sheet?.armorClass?.value ?? 0;
    const init = sheetResult?.sheet?.initiative ?? 0;
    const hp =
      activeChar.hpCurrent !== null && activeChar.hpMax !== null
        ? `${activeChar.hpCurrent}/${activeChar.hpMax}`
        : '—';

    charData = {
      id: activeChar.id,
      name: activeChar.name,
      initial: activeChar.name[0]?.toUpperCase() ?? '?',
      lineage: activeChar.lineage,
      hp,
      ac,
      init,
    };
  }

  return (
    <AppShell title="Inicio" subtitle="TU GREMIO" roleDefault="player" callerRole={callerRole ?? undefined} worldSwitcher={worldSwitcher}>
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

async function DMView({ token, worldSwitcher, callerRole }: { token?: string; worldSwitcher?: ReactNode; callerRole?: 'gm' | 'player' | null }) {
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

  // Fetch quests for the 'sin tocar' widget and pendingQuests count (REQ-QUEST-INICIO-01)
  // ADR-4: single unfiltered fetch; derive pendingQuests + sin-tocar client-side (small N).
  let questsSinTocar: QuestSinTocar[] = [];
  let pendingQuests = 0;
  if (gmCampaign && token) {
    const questsRes = await api
      .get<{ data: { id: string; title: string; status: string; updatedAt: string }[] }>(
        `/worlds/${gmCampaign.worldId}/quests?limit=50`,
        token,
      )
      .catch(() => null);
    const allQuests = questsRes?.data ?? [];
    // REQ-QUEST-INICIO-03: count active quests (D1 — no extra round-trip)
    pendingQuests = allQuests.filter((q) => q.status === 'active').length;
    // REQ-QUEST-INICIO-02: sort ASC by updatedAt (oldest = sin tocar), slice top 10, map to display type
    questsSinTocar = [...allQuests]
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, 10)
      .map((q) => ({ id: q.id, title: q.title, lastChange: relativeAge(q.updatedAt) }));
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
      pendingQuests: pendingQuests > 0 ? pendingQuests : undefined,
    };
  }

  const pendingCount = gmCampaign?.pendingFichas ?? fichasData.length;

  return (
    <AppShell title="Inicio" subtitle="TU GREMIO — DM" roleDefault="dm" callerRole={callerRole ?? undefined} worldSwitcher={worldSwitcher}>
      <div className="flex flex-col gap-4">
        <PendingFichasCardTrigger
          fichas={fichasData}
          oldestAge={oldestAge ?? '—'}
          quests={questsSinTocar}
        />
        {dmCampaignData ? (
          <>
            <DMNextSessionCard campaign={dmCampaignData} />
            {/* +nueva partida en este mundo — DM-only (REQ-CIW-02) */}
            <Link
              href={`/campanas/new?worldId=${gmCampaign!.worldId}`}
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-3 font-sans text-[13px] font-semibold text-ink-mute transition-colors hover:border-accent hover:text-accent"
            >
              <span className="text-lg text-accent">+</span>
              <span>Nueva partida en este mundo</span>
            </Link>
          </>
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
        <QuestsSinTocarList quests={questsSinTocar} />
      </div>
    </AppShell>
  );
}
