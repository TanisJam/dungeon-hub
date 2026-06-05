import { ScreenFrame, ScreenSection } from '../_screen-frame';

// encuentros/ organisms (presentational)
import { RadialDial } from '@/components/encuentros/radial-dial';
import { TurnBanner } from '@/components/encuentros/turn-banner';
import { RosterList } from '@/components/encuentros/roster-row';
import { Pill } from '@/components/ui/pill';
import type { EncounterCombatant } from '@/components/encuentros/types';

// encuentros/ interactive islands (catalog)
import { RefreshButtonIsland } from '../../components/_islands/refresh-button-island';
import { TurnControlsIslandCatalog } from '../../components/_islands/turn-controls-island-catalog';
import { RageControlsIsland } from '../../components/_islands/rage-controls-island';
import { PassTurnButtonIsland } from '../../components/_islands/pass-turn-button-island';
import { AttackSheetIsland } from '../../components/_islands/attack-sheet-island';
import { ResourcePanelIsland } from '../../components/_islands/resource-panel-island';
import type { ClassResourceView } from '@/lib/sheet-types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const _combatants: EncounterCombatant[] = [
  {
    id: 'c1',
    name: 'Brann',
    kind: 'pc',
    characterId: 'char-1',
    initiative: 18,
    hpCurrent: 28,
    hpMax: 36,
    ac: 14,
    insertionOrder: 1,
    conditions: [],
    effects: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 1,
  },
  {
    id: 'c2',
    name: 'Arken',
    kind: 'pc',
    characterId: 'char-2',
    initiative: 14,
    hpCurrent: 42,
    hpMax: 52,
    ac: 16,
    insertionOrder: 2,
    conditions: [],
    effects: [],
    actionUsed: true,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 0,
  },
  {
    id: 'npc1',
    name: 'Goblin A',
    kind: 'npc',
    characterId: null,
    initiative: 11,
    hpCurrent: 7,
    hpMax: 7,
    ac: 12,
    insertionOrder: 3,
    conditions: [{ name: 'Prone', appliedByCombatantId: 'c1' }],
    effects: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 1,
  },
  {
    id: 'npc2',
    name: 'Goblin B',
    kind: 'npc',
    characterId: null,
    initiative: 9,
    hpCurrent: 0,
    hpMax: 7,
    ac: 12,
    insertionOrder: 4,
    conditions: [{ name: 'Unconscious', appliedByCombatantId: null }],
    effects: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 0,
  },
];

const _bardResources: ClassResourceView[] = [
  { slug: 'bard:bardic-inspiration', classSlug: 'bard', used: 1, max: 4, recoveryTrigger: 'short' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function EncuentrosScreen() {
  return (
    <ScreenSection
      name="Encuentros"
      route="/encuentros/[id]"
      notes="Two frames: GM view (TurnControlsIslandCatalog) + Player-own-turn view (RageControlsIsland + PassTurnButtonIsland + AttackSheetIsland + ResourcePanelIsland). Both share RadialDial → TurnBanner → RefreshButtonIsland → RosterList."
    >
      {/* ── GM view ── */}
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">GM view — Brann&apos;s turn</div>
        <ScreenFrame title="Encuentro" subtitle="ENCUENTRO" role="dm" lead="back" activeTab="Mesa">
          <div className="space-y-3">
            {/* Round / status pill row */}
            <div className="flex items-center gap-2">
              <Pill tone="accent" fill="tint" size="sm">Ronda 3</Pill>
              <Pill tone="primary" fill="solid" size="sm">Activo</Pill>
            </div>
            <RadialDial combatants={_combatants} currentCombatantId="c1" />
            <TurnBanner currentCombatantId="c1" ownCombatantId={null} currentCombatantName="Brann" />
            <RefreshButtonIsland />
            {/* GM-only turn advance control */}
            <TurnControlsIslandCatalog />
            <RosterList combatants={_combatants} currentCombatantId="c1" ownCombatantId={null} />
          </div>
        </ScreenFrame>
      </div>

      {/* ── Player own-turn view ── */}
      <div className="space-y-1">
        <div className="font-mono text-[10px] text-ink-mute">Player view — own turn (Brann)</div>
        <ScreenFrame title="Encuentro" subtitle="ENCUENTRO" role="player" lead="back" activeTab="Mesa">
          <div className="space-y-3">
            {/* Round / status pill row */}
            <div className="flex items-center gap-2">
              <Pill tone="accent" fill="tint" size="sm">Ronda 3</Pill>
              <Pill tone="primary" fill="solid" size="sm">Activo</Pill>
            </div>
            <RadialDial combatants={_combatants} currentCombatantId="c1" />
            <TurnBanner currentCombatantId="c1" ownCombatantId="c1" currentCombatantName="Brann" />
            <RefreshButtonIsland />
            <RosterList combatants={_combatants} currentCombatantId="c1" ownCombatantId="c1" />
            {/* Player action islands */}
            <RageControlsIsland isOwnTurn={true} rageUsesRemaining={2} rageMax={2} />
            <PassTurnButtonIsland isOwnTurn={true} />
            <AttackSheetIsland isOwnTurn={true} actionUsed={false} />
            <ResourcePanelIsland resources={_bardResources} />
          </div>
        </ScreenFrame>
      </div>
    </ScreenSection>
  );
}
