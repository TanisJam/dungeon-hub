import { ScreenFrame, ScreenSection } from './_screen-frame';
import { CampanasView } from '@/components/campanas/campanas-view';
import type { CampaignSummary } from '@/components/campanas/types';

/**
 * Screens — flagship page-level compositions reproduced from fixtures.
 *
 * Each screen shows how the cataloged organisms compose into a full mobile screen
 * (375px), with representative fixture data — no auth, no DB, no server actions.
 * The shell (TopBar / TabBar) is a static silhouette (see _screen-frame); the real
 * shell + interactive islands are cataloged under Components.
 */

// ── Campañas fixtures ───────────────────────────────────────────────────────────
const _campDm: CampaignSummary = {
  id: 'cmp-mines',
  name: 'Las Minas Perdidas de Phandelver',
  gmUserId: 'user-dm-01',
  worldId: 'world-faerun',
  createdAt: '2024-03-01T09:00:00Z',
  memberRole: 'gm',
  playersCount: 5,
  sessionsCount: 3,
  nextSession: '2026-06-14T20:00:00Z',
  pendingFichas: 2,
};

const _campPlayer: CampaignSummary = {
  id: 'cmp-strahd',
  name: 'La Maldición de Strahd',
  gmUserId: 'user-dm-02',
  worldId: 'world-barovia',
  createdAt: '2024-01-15T10:00:00Z',
  memberRole: 'player',
  playersCount: 4,
  sessionsCount: 8,
  nextSession: '2026-06-07T21:30:00Z',
  pendingFichas: null,
};

export default function ScreensPage() {
  return (
    <div className="space-y-2 pb-12">
      <h1 className="font-display font-bold text-xl text-ink">Screens</h1>
      <p className="text-xs text-ink-mute">
        Flagship page-level screens reproduced from fixtures (375px, mobile-first). Each composes the
        cataloged organisms into a full screen — no auth, DB, or server actions. The TopBar/TabBar
        shell is a static silhouette; the real shell + islands live under{' '}
        <code className="font-mono text-ink-soft">Components</code>.
      </p>

      <div className="mt-6 space-y-10">
        {/* ── Campañas ── */}
        <ScreenSection
          name="Campañas"
          route="/campanas"
          notes="AppShell + CampanasView. DM: 'Tus campañas como DM' + DashedCTA. Player: 'Donde jugás' (+ 'Donde dirigís' si también dirige)."
        >
          <div className="space-y-1">
            <div className="font-mono text-[10px] text-ink-mute">DM view</div>
            <ScreenFrame title="Campañas" subtitle="TUS CAMPAÑAS — DM" role="dm" activeTab="Mesa">
              <CampanasView role="dm" campaigns={[_campDm]} />
            </ScreenFrame>
          </div>
          <div className="space-y-1">
            <div className="font-mono text-[10px] text-ink-mute">Player view (also GMs)</div>
            <ScreenFrame title="Campañas" subtitle="TUS CAMPAÑAS" role="player" activeTab="Mesa">
              <CampanasView role="player" campaigns={[_campPlayer, _campDm]} />
            </ScreenFrame>
          </div>
        </ScreenSection>
      </div>
    </div>
  );
}
