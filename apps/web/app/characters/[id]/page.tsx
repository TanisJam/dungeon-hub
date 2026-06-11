import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import type { SheetResponse, CharacterStatus } from '@/lib/sheet-types';
import { AppShell } from '@/components/layout/app-shell';
import { Pill } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Banner } from '@/components/sheet/banner';
import { SheetHero, xpForLevel } from '@/components/sheet/sheet-hero';
import { VitalGrid } from '@/components/sheet/vital-grid';
import { SheetTabs, type SheetTab } from '@/components/sheet/sheet-tabs';
import { ResumenTab } from './_tabs/resumen';
import { HabilidadesTab } from './_tabs/habilidades';
import { HechizosTab } from './_tabs/hechizos';
import { InventarioTab } from './_tabs/inventario';
import { NotasTab } from './_tabs/notas';
import { RecursosTab } from './_tabs/recursos';
import { DeleteCharacterButton } from './_delete-button';
import { ExportButton } from './_export-button';
import { RestActions } from './_rest-actions';
import { DmAwareAffordances } from './_components/dm-aware-affordances';
import { HpEditorSlot } from './_components/hp-editor-slot';
import { LevelUpEntryPoint } from './_components/level-up-entry-point';
import { RecentGrants } from './_components/recent-grants';
import { RoleSwitcher } from '@/components/layout/role-switcher';

type WorldCallerRole = 'gm' | 'player' | null;
type WorldDetailLite = { callerRole: WorldCallerRole };

const VALID_TABS = ['resumen', 'habilidades', 'hechizos', 'recursos', 'inventario', 'notas'] as const;

function isValidTab(tab: string | undefined): tab is SheetTab {
  return VALID_TABS.includes(tab as SheetTab);
}

function buildClassSummary(data: SheetResponse): string {
  const { identity } = data.sheet;
  const race = identity.race?.slug ?? null;
  const classes = identity.classes
    .map((c) => {
      const sub = c.subclass ? ` (${c.subclass.slug})` : '';
      return `${c.slug}${sub} ${c.level}`;
    })
    .join(' / ');
  if (race && classes) return `${race} · ${classes}`;
  if (race) return race;
  return classes || 'Personaje';
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sub?: string }>;
};

export default async function CharacterSheetPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: tabParam, sub: subParam } = await searchParams;
  const tab: SheetTab = isValidTab(tabParam) ? tabParam : 'resumen';
  const sub = subParam ?? 'conocidos';

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  let data: SheetResponse;
  try {
    data = await api.get<SheetResponse>(`/characters/${id}/sheet`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <AppShell title="Ficha" constructorHref="/characters/new">
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">No tenés acceso a este personaje.</p>
            </div>
          </AppShell>
        );
      }
    }
    return (
      <AppShell title="Ficha" constructorHref="/characters/new">
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Error al cargar la ficha.</p>
        </div>
      </AppShell>
    );
  }

  const { character, sheet, currentHp, inventory, inventoryEnriched } = data;

  // Draft → redirect to wizard
  if (character.status === 'draft') {
    redirect(`/characters/${id}/wizard/stats`);
  }

  // Fetch world detail for callerRole — needed to gate DM approval actions.
  // Best-effort: on failure we hide the actions but don't break the sheet.
  // SDD dm-session-panel — REQ-CAU-APPROVE-BUTTON / REQ-CAU-REJECT-BUTTON / REQ-CAU-REVERT-BUTTON.
  let callerRole: WorldCallerRole = null;
  try {
    const world = await api.get<WorldDetailLite>(
      `/worlds/${character.worldId}`,
      session.access_token,
    );
    callerRole = world.callerRole;
  } catch {
    callerRole = null;
  }

  const classSummary = buildClassSummary(data);
  const statusBanner = getStatusBanner(character.status);
  const isActive = character.status === 'active';

  // Edit-lock policy (sdd/ficha-restyle — ATRIBUTOS-EDITOR-POLICY-01)
  const statusLocked = (['active', 'retired', 'dead'] as CharacterStatus[]).includes(
    character.status,
  );
  // isDmHere: server-side GM role used by non-reactive DM affordances (ResumenTab, HechizosTab wand).
  // For reactive gating (HP max, ApprovalActions, DmGrantPanel), use DmAwareAffordances / HpEditorSlot.
  const isDmHere = callerRole === 'gm';

  // Derive ability scores from the sheet (pre-racial ASIs already folded in)
  const currentStats = {
    str: sheet.abilityScores.str.score,
    dex: sheet.abilityScores.dex.score,
    con: sheet.abilityScores.con.score,
    int: sheet.abilityScores.int.score,
    wis: sheet.abilityScores.wis.score,
    cha: sheet.abilityScores.cha.score,
  };

  // Hero props
  const { identity } = sheet;
  const totalLevel = identity.totalLevel;
  const firstClass = identity.classes[0] ?? null;
  const raceLabel = identity.race?.slug ?? undefined;
  const classLabel = firstClass?.slug ?? undefined;
  const subclassLabel = firstClass?.subclass?.slug ?? undefined;
  const xpCurrent = character.xp;
  const xpNextThreshold = xpForLevel(totalLevel + 1);

  // Role switcher is shown for GMs only — a real player toggling it can never reach
  // isDmMode=true so the toggle would be a no-op. Hide it for non-GMs (FIX B).
  const isGm = callerRole === 'gm';

  // rightAction: for GMs we always include the RoleSwitcher alongside the Activo pill.
  // This ensures the role switcher is never suppressed when rightAction replaces the
  // default TopBar right cluster (which contains canBeDM={isGm} → RoleSwitcher).
  // For non-GMs: show Activo pill alone when active, nothing otherwise.
  const rightAction = isGm ? (
    <div className="flex items-center gap-2">
      {isActive && <Pill tone="primary" size="sm">Activo</Pill>}
      {/* defaultRole='dm' ensures DM affordances are shown by default on first visit */}
      <RoleSwitcher defaultRole="dm" />
    </div>
  ) : isActive ? (
    <Pill tone="primary" size="sm">Activo</Pill>
  ) : undefined;

  return (
    <AppShell
      title={identity.name}
      subtitle={classSummary.toUpperCase()}
      backHref="/personajes"
      rightAction={rightAction}
      constructorHref={`/characters/${id}/wizard/stats`}
      canBeDM={false}
    >
      <div className="space-y-4">
        {statusBanner && (
          <Banner tone={statusBanner.tone}>{statusBanner.text}</Banner>
        )}

        <SheetHero
          name={identity.name}
          raceLabel={raceLabel}
          classes={identity.classes}
          level={totalLevel}
          xpCurrent={xpCurrent}
          xpNextThreshold={xpNextThreshold}
        />

        <VitalGrid
          hp={{ current: currentHp, max: sheet.hitPoints.max, temp: data.tempHp ?? 0 }}
          ac={sheet.armorClass.value}
          initiative={sheet.initiative}
          armorFormula={sheet.armorClass.formula}
          walkSpeed={sheet.speed.walk}
          hpEditorSlot={
            <HpEditorSlot
              serverCallerRole={callerRole}
              isOwner={character.userId === session.user.id}
              characterId={id}
              currentHp={{
                current: currentHp ?? 0,
                max: sheet.hitPoints.max ?? 1,
                temp: data.tempHp ?? 0,
              }}
            />
          }
        />

        <RestActions charId={id} />

        <DmAwareAffordances
          serverCallerRole={callerRole}
          characterId={id}
          characterName={identity.name}
          worldId={character.worldId}
          status={character.status}
        />

        <LevelUpEntryPoint
          characterId={id}
          status={character.status}
          totalLevel={totalLevel}
          xp={xpCurrent}
          isOwner={character.userId === session.user.id}
        />

        {/* REQ-CRG-WIDGET: Recent grants for owner + DM (sdd/inventory-d4-d6). */}
        <RecentGrants
          characterId={id}
          callerRole={callerRole}
          accessToken={session.access_token}
        />

        <SheetTabs activeTab={tab} characterId={id} />

        <div>
          {tab === 'resumen' && (
            <ResumenTab
              sheet={sheet}
              characterId={id}
              characterStatus={character.status}
              statusLocked={statusLocked}
              isDm={isDmHere}
              currentStats={currentStats}
              currentMethod={data.statMethod ?? 'standard-array'}
            />
          )}
          {tab === 'habilidades' && <HabilidadesTab sheet={sheet} />}
          {tab === 'hechizos' && <HechizosTab sheet={sheet} charId={id} isDmHere={isDmHere} />}
          {tab === 'recursos' && (
            <RecursosTab characterId={id} classResources={sheet.classResources ?? {}} />
          )}
          {tab === 'inventario' && (
            <InventarioTab
              characterId={id}
              worldId={character.worldId}
              inventory={inventoryEnriched ?? []}
              sheet={sheet}
            />
          )}
          {tab === 'notas' && (
            <NotasTab
              characterId={id}
              worldId={character.worldId}
              accessToken={session.access_token}
              callerRole={callerRole}
              sub={sub}
            />
          )}
        </div>

        <Link
          href={`/characters/${id}/wizard/stats`}
          className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-ink-mute hover:text-ink-soft transition-colors"
        >
          <Icon name="edit" size={16} />
          Editar personaje en el constructor
        </Link>

        <section
          aria-label="Zona de peligro"
          className="mt-6 rounded-2xl border border-red-200 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-red-400 mb-3">
            Zona de peligro
          </p>
          <ExportButton characterId={id} characterName={identity.name} />
          <DeleteCharacterButton characterId={id} characterName={identity.name} />
        </section>
      </div>
    </AppShell>
  );
}

function getStatusBanner(
  status: CharacterStatus,
): { tone: 'amber' | 'ink' | 'stone'; text: string } | null {
  switch (status) {
    case 'pending_approval':
      return { tone: 'amber', text: 'Pendiente de aprobación del DM' };
    case 'dead':
      return { tone: 'ink', text: 'Descansando en paz' };
    case 'retired':
      return { tone: 'stone', text: 'Retirado' };
    default:
      return null;
  }
}
