import { ScreenFrame, ScreenSection } from '../_screen-frame';

// inicio/ organisms (presentational)
import { HeroNextSession } from '@/components/inicio/hero-next-session';
import { QuickActions } from '@/components/inicio/quick-actions';
import { ActiveCharacterCard } from '@/components/inicio/active-character-card';
import { NovedadesFeed } from '@/components/inicio/novedades-feed';
import { DMNextSessionCard } from '@/components/inicio/dm/dm-next-session-card';
import { DMQuickActions } from '@/components/inicio/dm/dm-quick-actions';
import { QuestsSinTocarList } from '@/components/inicio/dm/quests-sin-tocar-list';
import type {
  ActiveCharacter,
  NextCampaign,
  Novedad,
  DMCampaignNextSession,
  QuestSinTocar,
} from '@/components/inicio/types';

// inicio/ interactive islands (catalog)
import { PendingFichasCardTriggerIsland } from '../../components/_islands/pending-fichas-card-trigger-island';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const _nextCampaign: NextCampaign = {
  id: 'cmp-strahd',
  name: 'La Maldición de Strahd',
  tagline: 'El conde espera en las sombras',
  daysToSession: 3,
  nextSession: 'VIE 21:30',
  sessions: 8,
};

const _activeChar: ActiveCharacter = {
  id: 'char-thorne',
  name: 'Thorne Piedrahierro',
  initial: 'T',
  lineage: 'Semielfo · Bardo 4',
  hp: '28/36',
  ac: 14,
  init: 2,
};

const _novedades: Novedad[] = [
  { id: 'nov-1', ttl: 'Korrak subió al nivel 5',            sub: 'Las Minas Perdidas de Phandelver', when: 'hace 2h',  fresh: true  },
  { id: 'nov-2', ttl: 'Lyra envió su ficha para revisión',  sub: 'La Maldición de Strahd',          when: 'hace 5h',  fresh: true  },
  { id: 'nov-3', ttl: 'Sesión 7 marcada como completada',   sub: 'La Maldición de Strahd',          when: 'ayer',     fresh: false },
];

const _dmNextSession: DMCampaignNextSession = {
  id: 'cmp-mines',
  name: 'Las Minas Perdidas de Phandelver',
  tagline: 'El eco de los enanos llama',
  nextSession: 'SÁB 20:00',
  players: 4,
  pendingQuests: 2,
  sessions: 3,
};

const _quests: QuestSinTocar[] = [
  { id: 'quest-1', title: 'El Medallón del Clan Rocaverde', lastChange: 'hace 3 días' },
  { id: 'quest-2', title: 'Vengar a Sildar',                lastChange: 'hace 6 días' },
  { id: 'quest-3', title: 'Limpiar el Castillo Cragmaw',    lastChange: 'hace 8 días' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function InicioScreen() {
  return (
    <ScreenSection
      name="Inicio"
      route="/inicio"
      notes="Player: HeroNextSession → QuickActions → ActiveCharacterCard → NovedadesFeed. DM: PendingFichasCardTriggerIsland → DMNextSessionCard → DMQuickActions → QuestsSinTocarList."
    >
      {/* ── Player view ── */}
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">Player view</div>
        <ScreenFrame title="Inicio" subtitle="TU GREMIO" role="player" activeTab="Inicio">
          <div className="space-y-4">
            <HeroNextSession campaign={_nextCampaign} />
            <QuickActions />
            <ActiveCharacterCard char={_activeChar} />
            <NovedadesFeed items={_novedades} />
          </div>
        </ScreenFrame>
      </div>

      {/* ── DM view ── */}
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">DM view</div>
        <ScreenFrame title="Inicio" subtitle="TU GREMIO — DM" role="dm" activeTab="Inicio">
          <div className="space-y-4">
            <PendingFichasCardTriggerIsland />
            <DMNextSessionCard campaign={_dmNextSession} />
            <DMQuickActions />
            <QuestsSinTocarList quests={_quests} />
          </div>
        </ScreenFrame>
      </div>
    </ScreenSection>
  );
}
