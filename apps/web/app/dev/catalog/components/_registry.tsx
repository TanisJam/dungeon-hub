import type { ReactNode } from 'react';

// wizard/ components (presentational)
import { StatTile } from '@/components/wizard/stat-tile';
import { ReviewBanner } from '@/components/wizard/review-banner';
import { NumberedReviewCard } from '@/components/wizard/numbered-review-card';
import { PublishedSplash } from '@/components/wizard/published-splash';

// sheet/ organisms (presentational)
import { SheetHero } from '@/components/sheet/sheet-hero';
import { VitalGrid } from '@/components/sheet/vital-grid';
import { AbilityScoreGrid } from '@/components/sheet/ability-score-grid';
import type { AbilityScoreEntry } from '@/components/sheet/ability-score-grid';
import { Banner } from '@/components/sheet/banner';
import { SheetTabs } from '@/components/sheet/sheet-tabs';
import type { SheetTab } from '@/components/sheet/sheet-tabs';

// encuentros/ organisms (presentational)
import { RadialDial } from '@/components/encuentros/radial-dial';
import { RosterList } from '@/components/encuentros/roster-row';
import { TurnBanner } from '@/components/encuentros/turn-banner';
import { ConditionBadges } from '@/components/encuentros/condition-badges';
import { PlayerActionPanel } from '@/components/encuentros/player-action-panel';
import { EncuentrosListView } from '@/components/encuentros/encuentros-list-view';
import type { EncounterCombatant } from '@/components/encuentros/types';

// ui/ primitives
import { StatCell } from '@/components/ui/stat-cell';
import { Button } from '@/components/ui/button';
import { CharacterCard } from '@/components/ui/character-card';
import { ScrollNav } from '@/components/ui/scroll-nav';
import { CharacterPortrait } from '@/components/ui/character-portrait';
import { DashedCTA } from '@/components/ui/dashed-cta';
import { ListRow } from '@/components/ui/list-row';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { QuestRow } from '@/components/ui/quest-row';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionHead } from '@/components/ui/section-head';
import { CrowMark } from '@/components/ui/crow-mark';
import { DiscordIcon } from '@/components/ui/discord-icon';
import { V3Empty } from '@/components/ui/empty';
import { ToggleChip } from '@/components/ui/toggle-chip';

// layout/ components
import { AppShell } from '@/components/layout/app-shell';
import { TopBar } from '@/components/layout/topbar';
import { NavProgress } from '@/components/layout/nav-progress';

// form/ primitives
import { FormLabel } from '@/components/ui/form-label';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

// Client islands (thin 'use client' wrappers for server-module compatibility)
import { TabBarIsland } from './_islands/tabbar-island';
import { RoleSwitcherIsland } from './_islands/role-switcher-island';
import { V3SheetIsland } from './_islands/v3-sheet-island';
import { FormInputIsland } from './_islands/form-input-island';
import { ToastIsland } from './_islands/toast-island';
// wizard/ interactive islands
import { StatTileIsland } from './_islands/stat-tile-island';
import { StatCellClickableIsland } from './_islands/stat-cell-island';
import { ChoiceCardIsland } from './_islands/choice-card-island';
import { ChoiceListIsland } from './_islands/choice-list-island';
import { CharacterNameInputIsland } from './_islands/character-name-input-island';
import { WizardFooterNavIsland } from './_islands/wizard-footer-nav-island';

// encuentros/ interactive islands
import { ResourcePanelIsland } from './_islands/resource-panel-island';
import { AttackSheetIsland } from './_islands/attack-sheet-island';
import { RageControlsIsland } from './_islands/rage-controls-island';
import { PassTurnButtonIsland } from './_islands/pass-turn-button-island';
import { RefreshButtonIsland } from './_islands/refresh-button-island';
import { TurnControlsIslandCatalog } from './_islands/turn-controls-island-catalog';

// ficha/ interactive islands
import { AtributosEditorIsland } from './_islands/atributos-editor-island';
import { AtributosSectionEditorIsland } from './_islands/atributos-section-editor-island';
import { HPEditorIsland } from './_islands/hp-editor-island';
import { HPSectionEditorIsland } from './_islands/hp-section-editor-island';
import { SpellKnownEditorIsland } from './_islands/spell-known-editor-island';
import { SpellKnownSectionEditorIsland } from './_islands/spell-known-section-editor-island';
import { SpellPrepEditorIsland } from './_islands/spell-prep-editor-island';
import { SpellPrepSectionEditorIsland } from './_islands/spell-prep-section-editor-island';
import { ViewOnlySectionSheetIsland } from './_islands/view-only-section-sheet-island';
import {
  BackgroundSectionIsland,
  ClassSectionIsland,
  RaceSectionIsland,
} from './_islands/ficha-sections-island';

// campanas/ organisms (presentational)
import { CampanasView } from '@/components/campanas/campanas-view';
import { V3CampCard } from '@/components/campanas/camp-card';
import { CampanaDetailView } from '@/components/campanas/campana-detail-view';
import type { CampanaSessionRow } from '@/components/campanas/campana-detail-view';
import type { CampaignSummary, CampaignDetail } from '@/components/campanas/types';

// compendium/ renderers
import { CompendiumEntries, EntryNodeRenderer } from '@/components/compendium/index';
import { InlineRenderer } from '@/components/compendium/inline';
import { StatblockNodeView } from '@/components/compendium/nodes/statblock';
import { TableNodeView } from '@/components/compendium/nodes/table';
import { InsetNodeView, InsetReadaloudNodeView } from '@/components/compendium/nodes/inset';
import { ImageNodeView, GalleryNodeView } from '@/components/compendium/nodes/image';
import { QuoteNodeView } from '@/components/compendium/nodes/quote';
// inicio/ interactive islands (batch 7) — DM pending-fichas approval flow.
// All wrap the REAL production components with injected stub actions so the
// catalog never fires the real approve/reject server actions.
import { PendingFichasCardIsland } from './_islands/pending-fichas-card-island';
import { PendingFichasCardTriggerIsland } from './_islands/pending-fichas-card-trigger-island';
import { PendientesActionButtonsIsland } from './_islands/pendientes-action-buttons-island';
import { PendientesFichaCardIsland } from './_islands/pendientes-ficha-card-island';
import { PendientesSheetContentIsland } from './_islands/pendientes-sheet-content-island';

// personajes/ interactive islands (batch 7)
import { SetActiveCharacterButtonIsland } from './_islands/set-active-character-button-island';
import { StatusFilterChipsIsland } from './_islands/status-filter-chips-island';
import { PersonajeCardIsland } from './_islands/personaje-card-island';
import { SubclassPickerIsland, SubclassPickerEmptyIsland } from './_islands/subclass-picker-island';

// compendium/ term-hover system + domain content islands (client)
import { DomainContentIsland } from './_islands/domain-content-island';
import { TermHoverIsland } from './_islands/term-hover-island';
import type {
  Entry,
  EntryNode,
  StatblockNode,
  TableNode,
  InsetNode,
  InsetReadaloudNode,
  ImageNode,
  GalleryNode,
  QuoteNode,
} from '@/components/compendium/types';

// world/ components (presentational)
import { SubNav } from '@/components/world/_shell/sub-nav';
import { EventRowView } from '@/components/world/events/event-row';
import { EventDetailView } from '@/components/world/events/event-detail';
import { FactionRowView } from '@/components/world/factions/faction-row';
import { FactionDetailView } from '@/components/world/factions/faction-detail';
import { JournalRowView } from '@/components/world/journal/journal-row';
import { JournalDetailView } from '@/components/world/journal/journal-detail';
import { HexRowView } from '@/components/world/map/hex-row';
import { NpcRowView } from '@/components/world/npcs/npc-row';
import type { EventRow, EventVisibility } from '@/app/cronica/actions';
import type { JournalRow, JournalVisibility } from '@/app/cronica/actions';
import type { FactionRow, FactionState } from '@/app/codex/actions';
import type { NpcRow, NpcStatus } from '@/app/codex/actions';
import type { HexRow, HexStatus } from '@/app/mapa/actions';

// world/ interactive islands (batch 9a)
import { WorldEntityShellIsland } from './_islands/world-entity-shell-island';
import { EventFormIsland } from './_islands/event-form-island';
import { FactionFormIsland } from './_islands/faction-form-island';
import { JournalFormIsland } from './_islands/journal-form-island';
import { NpcFormIsland } from './_islands/npc-form-island';
import { HexFormIsland } from './_islands/hex-form-island';
import { PoiFormIsland } from './_islands/poi-form-island';
import { HexDetailViewIsland } from './_islands/hex-detail-view-island';
import { PoiAccordionIsland } from './_islands/poi-accordion-island';
import { PoiDetailIsland } from './_islands/poi-detail-island';
import { PoiMapDrawerIsland } from './_islands/poi-map-drawer-island';
import { FactionChipSectionIsland } from './_islands/faction-chip-section-island';
import { WorldMapPlaceholderIsland } from './_islands/world-map-placeholder-island';
// world/ orchestrator islands (batch 9b)
import { EventClientWrapperIsland } from './_islands/event-client-wrapper-island';
import { FactionClientWrapperIsland } from './_islands/faction-client-wrapper-island';
import { JournalClientWrapperIsland } from './_islands/journal-client-wrapper-island';
import { HexClientWrapperIsland } from './_islands/hex-client-wrapper-island';
import { NpcClientWrapperIsland } from './_islands/npc-client-wrapper-island';
import { NpcDetailViewIsland } from './_islands/npc-detail-view-island';

// inicio/ organisms (presentational)
import { ActiveCharacterCard } from '@/components/inicio/active-character-card';
import { HeroNextSession } from '@/components/inicio/hero-next-session';
import { NovedadesFeed } from '@/components/inicio/novedades-feed';
import { QuickActions } from '@/components/inicio/quick-actions';
import { DMNextSessionCard } from '@/components/inicio/dm/dm-next-session-card';
import { DMQuickActions } from '@/components/inicio/dm/dm-quick-actions';
import { QuestsSinTocarList } from '@/components/inicio/dm/quests-sin-tocar-list';
import type {
  ActiveCharacter,
  NextCampaign,
  Novedad,
  PendingFichaSummary,
  DMCampaignNextSession,
  QuestSinTocar,
} from '@/components/inicio/types';

// Re-export types for page.tsx
export type { ComponentGroup, ComponentEntry, VariantCombination } from './_registry-types';
import type { ComponentEntry } from './_registry-types';

// ── ui/ group ─────────────────────────────────────────────────────────────────

const statCellEntry: ComponentEntry = {
  id: 'stat-cell',
  name: 'StatCell',
  group: 'ui',
  notes: [
    'Unified stat tile atom. Surface: surface (default bg-surface+border-line) | paper (bg-paper-soft, no border).',
    'Size: default (text-2xl) | compact (text-lg, e.g. "12 / 20").',
    'Accent: teal (ficha-vital-ac glow) | magenta (ficha-vital-init glow) | peach (ficha-vital-hp gradient bg).',
    'value={null} → dashed border + em-dash placeholder.',
    'selected → 2px accent ring.',
    'onClick → renders as <button> with hover+active transitions.',
    'sub: string → ink-soft 10px span; ReactNode (Pill etc.) → rendered directly.',
    'footer: slot below sub-line (HP bar, editor button, etc.).',
  ].join(' '),
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Default surface — FUE 16' },
    { _label: 'Compact size — HP 28 / 36' },
    { _label: 'Paper surface — CON 14 +2' },
    { _label: 'Accent teal — AC 15' },
    { _label: 'Accent magenta — Initiative +2' },
    { _label: 'Accent peach — HP tile' },
    { _label: 'Selected state — FUE 16' },
    { _label: 'Interactive (onClick) — DEX 14' },
    { _label: 'Unassigned (value=null)' },
    { _label: 'Sub as Pill — roll tile' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';

    if (label.includes('Compact size')) {
      return (
        <StatCell label="Puntos de Golpe" value="28 / 36" size="compact" accent="peach" />
      );
    }
    if (label.includes('Paper surface')) {
      return <StatCell label="CON" value={14} sub="+2" surface="paper" />;
    }
    if (label.includes('Accent teal')) {
      return <StatCell label="Clase Armadura" value={15} accent="teal" sub="Armadura de cuero" />;
    }
    if (label.includes('Accent magenta')) {
      return <StatCell label="Iniciativa" value="+2" accent="magenta" sub="30 ft vel." />;
    }
    if (label.includes('Accent peach')) {
      return <StatCell label="Puntos de Golpe" value="28 / 36" size="compact" accent="peach" />;
    }
    if (label.includes('Selected state')) {
      return <StatCell label="FUE" value={16} sub="+3" selected />;
    }
    if (label.includes('Interactive')) {
      return (
        <div className="w-24">
          <StatCellClickableIsland />
        </div>
      );
    }
    if (label.includes('Unassigned')) {
      return <StatCell label="FUE" value={null} />;
    }
    if (label.includes('Sub as Pill')) {
      return (
        <StatCell
          label="FUE"
          value={15}
          sub={<Pill tone="primary" size="sm">+2</Pill>}
        />
      );
    }
    // Default surface
    return <StatCell label="FUE" value={16} sub="+3" />;
  },
};

const buttonEntry: ComponentEntry = {
  id: 'button',
  name: 'Button',
  group: 'ui',
  notes: 'ButtonTone: cta | green | ghost. ButtonSize: sm | md | lg.',
  propsSchema: {
    tone:     { kind: 'enum',    options: ['cta', 'green', 'ghost'] as const, default: 'cta',   label: 'Tone' },
    size:     { kind: 'enum',    options: ['sm', 'md', 'lg'] as const,        default: 'md',    label: 'Size' },
    disabled: { kind: 'boolean', default: false,                                                label: 'Disabled' },
    children: { kind: 'node',    default: 'Save Character',                                     label: 'Label' },
  },
  fixedProps: {},
  matrixMode: 'list',
  explicitCombos: [
    { tone: 'cta',   size: 'md', disabled: false, children: 'Save Character' },
    { tone: 'green', size: 'md', disabled: false, children: 'Confirm' },
    { tone: 'ghost', size: 'md', disabled: false, children: 'Cancel' },
    { tone: 'cta',   size: 'sm', disabled: false, children: 'Small CTA' },
    { tone: 'cta',   size: 'lg', disabled: false, children: 'Large CTA' },
    { tone: 'cta',   size: 'md', disabled: true,  children: 'Disabled' },
    { tone: 'ghost', size: 'md', disabled: true,  children: 'Disabled Ghost' },
  ],
  render: (p) => (
    <Button
      tone={p.tone as 'cta' | 'green' | 'ghost'}
      size={p.size as 'sm' | 'md' | 'lg'}
      disabled={p.disabled as boolean}
    >
      {p.children as ReactNode}
    </Button>
  ),
};

const progressBarEntry: ComponentEntry = {
  id: 'progress-bar',
  name: 'ProgressBar',
  group: 'ui',
  notes: 'Thin track + width%-filled bar. Orthogonal axes: tone (accent | arcane | primary) = fill colour; height (sm h-1 | md h-1.5); optional trackClassName for on-dark/tinted tracks. Clamps 0–100%, max<=0 → 0%. Unifies sheet-hero XP (arcane, on-dark track), vital-grid HP (accent), and the codex discovery bar (primary). NOT for the encumbrance bar (status colours + tick marks).',
  propsSchema: {
    value:  { kind: 'number', default: 6,        label: 'Value' },
    max:    { kind: 'number', default: 10,       label: 'Max' },
    tone:   { kind: 'enum',   options: ['accent', 'arcane', 'primary'] as const, default: 'accent', label: 'Tone (fill)' },
    height: { kind: 'enum',   options: ['sm', 'md'] as const,                     default: 'md',     label: 'Height' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'accent · md · 60%',  tone: 'accent',  height: 'md', value: 6,  max: 10 },
    { _label: 'accent · sm · 60%',  tone: 'accent',  height: 'sm', value: 6,  max: 10 },
    { _label: 'arcane · md · 35%',  tone: 'arcane',  height: 'md', value: 35, max: 100 },
    { _label: 'primary · md · 80%', tone: 'primary', height: 'md', value: 8,  max: 10 },
    { _label: 'clamp >100 → 100%',  tone: 'accent',  height: 'md', value: 15, max: 10 },
    { _label: 'max 0 → 0%',         tone: 'accent',  height: 'md', value: 5,  max: 0  },
  ],
  render: (p) => (
    <ProgressBar
      value={p.value as number}
      max={p.max as number}
      tone={p.tone as 'accent' | 'arcane' | 'primary'}
      height={p.height as 'sm' | 'md'}
      ariaLabel={(p._label as string) ?? 'Progress'}
    />
  ),
};

const pillEntry: ComponentEntry = {
  id: 'pill',
  name: 'Pill',
  group: 'ui',
  notes: [
    'Tones (B3): primary | accent | secondary | ink | stone | amber | danger | success | neutral.',
    'Fill axis: soft (default — zero-visual change for existing callers) | solid (brand bg + on-color text) | outline (transparent bg, colored border+text) | tint (translucent bg + brand border+text).',
    'outline+neutral = on-dark ghost pill (hero level / review level). Wrap in dark bg to preview correctly.',
    'tint+primary/secondary = campañas role-pill pattern.',
    'solid+accent → text-on-accent (dark ink on copper). solid+secondary → text-on-secondary (dark ink on magenta). FLAG for sign-off.',
    'className prop merged last for spacing/positioning.',
  ].join(' '),
  propsSchema: {
    tone:     { kind: 'enum', options: ['primary', 'accent', 'secondary', 'ink', 'stone', 'amber', 'danger', 'success', 'neutral'] as const, default: 'primary', label: 'Tone' },
    fill:     { kind: 'enum', options: ['soft', 'solid', 'outline', 'tint'] as const,                                                         default: 'soft',    label: 'Fill' },
    size:     { kind: 'enum', options: ['sm', 'md'] as const,                                                                                  default: 'md',      label: 'Size' },
    children: { kind: 'node', default: 'Label',                                                                                                label: 'Label' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // ── soft (default) — zero-regression for all existing tones ──
    { _label: 'soft primary',   tone: 'primary',   fill: 'soft',    size: 'md', children: 'Active' },
    { _label: 'soft accent',    tone: 'accent',    fill: 'soft',    size: 'md', children: 'Player' },
    { _label: 'soft secondary', tone: 'secondary', fill: 'soft',    size: 'md', children: 'DM' },
    { _label: 'soft stone',     tone: 'stone',     fill: 'soft',    size: 'md', children: 'Stone' },
    { _label: 'soft amber',     tone: 'amber',     fill: 'soft',    size: 'md', children: 'Amber' },
    { _label: 'soft danger',    tone: 'danger',    fill: 'soft',    size: 'md', children: 'Danger' },
    { _label: 'soft success',   tone: 'success',   fill: 'soft',    size: 'md', children: 'Success' },
    { _label: 'soft neutral',   tone: 'neutral',   fill: 'soft',    size: 'md', children: 'Neutral' },
    // ── solid ──
    { _label: 'solid accent',    tone: 'accent',    fill: 'solid',   size: 'md', children: 'Bardo' },
    { _label: 'solid secondary', tone: 'secondary', fill: 'solid',   size: 'md', children: 'Dirigís' },
    { _label: 'solid primary',   tone: 'primary',   fill: 'solid',   size: 'md', children: 'Online' },
    // ── tint — campañas role-pill pattern ──
    { _label: 'tint primary',   tone: 'primary',   fill: 'tint',    size: 'sm', children: 'Jugás' },
    { _label: 'tint secondary', tone: 'secondary', fill: 'tint',    size: 'sm', children: 'Dirigís' },
    { _label: 'tint accent',    tone: 'accent',    fill: 'tint',    size: 'sm', children: 'Activo' },
    // ── outline on light bg ──
    { _label: 'outline primary',   tone: 'primary',   fill: 'outline', size: 'md', children: 'Online' },
    { _label: 'outline accent',    tone: 'accent',    fill: 'outline', size: 'md', children: 'Activo' },
    { _label: 'outline secondary', tone: 'secondary', fill: 'outline', size: 'md', children: 'DM' },
    // ── outline+neutral — on-dark ghost pill (dark wrapper required for correct preview) ──
    { _label: 'outline neutral dark-bg md — ✦ Nivel 4', tone: 'neutral', fill: 'outline', size: 'md', children: '✦ Nivel 4' },
    { _label: 'outline neutral dark-bg sm — ✦ Nivel 1', tone: 'neutral', fill: 'outline', size: 'sm', children: '✦ Nivel 1' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const pill = (
      <Pill
        tone={p.tone as import('@/components/ui/pill').PillTone}
        fill={p.fill as import('@/components/ui/pill').PillFill}
        size={p.size as 'sm' | 'md'}
      >
        {p.children as ReactNode}
      </Pill>
    );
    if (label.includes('dark-bg')) {
      return (
        <div className="rounded-md bg-ink px-3 py-2 flex items-center">
          {pill}
        </div>
      );
    }
    return pill;
  },
};

const cardEntry: ComponentEntry = {
  id: 'card',
  name: 'Card',
  group: 'ui',
  notes: 'CardVariant: surface | surface-soft | ink.',
  propsSchema: {
    variant:  { kind: 'enum', options: ['surface', 'surface-soft', 'ink'] as const, default: 'surface', label: 'Variant' },
    children: { kind: 'node', default: undefined,                                                       label: 'Content' },
  },
  matrixMode: 'list',
  explicitCombos: [
    {
      variant: 'surface',
      children: (
        <Card variant="surface" className="p-4">
          <p className="text-sm text-ink">Surface card</p>
          <p className="text-xs text-ink-mute">Default variant — border + shadow-stamp-md</p>
        </Card>
      ),
    },
    {
      variant: 'surface-soft',
      children: (
        <Card variant="surface-soft" className="p-4">
          <p className="text-sm text-ink">Surface-soft card</p>
          <p className="text-xs text-ink-mute">Lighter bg + shadow-stamp-sm</p>
        </Card>
      ),
    },
    {
      variant: 'ink',
      children: (
        <Card variant="ink" className="p-4">
          <p className="text-sm text-ink">Ink card</p>
          <p className="text-xs text-ink-mute">Gradient hero treatment</p>
        </Card>
      ),
    },
  ],
  // render returns the pre-built node from explicitCombos (children carries the full Card JSX)
  render: (p) => p.children as ReactNode,
};

const iconEntry: ComponentEntry = {
  id: 'icon',
  name: 'Icon',
  group: 'ui',
  notes: '28 SVG icons. Props: name, size (default 20), strokeWidth (default 1.5).',
  propsSchema: {
    name:        { kind: 'enum',   options: ['shield','sword','scroll','user','dice','sparkle','heart','wand','crown','compass','book','home','eye','check','plus','minus','edit','bag','bolt','arrow-left','arrow-right','flame','bow','cross','leaf','star','feather','hammer'] as const, default: 'shield', label: 'Name' },
    size:        { kind: 'number', default: 20,  label: 'Size' },
    strokeWidth: { kind: 'number', default: 1.5, label: 'Stroke Width' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { name: 'shield',      size: 20, strokeWidth: 1.75 },
    { name: 'sword',       size: 20, strokeWidth: 1.75 },
    { name: 'scroll',      size: 20, strokeWidth: 1.75 },
    { name: 'user',        size: 20, strokeWidth: 1.75 },
    { name: 'dice',        size: 20, strokeWidth: 1.75 },
    { name: 'sparkle',     size: 20, strokeWidth: 1.75 },
    { name: 'heart',       size: 20, strokeWidth: 1.75 },
    { name: 'wand',        size: 20, strokeWidth: 1.75 },
    { name: 'crown',       size: 20, strokeWidth: 1.75 },
    { name: 'compass',     size: 20, strokeWidth: 1.75 },
    { name: 'book',        size: 20, strokeWidth: 1.75 },
    { name: 'home',        size: 20, strokeWidth: 1.75 },
    { name: 'eye',         size: 20, strokeWidth: 1.75 },
    { name: 'check',       size: 20, strokeWidth: 1.75 },
    { name: 'plus',        size: 20, strokeWidth: 1.75 },
    { name: 'minus',       size: 20, strokeWidth: 1.75 },
    { name: 'edit',        size: 20, strokeWidth: 1.75 },
    { name: 'bag',         size: 20, strokeWidth: 1.75 },
    { name: 'bolt',        size: 20, strokeWidth: 1.75 },
    { name: 'arrow-left',  size: 20, strokeWidth: 1.75 },
    { name: 'arrow-right', size: 20, strokeWidth: 1.75 },
    { name: 'shield',      size: 32, strokeWidth: 1 },
  ],
  render: (p) => (
    <Icon
      name={p.name as Parameters<typeof Icon>[0]['name']}
      size={p.size as number}
      strokeWidth={p.strokeWidth as number}
    />
  ),
};

const dashedCtaEntry: ComponentEntry = {
  id: 'dashed-cta',
  name: 'DashedCTA',
  group: 'ui',
  notes: 'Polymorphic "add new" dashed-border CTA. Renders <button> by default, <Link> when href provided. disabled=true applies cursor-not-allowed opacity-70 (no hover). Default padding p-4; override via className.',
  propsSchema: {
    children:  { kind: 'node',    default: 'Crear elemento',  label: 'Label' },
    disabled:  { kind: 'boolean', default: false,              label: 'Disabled' },
    className: { kind: 'string',  label: 'Extra classes (override padding)' },
    href:      { kind: 'string',  label: 'href (renders Link when provided)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { children: 'Iniciar campaña nueva' },
    { children: 'Crear mundo', href: '/campanas/new' },
    { children: 'Crear mundo', href: '/campanas/new', className: 'px-4 py-3' },
    { children: 'Iniciar encuentro nuevo', disabled: true },
  ],
  render: (p) => (
    <DashedCTA
      href={p.href as string | undefined}
      disabled={p.disabled as boolean | undefined}
      className={p.className as string | undefined}
    >
      {p.children as ReactNode}
    </DashedCTA>
  ),
};

const characterPortraitEntry: ComponentEntry = {
  id: 'character-portrait',
  name: 'CharacterPortrait',
  group: 'ui',
  notes: 'Avatar-portrait atom. size="md" (72px square, accent-gold gradient) + size="sm" (48px round, magenta radial). Never hardcodes hex — uses personajes-portrait / pendientes-portrait CSS classes. Layout props (border-r etc.) passed via className.',
  propsSchema: {
    name: { kind: 'string', default: 'Brann Cuervosombrío', label: 'Character name' },
    size: { kind: 'enum', options: ['md', 'sm'] as const, default: 'md', label: 'Size' },
    className: { kind: 'string', label: 'Extra classes (layout / border)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { name: 'Brann Cuervosombrío', size: 'md' },
    { name: 'Brann Cuervosombrío', size: 'md', className: 'border-r border-line' },
    { name: 'Arken Drûm',          size: 'md', className: 'border-r border-accent' },
    { name: 'Lyra',                size: 'sm' },
    { name: '   ',                 size: 'md' },
  ],
  render: (p) => (
    <CharacterPortrait
      name={p.name as string}
      size={p.size as 'md' | 'sm'}
      className={p.className as string | undefined}
    />
  ),
};

const characterCardEntry: ComponentEntry = {
  id: 'character-card',
  name: 'CharacterCard',
  group: 'ui',
  notes: 'Card-strip atom unifying personaje-card and active-character-card. Structure: outer wrapper div (border/ring via className) + <Link> (CharacterPortrait + content slot + chevron ›) + optional action slot (outside Link). Border variant controlled by className prop — callers pass the CSS class directly.',
  propsSchema: {
    href:            { kind: 'string',  default: '/characters/1',                    label: 'href' },
    name:            { kind: 'string',  default: 'Brann Cuervosombrío',              label: 'Character name' },
    portraitClassName: { kind: 'string', label: 'Portrait extra classes (e.g. border-r border-line)' },
    className:       { kind: 'string',  label: 'Root wrapper extra classes (border/ring treatment)' },
    children:        { kind: 'node',    label: 'Content column slot' },
    action:          { kind: 'node',    label: 'Action slot (outside Link)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // Default — plain border
    {
      href: '/characters/1',
      name: 'Brann Cuervosombrío',
      portraitClassName: 'border-r border-line',
      children: (
        <div className="flex flex-col gap-1">
          <div className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink">Brann Cuervosombrío</div>
          <div className="font-sans text-xs italic text-ink-mute">Semielfo · Bardo 4</div>
        </div>
      ),
    },
    // Active highlight (personaje-card highlight=true treatment)
    {
      href: '/characters/2',
      name: 'Arken Drûm',
      portraitClassName: 'border-r border-line',
      className: 'personajes-char-card-active',
      children: (
        <div className="flex flex-col gap-1">
          <div className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink">Arken Drûm</div>
          <div className="font-sans text-xs italic text-ink-mute">Enano · Guerrero 6</div>
        </div>
      ),
    },
    // Accent ring (active-character-card treatment)
    {
      href: '/characters/3',
      name: 'Lyra Luminosa',
      portraitClassName: 'border-r border-accent',
      className: 'border-accent ring-1 ring-accent/30 hover:border-accent',
      children: (
        <div className="flex flex-col gap-1">
          <div className="font-display text-[15px] font-bold leading-tight tracking-tight text-ink">Lyra Luminosa</div>
          <div className="font-sans text-xs italic text-ink-mute">Humana · Clérigo 3</div>
        </div>
      ),
    },
  ],
  render: (p) => (
    <CharacterCard
      href={p.href as string}
      name={p.name as string}
      portraitClassName={p.portraitClassName as string | undefined}
      className={p.className as string | undefined}
      action={p.action as ReactNode}
    >
      {p.children as ReactNode}
    </CharacterCard>
  ),
};

const scrollNavEntry: ComponentEntry = {
  id: 'scroll-nav',
  name: 'ScrollNav',
  group: 'ui',
  notes: 'Horizontal-scroll container primitive. as="nav"|"div" (default div). gap (default gap-1.5). Scrollbar hidden cross-browser ([scrollbar-width:none] + [&::-webkit-scrollbar]:hidden). Adopted by SheetTabs (py-1, as=nav) and StatusFilterChips (pb-0.5). Sub-nav is NOT a scroll strip — it is a segmented control and is intentionally excluded.',
  propsSchema: {
    as:        { kind: 'enum',    options: ['div', 'nav'] as const, default: 'div',      label: 'Element' },
    gap:       { kind: 'string',  default: 'gap-1.5',                                    label: 'Gap class' },
    className: { kind: 'string',  label: 'Extra classes (optional)' },
    children:  { kind: 'node',    label: 'Items' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // SheetTabs strip simulation (as=nav, py-1)
    {
      as: 'nav',
      gap: 'gap-1.5',
      className: 'py-1',
      children: (
        <>
          <a className="flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold ficha-tab-active">Resumen</a>
          <a className="flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold bg-surface border border-line text-ink-mute">Habilidades</a>
          <a className="flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold bg-surface border border-line text-ink-mute">Hechizos</a>
          <a className="flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold bg-surface border border-line text-ink-mute">Recursos</a>
          <a className="flex-shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-semibold bg-surface border border-line text-ink-mute">Inventario</a>
        </>
      ),
    },
    // StatusFilterChips strip simulation (div, pb-0.5)
    {
      as: 'div',
      gap: 'gap-1.5',
      className: 'pb-0.5',
      children: (
        <>
          <a className="shrink-0 rounded-full border border-accent-deep personajes-chip-on px-2.5 py-1 text-[11px] font-semibold">Activos · 3</a>
          <a className="shrink-0 rounded-full border border-line bg-surface text-ink-mute px-2.5 py-1 text-[11px] font-semibold">Pendientes · 1</a>
          <a className="shrink-0 rounded-full border border-line bg-surface text-ink-mute px-2.5 py-1 text-[11px] font-semibold">Retirados</a>
          <a className="shrink-0 rounded-full border border-line bg-surface text-ink-mute px-2.5 py-1 text-[11px] font-semibold">Borradores · 2</a>
          <a className="shrink-0 rounded-full border border-line bg-surface text-ink-mute px-2.5 py-1 text-[11px] font-semibold">Todos</a>
        </>
      ),
    },
  ],
  render: (p) => (
    <ScrollNav
      as={p.as as 'div' | 'nav'}
      gap={p.gap as string | undefined}
      className={p.className as string | undefined}
    >
      {p.children as ReactNode}
    </ScrollNav>
  ),
};

const toastEntry: ComponentEntry = {
  id: 'toast',
  name: 'Toast',
  group: 'ui',
  notes: 'Transient notice banner (warning-soft style). role="status" aria-live="polite". Renders null when message is null. Pair with useToast hook (lib/use-toast) for auto-clear after 3500ms. Adopted by resource-panel + rage-controls.',
  propsSchema: {
    message: { kind: 'string', default: 'El estado cambió, actualizando...', label: 'Message' },
    durationMs: { kind: 'number', default: 3500, label: 'Auto-clear ms' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { message: 'El estado cambió, actualizando...', durationMs: 3500 },
    { message: null, durationMs: 3500 },
  ],
  render: (p) => (
    <ToastIsland
      message={(p.message as string) ?? 'El estado cambió, actualizando...'}
      durationMs={p.durationMs as number | undefined}
    />
  ),
};

const listRowEntry: ComponentEntry = {
  id: 'list-row',
  name: 'ListRow',
  group: 'ui',
  notes: 'Flat divider-style list row. Props: title (required), subtitle? (second line, truncated), trailing? (ReactNode slot — Pill, badge, etc.), className?. Covers NpcRow / FactionRow / EventRow / JournalRow / HexRow.',
  propsSchema: {
    title:    { kind: 'string', default: 'Varis Sombraluz',  label: 'Title' },
    subtitle: { kind: 'string', label: 'Subtitle (optional)' },
    trailing: { kind: 'node',   label: 'Trailing slot (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { title: 'Varis Sombraluz',   trailing: <Pill tone="primary" size="sm">Vivo</Pill> },
    { title: 'Los Cazadores',     trailing: <Pill tone="stone"   size="sm">Dormida</Pill> },
    { title: 'Batalla de la Loma', subtitle: '12 ene. 2024', trailing: <Pill tone="amber" size="sm">Solo DM</Pill> },
    { title: 'Hex (3,4)',          subtitle: 'Bosque',        trailing: <Pill tone="primary" size="sm">Explorada</Pill> },
    { title: 'Una entrada de diario con un título muy largo que debería truncarse correctamente' },
  ],
  render: (p) => (
    <ListRow
      title={p.title as string}
      subtitle={p.subtitle as string | undefined}
      trailing={p.trailing as ReactNode}
    />
  ),
};

const questRowEntry: ComponentEntry = {
  id: 'quest-row',
  name: 'QuestRow',
  group: 'ui',
  notes: 'Card-row atom for dm quest lists. rounded-xl bg-surface-raised. Props: title, subtitle (lastChange line), className?. Icon cell (📜 + inicio-row-quest-ic) + trailing chevron (›). Zero-visual-change replacement for copy-pasted block in quests-sin-tocar-list + pendientes-sheet-content.',
  propsSchema: {
    title:    { kind: 'string', default: 'El correo perdido',           label: 'Title' },
    subtitle: { kind: 'string', default: 'Último cambio: hace 3 días',  label: 'Subtitle' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { title: 'El correo perdido',   subtitle: 'Último cambio: hace 3 días' },
    { title: 'La torre del pacto',  subtitle: 'Último cambio: hace 5 días' },
    { title: 'Un quest con título muy largo que debería truncarse en la card-row', subtitle: 'Último cambio: ayer' },
  ],
  render: (p) => (
    <ul className="w-full">
      <QuestRow
        title={p.title as string}
        subtitle={p.subtitle as string}
      />
    </ul>
  ),
};

const sectionHeadEntry: ComponentEntry = {
  id: 'section-head',
  name: 'SectionHead',
  group: 'ui',
  notes: "Props: size ('sm'|'md', default 'sm'), num (optional), title, meta (optional), description (optional). size='sm': original compact density (items-baseline, pb-1, text-xs pill). size='md': wizard density (mb-5 wrapper, items-center, h-6 pill). B5: merged NumberedSectionHead into SectionHead via size prop.",
  propsSchema: {
    size:        { kind: 'enum',   options: ['sm', 'md'] as const, default: 'sm',       label: 'Size' },
    num:         { kind: 'string', label: 'Num (optional)' },
    title:       { kind: 'string', default: 'Abilities',           label: 'Title' },
    meta:        { kind: 'node',   label: 'Meta (optional)' },
    description: { kind: 'string', label: 'Description (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // size='sm' variants
    { size: 'sm', title: 'Abilities' },
    { size: 'sm', num: '1', title: 'Choose Race' },
    { size: 'sm', num: '★', title: 'Special', meta: '3 slots' },
    // size='md' variants (wizard density)
    { size: 'md', num: '01', title: 'Atributos', meta: 'Paso 1 de 6', description: 'Asigná los seis atributos.' },
    { size: 'md', num: '2',  title: 'Class Features', meta: '3 choices' },
    { size: 'md', num: '3',  title: 'Background', description: 'Your background defines who you were before adventuring.' },
  ],
  render: (p) => (
    <SectionHead
      size={p.size as 'sm' | 'md'}
      num={p.num as string | number | undefined}
      title={p.title as string}
      meta={p.meta as ReactNode}
      description={p.description as string | undefined}
    />
  ),
};

const crowMarkEntry: ComponentEntry = {
  id: 'crow-mark',
  name: 'CrowMark',
  group: 'ui',
  notes: 'App logo mark. No props.',
  propsSchema: {},
  render: () => <CrowMark />,
};

const discordIconEntry: ComponentEntry = {
  id: 'discord-icon',
  name: 'DiscordIcon',
  group: 'ui',
  notes: 'Discord SVG glyph. Props: size (default 20).',
  propsSchema: {
    size: { kind: 'number', default: 20, label: 'Size' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { size: 24 },
    { size: 32 },
  ],
  render: (p) => <DiscordIcon size={p.size as number} />,
};

const emptyEntry: ComponentEntry = {
  id: 'empty',
  name: 'V3Empty',
  group: 'ui',
  notes: 'Empty state component. Props: glyph (IconName), title, sub (optional).',
  propsSchema: {
    glyph:  { kind: 'enum',   options: ['scroll', 'dice', 'shield', 'user'] as const, default: 'scroll', label: 'Glyph' },
    title:  { kind: 'string', default: 'No results',                                                      label: 'Title' },
    sub:    { kind: 'string', label: 'Sub (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { glyph: 'scroll', title: 'No results' },
    { glyph: 'dice',   title: 'Nothing here', sub: 'Try adjusting your filters or search query.' },
  ],
  render: (p) => (
    <V3Empty
      glyph={p.glyph as Parameters<typeof V3Empty>[0]['glyph']}
      title={p.title as string}
      sub={p.sub as string | undefined}
    />
  ),
};

const toggleChipEntry: ComponentEntry = {
  id: 'toggle-chip',
  name: 'ToggleChip',
  group: 'ui',
  notes: [
    'Pill-chip with active/inactive × tone. Extracted from RoleSwitcher.',
    'Tone: accent (default) | secondary.',
    'active=true → brand bg+border+text. active=false → border-line text-ink-mute bg-transparent.',
    'Renders <button type="button"> with aria-pressed / aria-label / title slots.',
    'className merged last.',
  ].join(' '),
  propsSchema: {
    tone:   { kind: 'enum',    options: ['accent', 'secondary'] as const, default: 'accent', label: 'Tone' },
    active: { kind: 'boolean', default: true,                                                 label: 'Active' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'accent active',    tone: 'accent',    active: true  },
    { _label: 'accent inactive',  tone: 'accent',    active: false },
    { _label: 'secondary active', tone: 'secondary', active: true  },
    { _label: 'secondary inactive', tone: 'secondary', active: false },
  ],
  render: (p) => (
    <ToggleChip
      tone={p.tone as 'accent' | 'secondary'}
      active={p.active as boolean}
      ariaLabel={`Chip ${p.tone as string} ${(p.active as boolean) ? 'active' : 'inactive'}`}
    >
      {(p.tone as string) === 'secondary' ? 'DM' : 'PJ'}
    </ToggleChip>
  ),
};

// ── layout/ group ─────────────────────────────────────────────────────────────

const topbarEntry: ComponentEntry = {
  id: 'topbar',
  name: 'TopBar',
  group: 'layout',
  notes: 'Props: title, subtitle?, right?, canBeDM?, hasNotif?, backHref?, roleDefault?.',
  propsSchema: {
    title:    { kind: 'string',  default: 'Inicio', label: 'Title' },
    subtitle: { kind: 'string',  label: 'Subtitle (optional)' },
    hasNotif: { kind: 'boolean', default: false,    label: 'Has Notification' },
    backHref: { kind: 'string',  label: 'Back href (optional)' },
    canBeDM:  { kind: 'boolean', default: false,    label: 'Can Be DM' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { title: 'Inicio',              canBeDM: false },
    { title: 'Campañas',            subtitle: '3 activas', hasNotif: true,  canBeDM: false },
    { title: 'Ficha de Personaje',  backHref: '/personajes',                canBeDM: false },
    { title: 'Inicio',              canBeDM: true,        roleDefault: 'player' },
  ],
  render: (p) => (
    <div className="bg-paper rounded-md overflow-hidden">
      <TopBar
        title={p.title as string}
        subtitle={p.subtitle as string | undefined}
        hasNotif={p.hasNotif as boolean | undefined}
        backHref={p.backHref as string | undefined}
        canBeDM={p.canBeDM as boolean}
        roleDefault={p.roleDefault as 'player' | 'dm' | undefined}
      />
    </div>
  ),
};

const appShellEntry: ComponentEntry = {
  id: 'app-shell',
  name: 'AppShell',
  group: 'layout',
  notes: 'Full page shell: TopBar + main + TabBar. Shown without TabBar to avoid fixed-position clash in catalog.',
  propsSchema: {
    title:   { kind: 'string', default: 'Personajes', label: 'Title' },
    canBeDM: { kind: 'boolean', default: false,        label: 'Can Be DM' },
  },
  render: () => (
    <div className="relative bg-paper rounded-md overflow-hidden" style={{ height: '200px' }}>
      <AppShell title="Personajes" showTabBar={false} canBeDM={false}>
        <p className="text-sm text-ink-mute">Page content renders here inside max-w-sm px-4 py-4.</p>
      </AppShell>
    </div>
  ),
};

const tabbarEntry: ComponentEntry = {
  id: 'tabbar',
  name: 'TabBar',
  group: 'layout',
  notes: 'Client component. Shown via TabBarIsland (static preview wrapper) to avoid route dependency in catalog.',
  propsSchema: {},
  render: () => <TabBarIsland />,
};

const roleSwitcherEntry: ComponentEntry = {
  id: 'role-switcher',
  name: 'RoleSwitcher',
  group: 'layout',
  notes: 'Client component. Animated pill — Jugador/DM. Writes dh:role cookie on toggle.',
  propsSchema: {},
  render: () => <RoleSwitcherIsland />,
};

const navProgressEntry: ComponentEntry = {
  id: 'nav-progress',
  name: 'NavProgress',
  group: 'layout',
  notes: 'Top progress bar, activates on client-side navigation. Nothing visible at rest — renders null when inactive.',
  propsSchema: {},
  render: () => (
    <div className="px-3 py-2 bg-surface rounded text-xs text-ink-mute">
      NavProgress renders <code className="font-mono text-ink-soft">null</code> when no navigation is in progress.
      It activates automatically when a &lt;Link&gt; is clicked.
    </div>
  ),
};

const stepperEntry: ComponentEntry = {
  id: 'stepper',
  name: 'Stepper',
  group: 'layout',
  notes: 'Client component. Wizard step progress bar. Requires a characterId. Shown as static rendering below.',
  propsSchema: {},
  render: () => (
    <div className="overflow-x-auto px-1 py-2">
      <ol className="flex items-center gap-1.5 min-w-max">
        {['Atributos', 'Linaje', 'Clase', 'Trasfondo', 'Equipo', 'Hechizos', 'Revisión'].map((label, i) => (
          <li key={label} className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center h-7 ${i === 1 ? 'gap-2 rounded-pill bg-ink pl-1 pr-3 py-1 text-paper text-xs font-semibold' : 'w-7 justify-center rounded-pill text-xs font-semibold ' + (i < 1 ? 'bg-primary-soft text-primary-deep' : 'bg-surface text-ink-mute border border-line')}`}
            >
              {i + 1}
              {i === 1 && <span className="text-xs font-semibold">{label}</span>}
            </span>
            {i < 6 && <span className="text-line text-xs select-none">›</span>}
          </li>
        ))}
      </ol>
    </div>
  ),
};


// ── sheet/ group ──────────────────────────────────────────────────────────────

const v3SheetEntry: ComponentEntry = {
  id: 'v3-sheet',
  name: 'V3Sheet',
  group: 'sheet',
  notes: 'Client component. Portal-based bottom modal. Props: open, onClose, title?, labelledBy?, children.',
  propsSchema: {},
  render: () => <V3SheetIsland />,
};

const sheetHeroEntry: ComponentEntry = {
  id: 'sheet-hero',
  name: 'SheetHero',
  group: 'sheet',
  notes: 'Character sheet hero section. Portrait (conic ring + initials via characterInitials), name, race/class subtitle, level/class/subclass pills, XP bar. ficha-hero-bg gradient. Props: name, raceLabel?, classLabel?, subclassLabel?, level, xpCurrent, xpNextThreshold.',
  propsSchema: {
    name:            { kind: 'string', default: 'Brann Cuervosombrío',        label: 'Character name' },
    raceLabel:       { kind: 'string', label: 'Race label (optional)' },
    classLabel:      { kind: 'string', label: 'Class label (optional)' },
    subclassLabel:   { kind: 'string', label: 'Subclass label (optional)' },
    level:           { kind: 'number', default: 4,                            label: 'Level' },
    xpCurrent:       { kind: 'number', default: 4200,                         label: 'XP current' },
    xpNextThreshold: { kind: 'number', default: 6500,                         label: 'XP next threshold' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // Full — race + class + subclass, mid XP
    {
      name: 'Brann Cuervosombrío',
      raceLabel: 'Semielfo',
      classLabel: 'Bardo',
      subclassLabel: 'Colegio del Conocimiento',
      level: 4,
      xpCurrent: 4200,
      xpNextThreshold: 6500,
    },
    // No subclass, high XP near threshold
    {
      name: 'Arken Drûm',
      raceLabel: 'Enano',
      classLabel: 'Guerrero',
      level: 6,
      xpCurrent: 21000,
      xpNextThreshold: 23000,
    },
    // Max level (20) — XP bar hidden, MAX label
    {
      name: 'Lyra Luminosa',
      raceLabel: 'Humana',
      classLabel: 'Clérigo',
      level: 20,
      xpCurrent: 355000,
      xpNextThreshold: 355000,
    },
  ],
  render: (p) => (
    <SheetHero
      name={p.name as string}
      raceLabel={p.raceLabel as string | undefined}
      classLabel={p.classLabel as string | undefined}
      subclassLabel={p.subclassLabel as string | undefined}
      level={p.level as number}
      xpCurrent={p.xpCurrent as number}
      xpNextThreshold={p.xpNextThreshold as number}
    />
  ),
};

const vitalGridEntry: ComponentEntry = {
  id: 'vital-grid',
  name: 'VitalGrid',
  group: 'sheet',
  notes: 'HP / AC / Initiative 3-cell grid. HP cell: ficha-vital-hp peach gradient + HP bar. AC cell: ficha-vital-ac cyan glow ring. Init cell: ficha-vital-init copper glow ring. hpEditorSlot?: absolute-positioned slot for DM editor affordance (omit in catalog).',
  propsSchema: {
    hpCurrent:    { kind: 'number', default: 28,   label: 'HP current' },
    hpMax:        { kind: 'number', default: 36,   label: 'HP max' },
    hpTemp:       { kind: 'number', label: 'Temp HP (optional)' },
    ac:           { kind: 'number', default: 14,   label: 'AC' },
    initiative:   { kind: 'number', default: 2,    label: 'Initiative modifier' },
    armorFormula: { kind: 'string', label: 'Armor formula (optional)' },
    walkSpeed:    { kind: 'number', label: 'Walk speed ft (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // Normal — mid HP, AC with formula, speed
    {
      hpCurrent: 28, hpMax: 36, ac: 14, initiative: 2,
      armorFormula: 'Cuero (12 + DES)',
      walkSpeed: 30,
    },
    // Low HP — bar at ~20%
    {
      hpCurrent: 7, hpMax: 36, ac: 14, initiative: 2,
    },
    // Temp HP visible
    {
      hpCurrent: 28, hpMax: 36, hpTemp: 8, ac: 16, initiative: 3,
      armorFormula: 'Malla (16)',
    },
    // Unknown (all null) — dashes
    {
      hpCurrent: null as unknown as number,
      hpMax: null as unknown as number,
      ac: null as unknown as number,
      initiative: null as unknown as number,
    },
  ],
  render: (p) => (
    <VitalGrid
      hp={{ current: p.hpCurrent as number | null, max: p.hpMax as number | null, temp: p.hpTemp as number | undefined }}
      ac={p.ac as number | null}
      initiative={p.initiative as number | null}
      armorFormula={p.armorFormula as string | undefined}
      walkSpeed={p.walkSpeed as number | undefined}
    />
  ),
};

// Fixture scores used across AbilityScoreGrid combos
const _abilityScoresFull: Record<string, AbilityScoreEntry> = {
  str: { score: 16, modifier: 3 },
  dex: { score: 14, modifier: 2 },
  con: { score: 15, modifier: 2 },
  int: { score: 10, modifier: 0 },
  wis: { score: 8,  modifier: -1 },
  cha: { score: 18, modifier: 4 },
};

const _abilityScoresLow: Record<string, AbilityScoreEntry> = {
  str: { score: 8,  modifier: -1 },
  dex: { score: 12, modifier: 1 },
  con: { score: 10, modifier: 0 },
  int: { score: 13, modifier: 1 },
  wis: { score: 14, modifier: 2 },
  cha: { score: 9,  modifier: -1 },
};

const abilityScoreGridEntry: ComponentEntry = {
  id: 'ability-score-grid',
  name: 'AbilityScoreGrid',
  group: 'sheet',
  notes: '6-cell 3×2 grid of ability scores (FUE/DES/CON/INT/SAB/CAR). Each tile: label (9px uppercase tracking), score (2xl display), modifier (xs). bg-paper-soft per tile.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // Fighter-like: high STR/CON
    { _label: 'Fighter-profile (STR 16 / CHA 18)' },
    // All-moderate wizard-like: high INT/WIS
    { _label: 'Wizard-profile (STR 8 / INT 13)' },
  ],
  render: (p) => (
    <AbilityScoreGrid
      scores={(p._label as string)?.includes('Fighter')
        ? (_abilityScoresFull as Parameters<typeof AbilityScoreGrid>[0]['scores'])
        : (_abilityScoresLow as Parameters<typeof AbilityScoreGrid>[0]['scores'])
      }
    />
  ),
};

const bannerEntry: ComponentEntry = {
  id: 'sheet-banner',
  name: 'Banner',
  group: 'sheet',
  notes: 'Reusable notification banner. tone: amber (bg-warning-soft / text-warning-deep / border-warning) | ink (bg-ink / text-surface) | stone (bg-paper-soft / text-ink-soft / border-line) | danger (bg-danger-soft / text-danger / border-danger). Full-width, rounded-md, text-sm font-medium text-center.',
  propsSchema: {
    tone:     { kind: 'enum',    options: ['amber', 'ink', 'stone', 'danger'] as const, default: 'amber', label: 'Tone' },
    children: { kind: 'node',    default: 'Mensaje del sistema',              label: 'Content' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { tone: 'amber',  children: 'Personaje pendiente de aprobación del DM.' },
    { tone: 'ink',    children: 'Tu turno — realizá una acción.' },
    { tone: 'stone',  children: 'Vista de solo lectura. Pedí al DM que habilite edición.' },
    { tone: 'danger', children: 'No se pudo guardar. Revisá tu conexión e intentá de nuevo.' },
  ],
  render: (p) => (
    <Banner tone={p.tone as 'amber' | 'ink' | 'stone' | 'danger'}>
      {p.children as ReactNode}
    </Banner>
  ),
};

const sheetTabsEntry: ComponentEntry = {
  id: 'sheet-tabs',
  name: 'SheetTabs',
  group: 'sheet',
  notes: 'Horizontal scrollable tab strip for the character sheet (ScrollNav as="nav"). 6 tabs: Resumen / Habilidades / Hechizos / Recursos / Inventario / Notas. Active tab gets ficha-tab-active style + accent underline indicator. Server-safe: uses next/link (no handlers).',
  propsSchema: {
    activeTab:   { kind: 'enum', options: ['resumen', 'habilidades', 'hechizos', 'recursos', 'inventario', 'notas'] as const, default: 'resumen', label: 'Active tab' },
    characterId: { kind: 'string', default: 'demo-char-id', label: 'Character ID' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { activeTab: 'resumen',     characterId: 'demo-char-id' },
    { activeTab: 'habilidades', characterId: 'demo-char-id' },
    { activeTab: 'hechizos',    characterId: 'demo-char-id' },
    { activeTab: 'recursos',    characterId: 'demo-char-id' },
    { activeTab: 'inventario',  characterId: 'demo-char-id' },
    { activeTab: 'notas',       characterId: 'demo-char-id' },
  ],
  render: (p) => (
    <SheetTabs
      activeTab={p.activeTab as SheetTab}
      characterId={p.characterId as string}
    />
  ),
};

// ── form/ group ───────────────────────────────────────────────────────────────

const formLabelEntry: ComponentEntry = {
  id: 'form-label',
  name: 'FormLabel',
  group: 'form',
  notes: 'Canonical label style: mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft. Required asterisk via aria-hidden span.',
  propsSchema: {
    htmlFor:  { kind: 'string',  default: 'demo-field', label: 'htmlFor' },
    children: { kind: 'node',    default: 'Field label',  label: 'Label text' },
    required: { kind: 'boolean', default: false,           label: 'Required' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { htmlFor: 'demo-field', children: 'Nombre', required: false },
    { htmlFor: 'demo-field', children: 'Nombre', required: true },
  ],
  render: (p) => (
    <FormLabel htmlFor={p.htmlFor as string} required={p.required as boolean}>
      {p.children as ReactNode}
    </FormLabel>
  ),
};

const formInputEntry: ComponentEntry = {
  id: 'form-input',
  name: 'FormInput',
  group: 'form',
  notes: 'input: min-h-[44px] (REQ-B1-05). multiline=true → textarea without min-h. Spreads all HTML attrs.',
  propsSchema: {
    id:        { kind: 'string',  default: 'demo-input', label: 'id' },
    multiline: { kind: 'boolean', default: false,          label: 'Multiline (textarea)' },
    value:     { kind: 'string',  default: '',             label: 'Value' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { id: 'demo-input',        multiline: false, value: '',         placeholder: 'Nombre del NPC' },
    { id: 'demo-input-multi',  multiline: true,  value: '',         placeholder: 'Descripción…', rows: 3 },
    { id: 'demo-input-filled', multiline: false, value: 'Aragorn', placeholder: 'Nombre del NPC' },
  ],
  render: (p) => (
    <FormInputIsland
      id={p.id as string}
      multiline={p.multiline as boolean}
      value={p.value as string}
      placeholder={p.placeholder as string | undefined}
      rows={p.rows as number | undefined}
    />
  ),
};

const formErrorAlertEntry: ComponentEntry = {
  id: 'form-error-alert',
  name: 'FormErrorAlert',
  group: 'form',
  notes: 'Renders null when message is null/falsy. role="alert" with bg-danger-soft / text-danger tokens (REQ-B1-04).',
  propsSchema: {
    message: { kind: 'string', default: null as unknown as string, label: 'Message (null = renders nothing)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { message: 'El nombre es obligatorio.' },
    { message: 'Error al guardar. Intenta de nuevo.' },
  ],
  render: (p) => <FormErrorAlert message={p.message as string | null} />,
};

const formSubmitButtonEntry: ComponentEntry = {
  id: 'form-submit-button',
  name: 'FormSubmitButton',
  group: 'form',
  notes: 'bg-ink submit treatment (distinct from gradient CTA Button). min-h-[44px]. pending=true → disabled + pendingLabel.',
  propsSchema: {
    pending:      { kind: 'boolean', default: false,        label: 'Pending' },
    idleLabel:    { kind: 'string',  default: 'Crear NPC',  label: 'Idle label' },
    pendingLabel: { kind: 'string',  default: 'Guardando…', label: 'Pending label' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { pending: false, idleLabel: 'Crear NPC',      pendingLabel: 'Guardando…' },
    { pending: true,  idleLabel: 'Guardar cambios', pendingLabel: 'Guardando…' },
    { pending: false, idleLabel: 'Guardar cambios', pendingLabel: 'Guardando…' },
  ],
  render: (p) => (
    <FormSubmitButton
      pending={p.pending as boolean}
      idleLabel={p.idleLabel as string}
      pendingLabel={p.pendingLabel as string}
    />
  ),
};

// ── wizard/ group ─────────────────────────────────────────────────────────────

const statTileEntry: ComponentEntry = {
  id: 'stat-tile',
  name: 'StatTile',
  group: 'wizard',
  notes: "Ability score cell. Shows label (FUE/DES/CON/INT/SAB/CAR), numeric value, and modifier. Unassigned state: dashed border + em-dash. Selected state (isLastSelected): accent ring + bg-accent-soft. Interactive: tap toggles isLastSelected in the island.",
  propsSchema: {
    ability: { kind: 'enum', options: ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const, default: 'str', label: 'Ability' },
    value: { kind: 'number', default: 15, label: 'Score (null = unassigned)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { ability: 'str', value: 15 },
    { ability: 'dex', value: 14 },
    { ability: 'con', value: 13 },
    { ability: 'int', value: 8 },
    { ability: 'wis', value: 10 },
    { ability: 'cha', value: 12 },
    { ability: 'str', value: null },
  ],
  render: (p) => (
    <div className="w-24">
      <StatTileIsland
        ability={p.ability as string}
        value={p.value as number | null}
      />
    </div>
  ),
};

const reviewBannerEntry: ComponentEntry = {
  id: 'review-banner',
  name: 'ReviewBanner',
  group: 'wizard',
  notes: 'Dark gradient hero banner shown at the wizard review step. Props: name, aventureroOf?, raceClassSummary, levelPill?, classPill?, subclassPill?. Stamp badge (LISTO P/APROBAR) always visible top-right.',
  propsSchema: {
    name:             { kind: 'string', default: 'Brann Cuervosombrío',  label: 'Character name' },
    aventureroOf:     { kind: 'string', label: 'World name (optional)' },
    raceClassSummary: { kind: 'string', default: 'Semielfo · Bardo 4',   label: 'Race/class line' },
  },
  matrixMode: 'list',
  explicitCombos: [
    {
      name: 'Brann Cuervosombrío',
      aventureroOf: 'Aventurero de Los Reinos Olvidados',
      raceClassSummary: 'Semielfo · Bardo 4',
    },
    {
      name: 'Arken Drûm',
      raceClassSummary: 'Enano · Guerrero 6',
    },
  ],
  render: (p) => (
    <ReviewBanner
      name={p.name as string}
      aventureroOf={p.aventureroOf as string | undefined}
      raceClassSummary={p.raceClassSummary as string}
      levelPill={{ label: 'Nivel 4' }}
      classPill={{ label: 'Bardo', tone: 'secondary' }}
      subclassPill={{ label: 'Colegio del Conocimiento', tone: 'accent' }}
    />
  ),
};

const numberedReviewCardEntry: ComponentEntry = {
  id: 'numbered-review-card',
  name: 'NumberedReviewCard',
  group: 'wizard',
  notes: 'Review step summary card. Props: num, title, subtitle?, pills?: PillItem[], editHref. Number badge uses accent-soft bg. Edit link (✎ Editar) top-right.',
  propsSchema: {
    num:      { kind: 'string', default: '1',        label: 'Number badge' },
    title:    { kind: 'string', default: 'Semielfo', label: 'Title' },
    subtitle: { kind: 'string', label: 'Subtitle (optional)' },
    editHref: { kind: 'string', default: '#',        label: 'Edit href' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { num: '1', title: 'Semielfo', subtitle: 'Visión en la oscuridad · Resistencia feérica', editHref: '#' },
    { num: '2', title: 'Bardo', subtitle: 'Colegio del Conocimiento', editHref: '#' },
    {
      num: '3',
      title: 'Héroe del Pueblo',
      editHref: '#',
    },
    { num: '4', title: 'Equipo inicial', editHref: '#' },
  ],
  render: (p) => (
    <NumberedReviewCard
      num={p.num as string}
      title={p.title as string}
      subtitle={p.subtitle as string | undefined}
      pills={[
        { label: 'Percepción' },
        { label: 'Historia' },
      ]}
      editHref={p.editHref as string}
    />
  ),
};

const publishedSplashEntry: ComponentEntry = {
  id: 'published-splash',
  name: 'PublishedSplash',
  group: 'wizard',
  notes: 'Final wizard step shown after character submission. Dark gradient announcement card + Pill "Enviado al DM" + CTA link to character profile.',
  propsSchema: {
    characterId:   { kind: 'string', default: 'demo-id',              label: 'Character ID' },
    characterName: { kind: 'string', default: 'Brann Cuervosombrío',  label: 'Character name' },
    raceLabel:     { kind: 'string', default: 'Semielfo',             label: 'Race label' },
    classLabel:    { kind: 'string', default: 'Bardo',                label: 'Class label' },
    level:         { kind: 'number', default: 1,                      label: 'Level' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { characterId: 'demo-id', characterName: 'Brann Cuervosombrío', raceLabel: 'Semielfo', classLabel: 'Bardo', level: 1 },
    { characterId: 'demo-id', characterName: 'Arken Drûm', raceLabel: 'Enano', classLabel: 'Guerrero', level: 1 },
  ],
  render: (p) => (
    <PublishedSplash
      characterId={p.characterId as string}
      characterName={p.characterName as string}
      raceLabel={p.raceLabel as string | undefined}
      classLabel={p.classLabel as string | undefined}
      level={p.level as number}
    />
  ),
};

const choiceCardEntry: ComponentEntry = {
  id: 'choice-card',
  name: 'ChoiceCard',
  group: 'wizard',
  notes: 'Wizard selection card. Header row: gradient icon-square + title + subtitle + pills + check/chevron. Inline detail expands below when selected. Tap to toggle selected state. Interactive via ChoiceCardIsland.',
  propsSchema: {
    title:    { kind: 'string', default: 'Humano', label: 'Title' },
    subtitle: { kind: 'string', label: 'Subtitle (optional)' },
    iconName: { kind: 'enum',   options: ['user', 'sparkle', 'shield', 'scroll', 'sword', 'heart', 'crown', 'compass'] as const, default: 'sparkle', label: 'Icon' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { title: 'Humano',   subtitle: 'Versátil y ambicioso',      iconName: 'user' },
    { title: 'Elfo',     subtitle: 'Gracia, percepción y magia', iconName: 'sparkle' },
    { title: 'Enano',    subtitle: 'Resistencia y tradición',    iconName: 'shield' },
    { title: 'Halfling', subtitle: 'Suerte y agilidad',          iconName: 'heart' },
  ],
  render: (p) => (
    <ChoiceCardIsland
      title={p.title as string}
      subtitle={p.subtitle as string | undefined}
      iconName={p.iconName as Parameters<typeof ChoiceCardIsland>[0]['iconName']}
    />
  ),
};

const choiceListEntry: ComponentEntry = {
  id: 'choice-list',
  name: 'ChoiceList',
  group: 'wizard',
  notes: 'Vertical list of ChoiceCards with single-select. selectedKey toggles: tap selected → deselects. Detail expands inline when selected. Fixture uses 4 race options (Human / Elf / Dwarf / Halfling). Interactive via ChoiceListIsland.',
  propsSchema: {},
  render: () => <ChoiceListIsland />,
};

const characterNameInputEntry: ComponentEntry = {
  id: 'character-name-input',
  name: 'CharacterNameInput',
  group: 'wizard',
  notes: 'Debounced autosave name input shown at wizard review step. Controlled input with idle/saving/saved status feedback. Catalog island simulates save (no real server action — shows "✓ Guardado" after 600ms on blur).',
  propsSchema: {
    initialName: { kind: 'string', default: 'Brann Cuervosombrío', label: 'Initial name' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { initialName: 'Brann Cuervosombrío' },
    { initialName: '' },
  ],
  render: (p) => (
    <CharacterNameInputIsland initialName={p.initialName as string} />
  ),
};

const wizardFooterNavEntry: ComponentEntry = {
  id: 'wizard-footer-nav',
  name: 'WizardFooterNav',
  group: 'wizard',
  notes: 'Fixed-to-bottom footer: ← Atrás ghost button + CTA next button. backHref=undefined → Atrás disabled. pending=true → loading bar + "Guardando…". nextIcon: arrow-right | check. onNext is a no-op in the catalog preview. Note: fixed positioning is visible within the Frame375 scroll area.',
  propsSchema: {
    nextLabel:  { kind: 'string',  default: 'Siguiente', label: 'Next label' },
    nextIcon:   { kind: 'enum',    options: ['arrow-right', 'check'] as const, default: 'arrow-right', label: 'Next icon' },
    pending:    { kind: 'boolean', default: false,        label: 'Pending' },
    disabled:   { kind: 'boolean', default: false,        label: 'Disabled' },
    backHref:   { kind: 'string',  label: 'Back href (optional; absent → Atrás disabled)' },
    error:      { kind: 'string',  label: 'Error message (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { nextLabel: 'Siguiente', nextIcon: 'arrow-right', pending: false, disabled: false, backHref: '#' },
    { nextLabel: 'Siguiente', nextIcon: 'arrow-right', pending: false, disabled: false },
    { nextLabel: 'Publicar personaje', nextIcon: 'check', pending: false, disabled: false, backHref: '#' },
    { nextLabel: 'Siguiente', nextIcon: 'arrow-right', pending: true, disabled: false, backHref: '#' },
    { nextLabel: 'Siguiente', nextIcon: 'arrow-right', pending: false, disabled: true, backHref: '#', error: 'Seleccioná una raza antes de continuar.' },
  ],
  render: (p) => (
    <div className="relative" style={{ minHeight: '120px' }}>
      <WizardFooterNavIsland
        backHref={p.backHref as string | undefined}
        nextLabel={p.nextLabel as string | undefined}
        nextIcon={p.nextIcon as 'arrow-right' | 'check' | undefined}
        pending={p.pending as boolean | undefined}
        disabled={p.disabled as boolean | undefined}
        error={p.error as string | null | undefined}
      />
    </div>
  ),
};

// ── encuentros/ group ─────────────────────────────────────────────────────────

// Shared fixture combatants used across multiple encuentros entries
const _fixtureCombatants: EncounterCombatant[] = [
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

const radialDialEntry: ComponentEntry = {
  id: 'radial-dial',
  name: 'RadialDial',
  group: 'encuentros',
  notes: 'Initiative dial — combatants arranged radially. Each token = first letter of name. Current combatant token gets a highlight ring. Dead combatants (hp=0) dim. Center panel: current name + initiative + HP bar.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // 4 combatants, Brann is current (PC, high init)
    { _label: '4 combatants — Brann current (PC)' },
    // 4 combatants, Goblin A is current (NPC mid-init)
    { _label: '4 combatants — Goblin A current (NPC, prone)' },
  ],
  render: (p) => (
    <RadialDial
      combatants={_fixtureCombatants}
      currentCombatantId={(p._label as string).includes('Goblin') ? 'npc1' : 'c1'}
    />
  ),
};

const rosterListEntry: ComponentEntry = {
  id: 'roster-list',
  name: 'RosterList',
  group: 'encuentros',
  notes: 'Initiative roster — sorted list of combatants (initiative desc, insertionOrder tiebreak). Current row gets current style. Dead rows dim (opacity 0.45). PC vs NPC distinguished by Pill. ConditionBadges inline. Action economy (A/B/R/⚔) shown only for ownCombatantId row.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // Brann is current + own combatant
    { _label: 'Brann current + own (action economy visible)' },
    // Arken is current, Brann is own (action economy on Brann, no own-turn indicator)
    { _label: 'Arken current, Brann own' },
  ],
  render: (p) => {
    const label = p._label as string;
    const currentId = label.includes('Arken current') ? 'c2' : 'c1';
    return (
      <RosterList
        combatants={_fixtureCombatants}
        currentCombatantId={currentId}
        ownCombatantId="c1"
      />
    );
  },
};

const turnBannerEntry: ComponentEntry = {
  id: 'turn-banner',
  name: 'TurnBanner',
  group: 'encuentros',
  notes: 'Sticky top banner. isOwnTurn (currentId === ownId) → "Tu turno" with pulsing primary dot. Else → "Turno de {name}". Presentational server component.',
  propsSchema: {
    currentCombatantId:   { kind: 'string', default: 'c1',   label: 'Current combatant ID' },
    ownCombatantId:       { kind: 'string', default: 'c1',   label: 'Own combatant ID (null = spectator)' },
    currentCombatantName: { kind: 'string', default: 'Brann', label: 'Current combatant name' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // Own turn
    { currentCombatantId: 'c1', ownCombatantId: 'c1', currentCombatantName: 'Brann' },
    // Other player's turn
    { currentCombatantId: 'c2', ownCombatantId: 'c1', currentCombatantName: 'Arken' },
    // NPC turn (spectator mode — ownCombatantId = null)
    { currentCombatantId: 'npc1', ownCombatantId: null as unknown as string, currentCombatantName: 'Goblin A' },
  ],
  render: (p) => (
    <TurnBanner
      currentCombatantId={p.currentCombatantId as string}
      ownCombatantId={(p.ownCombatantId as string | null) ?? null}
      currentCombatantName={p.currentCombatantName as string}
    />
  ),
};

const conditionBadgesEntry: ComponentEntry = {
  id: 'condition-badges',
  name: 'ConditionBadges',
  group: 'encuentros',
  notes: 'PHB Appendix A conditions rendered as amber Pills; spell effects as secondary Pills. Returns null when both arrays are empty (REQ-WCO-WEB-03). B2: migrated from raw inline span to Pill (tone amber+secondary, size sm).',
  propsSchema: {
    conditions: { kind: 'string', default: '', label: 'Condition names (display only)' },
    effects:    { kind: 'string', default: '', label: 'Effect names (display only)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    // Condition only
    { _conditions: ['Prone', 'Poisoned'], _effects: [] },
    // Effect only
    { _conditions: [], _effects: ['Bless', "Hunter's Mark"] },
    // Mixed
    { _conditions: ['Frightened'], _effects: ['Hex'] },
    // Empty → renders null
    { _conditions: [], _effects: [] },
  ],
  render: (p) => (
    <ConditionBadges
      conditions={p._conditions as string[]}
      effects={p._effects as string[]}
    />
  ),
};

const resourcePanelEntry: ComponentEntry = {
  id: 'resource-panel',
  name: 'ResourcePanel',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. Class resource rows with Use/Restore buttons + short/long rest. Calls useResource/restoreResource/shortRest/longRest server actions in production. Catalog island: fixture resources + local state mutation + Toast feedback. No real server calls.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // Fighter resources
    {
      _label: 'Fighter — Second Wind + Indomitable',
      _resources: [
        { slug: 'fighter:second-wind',  classSlug: 'fighter', used: 0, max: 1, recoveryTrigger: 'short' as const },
        { slug: 'fighter:indomitable',  classSlug: 'fighter', used: 1, max: 1, recoveryTrigger: 'long' as const },
      ],
    },
    // Bard resources
    {
      _label: 'Bard — Bardic Inspiration',
      _resources: [
        { slug: 'bard:bardic-inspiration', classSlug: 'bard', used: 2, max: 4, recoveryTrigger: 'short' as const },
      ],
    },
  ],
  render: (p) => (
    <ResourcePanelIsland
      resources={p._resources as Parameters<typeof ResourcePanelIsland>[0]['resources']}
    />
  ),
};

const attackSheetEntry: ComponentEntry = {
  id: 'attack-sheet',
  name: 'AttackSheet',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. 3-step V3Sheet flow: weapon → target → result. Disabled when not own turn or action used. Catalog island: fixture weapons (Espada larga, Daga) + targets (2 Goblins) + stubbed local roll result (no attackApplyAction server call).',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // Own turn, action available
    { _label: 'Own turn — action available', _isOwnTurn: true,  _actionUsed: false },
    // Not own turn — button disabled
    { _label: 'Not own turn — disabled',     _isOwnTurn: false, _actionUsed: false },
    // Action already spent
    { _label: 'Action used — disabled',      _isOwnTurn: true,  _actionUsed: true },
  ],
  render: (p) => (
    <AttackSheetIsland
      isOwnTurn={p._isOwnTurn as boolean}
      actionUsed={p._actionUsed as boolean}
    />
  ),
};

const playerActionPanelEntry: ComponentEntry = {
  id: 'player-action-panel',
  name: 'PlayerActionPanel',
  group: 'encuentros',
  notes: "Pure layout shell for turn-action islands. ADR-3: panel = single-column flex gap-2; each action is its OWN island passed as children. 'use client' on the component itself but contains zero state/handlers. Catalog renders with fixture action button children.",
  propsSchema: {},
  render: () => (
    <PlayerActionPanel>
      <PassTurnButtonIsland isOwnTurn={true} />
    </PlayerActionPanel>
  ),
};

const rageControlsEntry: ComponentEntry = {
  id: 'rage-controls',
  name: 'RageControls',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. Barbarian rage toggle. Disabled when not own turn, bonus action spent, or no uses remain. PHB p.48 — Rage uses per level (2@L1 → Unlimited@L20). Catalog island: local isRaging state + use counter + Toast feedback. No real server calls.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // Own turn, not raging, 2 uses left
    { _label: 'Own turn — 2 uses, not raging', _isOwnTurn: true,  _initialRaging: false, _rageUsesRemaining: 2, _rageMax: 2, _rageUnlimited: false },
    // Already raging — shows "Terminar Furia"
    { _label: 'Own turn — currently raging',   _isOwnTurn: true,  _initialRaging: true,  _rageUsesRemaining: 1, _rageMax: 2, _rageUnlimited: false },
    // L20 unlimited
    { _label: 'Level 20 — Unlimited',          _isOwnTurn: true,  _initialRaging: false, _rageUsesRemaining: 0, _rageMax: 0, _rageUnlimited: true },
    // Not own turn — disabled
    { _label: 'Not own turn — disabled',       _isOwnTurn: false, _initialRaging: false, _rageUsesRemaining: 1, _rageMax: 2, _rageUnlimited: false },
  ],
  render: (p) => (
    <RageControlsIsland
      isOwnTurn={p._isOwnTurn as boolean}
      initialRaging={p._initialRaging as boolean}
      rageUsesRemaining={p._rageUsesRemaining as number}
      rageMax={p._rageMax as number}
      rageUnlimited={p._rageUnlimited as boolean}
    />
  ),
};

const passTurnButtonEntry: ComponentEntry = {
  id: 'pass-turn-button',
  name: 'PassTurnButton',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. Full-width ≥44px ghost button. Disabled when not own turn. PHB p.189 — creature may declare turn complete. Catalog island: no-op handler + brief status feedback.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Own turn — enabled',     _isOwnTurn: true  },
    { _label: 'Not own turn — disabled', _isOwnTurn: false },
  ],
  render: (p) => (
    <PassTurnButtonIsland isOwnTurn={p._isOwnTurn as boolean} />
  ),
};

const refreshButtonEntry: ComponentEntry = {
  id: 'refresh-button',
  name: 'RefreshButton',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. Calls router.refresh() to pull latest encounter state without a full page reload (REQ-WCO-WEB-07). Catalog island: no-op + brief label feedback (does not navigate away from catalog).',
  propsSchema: {},
  render: () => <RefreshButtonIsland />,
};

const turnControlsEntry: ComponentEntry = {
  id: 'turn-controls',
  name: 'TurnControls',
  group: 'encuentros',
  notes: 'INTERACTIVE — client island. DM-only "Próximo turno →" advance button. TurnControls (presentational) + TurnControlsIsland (feature: calls advanceEncounterTurn SA). Catalog uses TurnControlsIslandCatalog which wires no-op advance with local pending state.',
  propsSchema: {},
  render: () => <TurnControlsIslandCatalog />,
};

const encuentrosListViewEntry: ComponentEntry = {
  id: 'encuentros-list-view',
  name: 'EncuentrosListView',
  group: 'encuentros',
  notes: 'Presentational list view. DM role: renders encounter cards (name, campaign, round, status Pills) + disabled DashedCTA. Non-DM role: V3Empty guard. Server component — uses next/link and Pill.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    // DM — 2 encounters
    {
      _label: 'DM — 2 encounters (1 active, 1 closed)',
      _role: 'dm',
      _rows: [
        {
          encounter: { id: 'enc1', campaignId: 'camp1', name: 'Asalto al Goblin Keep', round: 3, status: 'active' as const, currentCombatantId: 'c1', version: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          campaignName: 'Los Reinos Olvidados',
          combatantsCount: 4,
        },
        {
          encounter: { id: 'enc2', campaignId: 'camp1', name: 'Defensa del Puente', round: 7, status: 'completed' as const, currentCombatantId: 'c1', version: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
          campaignName: 'Los Reinos Olvidados',
          combatantsCount: 6,
        },
      ],
    },
    // DM — empty state
    { _label: 'DM — empty (no encounters)', _role: 'dm',    _rows: [] },
    // Non-DM role guard
    { _label: 'Player role — access guard', _role: 'player', _rows: [] },
  ],
  render: (p) => (
    <EncuentrosListView
      role={p._role as string}
      rows={p._rows as Parameters<typeof EncuentrosListView>[0]['rows']}
    />
  ),
};

// ── ficha/ group ──────────────────────────────────────────────────────────────
//
// PAIR ANALYSIS SUMMARY (D2 batch 3)
// ─────────────────────────────────────────────────────────────────────────────
// Pattern: *-editor = form body (owns state + SA call)
//          *-section-editor = pencil/wand button + V3Sheet + *-editor
//
// PAIR 1: AtributosEditor ↔ AtributosSectionEditor
//   Relationship: THIN WRAPPER (clean). SectionEditor adds only open/close state +
//   pencil button affordance + V3Sheet host. No logic duplication.
//   Note: pencil button is 32×32px (below 44px touch target) — minor UX debt.
//
// PAIR 2: HPEditor ↔ HPSectionEditor
//   Relationship: THIN WRAPPER (clean). Same pattern as Pair 1.
//   Note: HPSectionEditor pencil button IS min-h/w 44px (touch-safe) — inconsistency
//   vs AtributosSectionEditor which is only 32×32px.
//
// PAIR 3: SpellKnownEditor ↔ SpellKnownSectionEditor
//   Relationship: WRAPPER WITH EXTRA COMPLEXITY. SectionEditor adds lazy fetch
//   (useEffect + GET /options) + loading/error states + amber wand icon affordance.
//   NOT a thin wrapper — the fetch logic adds real behaviour.
//
// PAIR 4: SpellPrepEditor ↔ SpellPrepSectionEditor
//   Relationship: WRAPPER WITH EXTRA COMPLEXITY. Same pattern as Pair 3 (lazy fetch).
//   SpellPrepSectionEditor vs SpellKnownSectionEditor share the SAME fetch URL and
//   SAME FetchState union — strongest homogenization candidate: extract
//   useSpellOptions(characterId, classSlug) shared hook.
//
// CROSS-PAIR DUPLICATION:
//   BackgroundSection + ClassSection + RaceSection are TRIPLICATE of the same pattern:
//   identical pencil button, identical ViewOnlySectionSheet usage, only display JSX differs.
//   → Extract SectionAffordance<T extends ReactNode>(title, displayContent, ...) component.
//
// RECOMMENDATIONS (priority order):
//   1. useSpellOptions hook (Pair 3 + Pair 4 share the same lazy-fetch pattern)
//   2. SectionAffordance generic (Background/Class/Race triplicate → single component)
//   3. Homogenize pencil button touch target (32×32 vs 44×44 inconsistency)

// Shared fixture ability scores
const _fixtureScoresFull = { str: 16, dex: 14, con: 15, int: 10, wis: 8, cha: 18 };
const _fixtureScoresLocked = { str: 12, dex: 10, con: 14, int: 13, wis: 11, cha: 9 };

const atributosEditorEntry: ComponentEntry = {
  id: 'atributos-editor',
  name: 'AtributosEditor',
  group: 'ficha',
  notes: 'Form body for editing the 6 ability scores. Player mode: editable. Locked mode (statusLocked=true + isDm=false): read-only grid + lock banner. DM overrides lock (isDm=true). Calls saveAtributos server action on submit. PAIR: see AtributosSectionEditor for the pencil+V3Sheet wrapper.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Editable — player mode (statusLocked=false)' },
    { _label: 'DM mode — locked but isDm=true' },
    { _label: 'Locked — statusLocked=true, player (read-only)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('isDm=true');
    const statusLocked = label.includes('statusLocked=true') || label.includes('isDm=true');
    const scores = statusLocked ? _fixtureScoresLocked : _fixtureScoresFull;
    return (
      <AtributosEditorIsland
        currentStats={scores}
        statusLocked={statusLocked}
        isDm={isDm}
      />
    );
  },
};

const atributosSectionEditorEntry: ComponentEntry = {
  id: 'atributos-section-editor',
  name: 'AtributosSectionEditor',
  group: 'ficha',
  notes: 'Pencil affordance (h-8 w-8 — 32px, NOTE: below 44px touch-safe threshold) + V3Sheet host + AtributosEditor. PAIR with AtributosEditor: this is a thin wrapper that adds open/close state + button affordance. Tap the pencil to open the sheet.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Player — unlocked (tap pencil to edit)' },
    { _label: 'DM — locked override (tap pencil to edit)' },
    { _label: 'Player — locked (tap pencil to see read-only form)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('DM');
    const statusLocked = label.includes('locked');
    const scores = statusLocked ? _fixtureScoresLocked : _fixtureScoresFull;
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-mute">Sección Atributos →</span>
        <AtributosSectionEditorIsland
          currentStats={scores}
          statusLocked={statusLocked}
          isDm={isDm}
        />
      </div>
    );
  },
};

const hpEditorEntry: ComponentEntry = {
  id: 'hp-editor',
  name: 'HPEditor',
  group: 'ficha',
  notes: 'Dual-mode HP form. Player mode: current + temp editable, max read-only. DM mode: all 3 editable + "DM Override" amber badge. Uses FormErrorAlert for error display. Calls saveHp server action on submit. PAIR: see HPSectionEditor for the pencil+V3Sheet wrapper.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Player mode — current+temp editable, max read-only' },
    { _label: 'DM mode — all 3 editable + DM Override badge' },
    { _label: 'Player mode — low HP (7/36)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDmHere = label.includes('DM mode');
    const isLow = label.includes('low HP');
    return (
      <HPEditorIsland
        currentHp={{ current: isLow ? 7 : 28, max: 36, temp: 0 }}
        isDmHere={isDmHere}
      />
    );
  },
};

const hpSectionEditorEntry: ComponentEntry = {
  id: 'hp-section-editor',
  name: 'HPSectionEditor',
  group: 'ficha',
  notes: 'Pencil affordance (min-h/w-[44px] — touch-safe, NOTE: larger than AtributosSectionEditor) + V3Sheet host + HPEditor. PAIR with HPEditor: thin wrapper that adds open/close state + button affordance. Inconsistency: 44px here vs 32px in AtributosSectionEditor — homogenization needed.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Player mode (tap pencil)' },
    { _label: 'DM mode (tap pencil)' },
  ],
  render: (p) => {
    const isDmHere = (p._label as string).includes('DM');
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-mute">HP 28/36 →</span>
        <HPSectionEditorIsland
          currentHp={{ current: 28, max: 36, temp: 0 }}
          isDmHere={isDmHere}
        />
      </div>
    );
  },
};

// Fixture spell lists for spell editors
const _fixtureKnownSpells = [
  { slug: 'magic-missile', name: 'Magic Missile', level: 1 },
  { slug: 'shield', name: 'Shield', level: 1 },
  { slug: 'thunderwave', name: 'Thunderwave', level: 1 },
  { slug: 'misty-step', name: 'Misty Step', level: 2 },
  { slug: 'mirror-image', name: 'Mirror Image', level: 2 },
  { slug: 'fireball', name: 'Fireball', level: 3 },
  { slug: 'counterspell', name: 'Counterspell', level: 3 },
];

const spellKnownEditorEntry: ComponentEntry = {
  id: 'spell-known-editor',
  name: 'SpellKnownEditor',
  group: 'ficha',
  notes: 'DM-only toggle list for setting known spells. Checkbox list (max-h-64 scroll). Cantrips filtered defensively. Counter shows selected count in amber. No RAW cap enforcement. Calls saveSpellKnown server action. PAIR: see SpellKnownSectionEditor for the wand+fetch+V3Sheet wrapper.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Wizard Lvl 5 — 2 known pre-selected' },
    { _label: 'Wizard Lvl 5 — all selected' },
    { _label: 'Wizard Lvl 5 — none selected' },
  ],
  render: (p) => {
    const label = p._label as string;
    const known = label.includes('all')
      ? _fixtureKnownSpells.map((s) => s.slug)
      : label.includes('none')
        ? []
        : ['magic-missile', 'shield'];
    return (
      <SpellKnownEditorIsland
        availableSpells={_fixtureKnownSpells}
        currentKnownSlugs={known}
      />
    );
  },
};

const spellKnownSectionEditorEntry: ComponentEntry = {
  id: 'spell-known-section-editor',
  name: 'SpellKnownSectionEditor',
  group: 'ficha',
  notes: 'Amber wand affordance (h-8 w-8, DM visual signal) + lazy GET /options fetch + V3Sheet + SpellKnownEditor. PAIR with SpellKnownEditor. Wrapper adds: (1) amber wand icon vs pencil — DM-distinct styling, (2) lazy fetch (useEffect, loading/error states), (3) same V3Sheet pattern. Catalog bypasses fetch — fixtures injected.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Wizard — 2 known (tap wand to open)' },
    { _label: 'Bard — none known (tap wand to open)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const classSlug = label.includes('Bard') ? 'bard' : 'wizard';
    const known = label.includes('none') ? [] : ['magic-missile', 'shield'];
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-mute">Hechizos conocidos ({classSlug}) →</span>
        <SpellKnownSectionEditorIsland classSlug={classSlug} currentKnownSlugs={known} />
      </div>
    );
  },
};

const _fixturePrepSpells = [
  { slug: 'cure-wounds', source: 'PHB', name: 'Cure Wounds', level: 1 },
  { slug: 'bless', source: 'PHB', name: 'Bless', level: 1 },
  { slug: 'guiding-bolt', source: 'PHB', name: 'Guiding Bolt', level: 1 },
  { slug: 'hold-person', source: 'PHB', name: 'Hold Person', level: 2 },
  { slug: 'spiritual-weapon', source: 'PHB', name: 'Spiritual Weapon', level: 2 },
  { slug: 'dispel-magic', source: 'PHB', name: 'Dispel Magic', level: 3 },
];
const _fixtureGrantedSlugs = ['cure-wounds', 'bless'];

const spellPrepEditorEntry: ComponentEntry = {
  id: 'spell-prep-editor',
  name: 'SpellPrepEditor',
  group: 'ficha',
  notes: 'Toggle list for preparing spells per class. Counter pill (green/amber/danger tones). Subclass domain grants shown always-prepared+disabled. At-limit: disables un-selected. Over-limit: danger tone. More complex than SpellKnownEditor (prepLimit enforcement + domain grants). PAIR: see SpellPrepSectionEditor.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Cleric 5 — 2 domain grants + 1 prepared (prepLimit=8)' },
    { _label: 'Cleric 5 — at limit (8/8)' },
    { _label: 'Cleric 5 — none prepared yet (prepLimit=8)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const initial = label.includes('at limit')
      ? ['guiding-bolt', 'hold-person', 'spiritual-weapon', 'dispel-magic']
      : label.includes('none')
        ? []
        : ['guiding-bolt'];
    const prepLimit = label.includes('at limit') ? 4 : 8;
    return (
      <SpellPrepEditorIsland
        availableSpells={_fixturePrepSpells}
        subclassGrantedSlugs={_fixtureGrantedSlugs}
        initialPreparedSlugs={initial}
        prepLimit={prepLimit}
      />
    );
  },
};

const spellPrepSectionEditorEntry: ComponentEntry = {
  id: 'spell-prep-section-editor',
  name: 'SpellPrepSectionEditor',
  group: 'ficha',
  notes: 'Pencil affordance (h-8 w-8, edit icon, border-line) + lazy GET /options fetch + V3Sheet + SpellPrepEditor. PAIR with SpellPrepEditor. STRONG DUPLICATION with SpellKnownSectionEditor: same fetch URL + same FetchState union. → useSpellOptions(characterId, classSlug) hook would eliminate both. Catalog bypasses fetch.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Cleric — 1 prepared (tap pencil)' },
    { _label: 'Cleric — at limit (tap pencil)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const initial = label.includes('at limit') ? ['guiding-bolt', 'hold-person', 'spiritual-weapon', 'dispel-magic'] : ['guiding-bolt'];
    const prepLimit = label.includes('at limit') ? 4 : 8;
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-mute">Preparar hechizos (cleric) →</span>
        <SpellPrepSectionEditorIsland
          classSlug="cleric"
          initialPreparedSlugs={initial}
          prepLimit={prepLimit}
        />
      </div>
    );
  },
};

const viewOnlySectionSheetEntry: ComponentEntry = {
  id: 'view-only-section-sheet',
  name: 'ViewOnlySectionSheet',
  group: 'ficha',
  notes: 'Read-only display sheet for Race/Class/Background sections. Status-conditional CTA: draft/pending → "Editar" link; active/retired/dead + isDm → "Editar (DM)"; active/retired/dead + player → locked banner. Pure presentation — controlled externally (open/onClose). Shared by Background/Class/Race section components.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Draft — "Editar" link shown' },
    { _label: 'Active + DM — "Editar (DM)" link shown' },
    { _label: 'Active + player — locked banner' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('DM');
    const status = label.includes('Active') ? 'active' : 'draft';
    const displayContent = (
      <div className="space-y-1">
        <p className="text-sm text-ink">Semielfo</p>
        <p className="text-xs text-ink-mute">Herencia feérica</p>
      </div>
    );
    return (
      <ViewOnlySectionSheetIsland
        title="Linaje"
        characterStatus={status}
        isDm={isDm}
        displayContent={displayContent}
        wizardStepHref="#"
      />
    );
  },
};

const backgroundSectionEntry: ComponentEntry = {
  id: 'background-section',
  name: 'BackgroundSection',
  group: 'ficha',
  notes: 'Pencil affordance + ViewOnlySectionSheet for the Trasfondo section. TRIPLICATE pattern with ClassSection + RaceSection: identical pencil button, identical ViewOnlySectionSheet usage — only display JSX differs. → Homogenization candidate: generic SectionAffordance component.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Draft — can edit (tap pencil)' },
    { _label: 'Active + player — locked (tap pencil to see)' },
    { _label: 'Active + DM — can edit (tap pencil)' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('DM');
    const status = label.includes('Active') ? ('active' as const) : ('draft' as const);
    return <BackgroundSectionIsland characterStatus={status} isDm={isDm} />;
  },
};

const classSectionEntry: ComponentEntry = {
  id: 'class-section',
  name: 'ClassSection',
  group: 'ficha',
  notes: 'Pencil affordance + ViewOnlySectionSheet for the Clase section. TRIPLICATE pattern with BackgroundSection + RaceSection. Displays class list (slug + level + optional subclass). → Homogenization candidate: generic SectionAffordance component.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Draft — Fighter 6 (Champion)' },
    { _label: 'Active + player — locked' },
    { _label: 'Active + DM — can edit' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('DM');
    const status = label.includes('Active') ? ('active' as const) : ('draft' as const);
    return <ClassSectionIsland characterStatus={status} isDm={isDm} />;
  },
};

const raceSectionEntry: ComponentEntry = {
  id: 'race-section',
  name: 'RaceSection',
  group: 'ficha',
  notes: 'Pencil affordance + ViewOnlySectionSheet for the Linaje section. TRIPLICATE pattern with BackgroundSection + ClassSection. Displays race + optional subrace. → Homogenization candidate: generic SectionAffordance component.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Draft — Semielfo + subrace' },
    { _label: 'Active + player — locked' },
    { _label: 'Active + DM — can edit' },
  ],
  render: (p) => {
    const label = p._label as string;
    const isDm = label.includes('DM');
    const status = label.includes('Active') ? ('active' as const) : ('draft' as const);
    return <RaceSectionIsland characterStatus={status} isDm={isDm} />;
  },
};

// ── campanas/ group ───────────────────────────────────────────────────────────

// Shared fixture campaigns used across campanas entries
const _fixtureCampaignPlayer: CampaignSummary = {
  id: 'cmp-strahd',
  name: 'La Maldición de Strahd',
  gmUserId: 'user-dm-01',
  worldId: 'world-barovia',
  createdAt: '2024-01-15T10:00:00Z',
  memberRole: 'player',
  status: 'active',
  playersCount: 4,
  sessionsCount: 8,
  nextSession: '2026-06-07T21:30:00Z',
  pendingFichas: null,
};

const _fixtureCampaignDm: CampaignSummary = {
  id: 'cmp-mines',
  name: 'Las Minas Perdidas de Phandelver',
  gmUserId: 'user-dm-01',
  worldId: 'world-faerun',
  createdAt: '2024-03-01T09:00:00Z',
  memberRole: 'gm',
  status: 'active',
  playersCount: 5,
  sessionsCount: 3,
  nextSession: '2026-06-14T20:00:00Z',
  pendingFichas: 2,
};

const _fixtureCampaignDetail: CampaignDetail = {
  ..._fixtureCampaignDm,
  callerRole: 'gm',
  tagline: 'Aventuras en el Filo del Mundo',
  members: [
    { userId: 'user-dm-01', username: 'Aurelion', role: 'gm', joinedAt: '2024-03-01T09:00:00Z' },
    { userId: 'user-p1',   username: 'Thorne',   role: 'player', joinedAt: '2024-03-02T12:00:00Z' },
    { userId: 'user-p2',   username: 'Lyra',     role: 'player', joinedAt: '2024-03-02T12:30:00Z' },
    { userId: 'user-p3',   username: 'Korrak',   role: 'player', joinedAt: '2024-03-03T18:00:00Z' },
  ],
};

const _fixtureSessions: CampanaSessionRow[] = [
  { id: 'ses-01', title: 'El camino a Phandalin',    status: 'completed',  scheduledAt: '2024-03-10T20:00:00Z', levelMin: null, levelMax: null, maxPlayers: null, currentPlayers: 3, participants: [] },
  { id: 'ses-02', title: 'La guarida de los Trozos', status: 'completed',  scheduledAt: '2024-03-24T20:00:00Z', levelMin: null, levelMax: null, maxPlayers: null, currentPlayers: 3, participants: [] },
  { id: 'ses-03', title: 'Sildar Rescatado',          status: 'completed',  scheduledAt: '2024-04-07T20:00:00Z', levelMin: null, levelMax: null, maxPlayers: null, currentPlayers: 3, participants: [] },
  { id: 'ses-04', title: 'El Castillo Cragmaw',       status: 'scheduled',  scheduledAt: '2026-06-14T20:00:00Z', levelMin: 1,    levelMax: 4,    maxPlayers: 4,    currentPlayers: 2, participants: [] },
];

const campanasViewEntry: ComponentEntry = {
  id: 'campanas-view',
  name: 'CampanasView',
  group: 'campanas',
  notes: 'Campaign list page. role="player" shows player campaigns + optional DM section; role="dm" shows DM campaigns only with "Iniciar campaña nueva" CTA. Props: role, campaigns.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Player role — 1 player + 1 dm campaign' },
    { _label: 'DM role — 1 dm campaign' },
    { _label: 'Player role — empty campaigns' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('DM role')) {
      return (
        <CampanasView
          role="dm"
          campaigns={[_fixtureCampaignDm]}
        />
      );
    }
    if (label.includes('empty campaigns')) {
      return <CampanasView role="player" campaigns={[]} />;
    }
    // Player role default
    return (
      <CampanasView
        role="player"
        campaigns={[_fixtureCampaignPlayer, _fixtureCampaignDm]}
      />
    );
  },
};

const v3CampCardEntry: ComponentEntry = {
  id: 'v3-camp-card',
  name: 'V3CampCard',
  group: 'campanas',
  notes: 'Single campaign card. memberRole="gm" → "Dirigís" pill (secondary tint) + DM styles; "player" → "Jugás" pill (primary tint). Shows name, player count, sessions, next session, and pending fichas (DM only). Props: campaign.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Player card — with next session' },
    { _label: 'DM card — with pending fichas' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('DM card')) {
      return <V3CampCard campaign={_fixtureCampaignDm} />;
    }
    return <V3CampCard campaign={_fixtureCampaignPlayer} />;
  },
};

const campanaDetailViewEntry: ComponentEntry = {
  id: 'campana-detail-view',
  name: 'CampanaDetailView',
  group: 'campanas',
  notes: 'Campaign detail page. Shows campaign header, tagline, members list (with role pills), and sessions list (with status pills + scheduled date). Empty sessions branch renders "No hay sesiones aún". Props: detail, sessions.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Detail — 4 members + 4 sessions' },
    { _label: 'Detail — empty sessions' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('empty sessions')) {
      return <CampanaDetailView detail={_fixtureCampaignDetail} sessions={[]} callerUserId="user-gm-1" worldId={_fixtureCampaignDetail.worldId} callerCharacters={[]} />;
    }
    return <CampanaDetailView detail={_fixtureCampaignDetail} sessions={_fixtureSessions} callerUserId="user-gm-1" worldId={_fixtureCampaignDetail.worldId} callerCharacters={[]} />;
  },
};

// ── inicio/ group ─────────────────────────────────────────────────────────────

const _fixtureActiveCharacter: ActiveCharacter = {
  id: 'char-thorne',
  name: 'Thorne Piedrahierro',
  initial: 'T',
  lineage: 'Semielfo · Bardo 4',
  hp: '28/36',
  ac: 14,
  init: 2,
};

const _fixtureNextCampaign: NextCampaign = {
  id: 'cmp-strahd',
  name: 'La Maldición de Strahd',
  tagline: 'El conde espera en las sombras',
  daysToSession: 3,
  nextSession: 'VIE 21:30',
  sessions: 8,
};

const _fixtureNovedades: Novedad[] = [
  { id: 'nov-1', ttl: 'Korrak subió al nivel 5',             sub: 'Las Minas Perdidas de Phandelver', when: 'hace 2h',    fresh: true  },
  { id: 'nov-2', ttl: 'Lyra envió su ficha para revisión',   sub: 'La Maldición de Strahd',          when: 'hace 5h',    fresh: true  },
  { id: 'nov-3', ttl: 'Sesión 7 marcada como completada',    sub: 'La Maldición de Strahd',          when: 'ayer',       fresh: false },
];

const _fixtureDmNextSession: DMCampaignNextSession = {
  id: 'cmp-mines',
  name: 'Las Minas Perdidas de Phandelver',
  tagline: 'El eco de los enanos llama',
  nextSession: 'SÁB 20:00',
  players: 4,
  pendingQuests: 2,
  sessions: 3,
};

const _fixturePendingFichas: PendingFichaSummary[] = [
  { id: 'ficha-lyra',   portraitInitial: 'L', pj: 'Lyra Luminosa',    lineage: 'Humana · Clérigo 3',   player: 'elena_r',   sent: 'hace 3h',   fresh: true  },
  { id: 'ficha-korrak', portraitInitial: 'K', pj: 'Korrak el Impio',  lineage: 'Orco · Bárbaro 5',     player: 'matias_g',  sent: 'hace 1 día', fresh: false },
];

const _fixtureQuests: QuestSinTocar[] = [
  { id: 'quest-1', title: 'El Medallón del Clan Rocaverde', lastChange: 'hace 3 días'  },
  { id: 'quest-2', title: 'Vengar a Sildar',                 lastChange: 'hace 6 días'  },
  { id: 'quest-3', title: 'Limpiar el Castillo Cragmaw',     lastChange: 'hace 8 días'  },
];

const activeCharacterCardEntry: ComponentEntry = {
  id: 'active-character-card',
  name: 'ActiveCharacterCard',
  group: 'inicio',
  notes: 'Player home widget — active character summary card. Shows name, lineage, HP / AC / Init pills. Links to /characters/:id. Props: char.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Active character — positive init' },
    { _label: 'Active character — negative init' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('negative init')) {
      return (
        <ActiveCharacterCard
          char={{ ..._fixtureActiveCharacter, init: -1, hp: '12/20', name: 'Arken Drûm', lineage: 'Enano · Guerrero 2' }}
        />
      );
    }
    return <ActiveCharacterCard char={_fixtureActiveCharacter} />;
  },
};

const heroNextSessionEntry: ComponentEntry = {
  id: 'hero-next-session',
  name: 'HeroNextSession',
  group: 'inicio',
  notes: 'Player home hero card — next upcoming session. Shows campaign name, optional tagline, days countdown, time slot, and session number pill. Props: campaign.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'With tagline — 3 days out' },
    { _label: 'No tagline — 0 days (today)' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('No tagline')) {
      return (
        <HeroNextSession
          campaign={{ ..._fixtureNextCampaign, tagline: undefined, daysToSession: 0, nextSession: 'HOY 21:30' }}
        />
      );
    }
    return <HeroNextSession campaign={_fixtureNextCampaign} />;
  },
};

const novedadesFeedEntry: ComponentEntry = {
  id: 'novedades-feed',
  name: 'NovedadesFeed',
  group: 'inicio',
  notes: 'Guild news feed. Shows up to 3 novedades with a dot indicator (fresh=true → accent dot). Empty state renders V3Empty. Props: items.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'With 3 novedades — mixed fresh' },
    { _label: 'Empty feed' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Empty')) {
      return <NovedadesFeed items={[]} />;
    }
    return <NovedadesFeed items={_fixtureNovedades} />;
  },
};

const quickActionsEntry: ComponentEntry = {
  id: 'quick-actions',
  name: 'QuickActions',
  group: 'inicio',
  notes: 'Player home 3-cell quick-action grid. Links to /personajes, /compendium, /characters/new. Zero props.',
  propsSchema: {},
  render: () => <QuickActions />,
};

const dmNextSessionCardEntry: ComponentEntry = {
  id: 'dm-next-session-card',
  name: 'DMNextSessionCard',
  group: 'inicio',
  notes: 'DM home hero card — next campaign session. Shows campaign name, optional tagline, player count, optional pending quests, and session number. "Dirigís" solid-secondary pill. Props: campaign.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'With tagline + pending quests' },
    { _label: 'Minimal — no tagline, no pending quests' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Minimal')) {
      return (
        <DMNextSessionCard
          campaign={{ ..._fixtureDmNextSession, tagline: undefined, pendingQuests: undefined }}
        />
      );
    }
    return <DMNextSessionCard campaign={_fixtureDmNextSession} />;
  },
};

const dmQuickActionsEntry: ComponentEntry = {
  id: 'dm-quick-actions',
  name: 'DMQuickActions',
  group: 'inicio',
  notes: 'DM home 3-cell quick-action grid. Iniciativa links to /encuentros; Nuevo NPC and Loot are aria-disabled stubs (future SDDs). Zero props.',
  propsSchema: {},
  render: () => <DMQuickActions />,
};

const pendientesFichaCardEntry: ComponentEntry = {
  id: 'pendientes-ficha-card',
  name: 'PendientesFichaCard',
  group: 'inicio',
  notes: 'DM ficha-approval card. Portrait, PJ name, lineage, player pill, sent-date pill. Renders the real PendientesActionButtons via an island that injects stub actions — approve/reject do NOT fire the real server actions in the catalog. fresh=true → accent border highlight. Props: ficha.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Fresh ficha — Lyra Luminosa' },
    { _label: 'Stale ficha — Korrak el Impio' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const ficha = _fixturePendingFichas.find((f) =>
      label.includes('Korrak') ? f.id === 'ficha-korrak' : f.id === 'ficha-lyra',
    ) ?? _fixturePendingFichas[0]!;
    return <PendientesFichaCardIsland ficha={ficha} />;
  },
};

const pendientesSheetContentEntry: ComponentEntry = {
  id: 'pendientes-sheet-content',
  name: 'PendientesSheetContent',
  group: 'inicio',
  notes: 'DM bottom-sheet body — lists pending fichas (via PendientesFichaCard) and quests sin tocar (via QuestRow). Rendered via an island that injects stub actions — embedded approve/reject do NOT fire the real server actions in the catalog. Props: fichas, quests.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Populated — 2 fichas + 3 quests' },
    { _label: 'Empty — no fichas, no quests' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Empty')) {
      return <PendientesSheetContentIsland fichas={[]} quests={[]} />;
    }
    return <PendientesSheetContentIsland fichas={_fixturePendingFichas} quests={_fixtureQuests} />;
  },
};

const questsSinTocarListEntry: ComponentEntry = {
  id: 'quests-sin-tocar-list',
  name: 'QuestsSinTocarList',
  group: 'inicio',
  notes: 'DM quest list — shows quests that haven\'t been touched recently, each with title and last-change subtitle via QuestRow. Meta count hidden when list is empty. Props: quests.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Populated — 3 quests' },
    { _label: 'Empty — no quests' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Empty')) {
      return <QuestsSinTocarList quests={[]} />;
    }
    return <QuestsSinTocarList quests={_fixtureQuests} />;
  },
};

// ── inicio/ batch 7 additions ─────────────────────────────────────────────────

const pendingFichasCardEntry: ComponentEntry = {
  id: 'pending-fichas-card',
  name: 'PendingFichasCard',
  group: 'inicio',
  notes: 'DM hero card showing pending character approvals. Displays avatar stack (portraitInitial letters), count headline, oldestAge sub-line, and a "Revisar" CTA pill. Rendered as <button> — onClick is supplied by PendingFichasCardTrigger. INTERACTIVE — click stub no-ops in this entry; see PendingFichasCardTrigger for the full trigger+sheet flow.',
  propsSchema: {},
  render: () => <PendingFichasCardIsland />,
};

const pendingFichasCardTriggerEntry: ComponentEntry = {
  id: 'pending-fichas-card-trigger',
  name: 'PendingFichasCardTrigger',
  group: 'inicio',
  notes: 'Client island that wraps PendingFichasCard + V3Sheet (PendientesSheetContent). Tap the card to open the sheet; × or backdrop tap to close. Sheet body lists pending fichas (PendientesFichaCard) and quests (QuestRow). Approve/reject buttons are stubbed — no server action, no router. INTERACTIVE — full open/close flow in catalog.',
  propsSchema: {},
  render: () => <PendingFichasCardTriggerIsland />,
};

const pendientesActionButtonsEntry: ComponentEntry = {
  id: 'pendientes-action-buttons',
  name: 'PendientesActionButtons',
  group: 'inicio',
  notes: 'DM approve/reject/view row for a pending ficha. Buttons: "Aprobar" (magenta), "Ver ficha" (link), "Devolver" (muted). The real component now accepts injectable `actions` (PendientesActions, default = the real server actions); the catalog island injects stubs (~400ms latency + confirmation label) so no real server action fires. INTERACTIVE — client island wrapping the real component.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'ficha-lyra' },
    { _label: 'ficha-korrak' },
  ],
  render: (p) => (
    <PendientesActionButtonsIsland fichaId={(p._label as string) ?? 'ficha-lyra'} />
  ),
};

// ── personajes/ group ─────────────────────────────────────────────────────────

const setActiveCharacterButtonEntry: ComponentEntry = {
  id: 'set-active-character-button',
  name: 'SetActiveCharacterButton',
  group: 'personajes',
  notes: 'Star button (☆/★) that sets the active character lens. ≥44×44px touch target. active=true → filled ★ + text-accent. Production calls setActiveCharacter server action + router.refresh(); catalog toggles local state only — no network, no router. INTERACTIVE — client island with stubbed server action.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'inactive (☆ unfilled)' },
    { _label: 'active (★ filled)' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    return <SetActiveCharacterButtonIsland initialIsActive={label.includes('active (★')} />;
  },
};

const statusFilterChipsEntry: ComponentEntry = {
  id: 'status-filter-chips',
  name: 'StatusFilterChips',
  group: 'personajes',
  notes: 'Horizontal scrollable filter strip for the personajes roster. Chips: Activos, Pendientes, Retirados, Borradores, Todos. Active chip gets personajes-chip-on style. Production uses useSearchParams + Next.js Links; catalog uses local useState + <button> to avoid URL dependency. INTERACTIVE — tap chip to activate.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'active chip selected' },
    { _label: 'pending chip selected' },
    { _label: 'all chip selected' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const initial = label.includes('pending') ? 'pending' : label.includes('all') ? 'all' : 'active';
    return <StatusFilterChipsIsland initialActive={initial as 'active' | 'pending' | 'all'} />;
  },
};

const personajeCardEntry: ComponentEntry = {
  id: 'personaje-card',
  name: 'PersonajeCard',
  group: 'personajes',
  notes: 'Roster character card. CharacterCard + portrait + name/lineage + status Pill + HP Pill (active chars only) + "Jugando" Pill when highlighted. active status rows include a SetActiveCharacterButton star toggle (stubbed in catalog). Production SetActiveCharacterButton calls server action + router.refresh(); catalog uses local toggle. INTERACTIVE — client island; tap star to toggle active state.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'active — star toggle + HP pill + Jugando' },
    { _label: 'pending_approval — no star, no HP' },
    { _label: 'draft — links to wizard' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const variant = label.includes('pending') ? 'pending' : label.includes('draft') ? 'draft' : 'active';
    return <PersonajeCardIsland variant={variant as 'active' | 'pending' | 'draft'} />;
  },
};

const subclassPickerEntry: ComponentEntry = {
  id: 'subclass-picker',
  name: 'SubclassPicker',
  group: 'personajes',
  notes: 'Shared subclass radio-card picker used in wizard class step and level-up flow. ≥80px card height (mobile-first, REQ-CLU-SUB-UI-MOBILE). Selected card: border-accent + bg-accent-soft. Empty options branch renders warning fallback. Fixture: PHB Wizard Arcane Traditions (PHB p.112). INTERACTIVE — tap a card to select/deselect.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Populated — 4 Wizard subclasses' },
    { _label: 'Empty — warning fallback' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Empty')) return <SubclassPickerEmptyIsland />;
    return <SubclassPickerIsland />;
  },
};

// ── compendium/ group ─────────────────────────────────────────────────────────

// Shared fixture data reused across compendium entries
const _compendiumRichEntries: Entry[] = [
  {
    type: 'section',
    name: 'Fireball',
    entries: [
      '3rd-level evocation',
      {
        type: 'entries',
        name: 'Description',
        entries: [
          'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a {@dc 14} {@skill Dexterity} saving throw.',
          'A creature takes {@damage 8d6} fire damage on a failed save, or half as much damage on a successful one.',
          'You can use this to ignite flammable objects in the area that aren\'t being worn or carried. See {@spell fireball|PHB} for full details.',
        ],
      },
      {
        type: 'list',
        items: [
          'Casting Time: 1 action',
          'Range: 150 feet',
          'Components: V, S, M (a tiny ball of bat guano and sulfur)',
          'Duration: Instantaneous',
        ],
      },
      {
        type: 'table',
        caption: 'Upcasting Damage',
        colLabels: ['Slot Level', 'Damage'],
        rows: [
          ['3rd', '{@damage 8d6}'],
          ['4th', '{@damage 9d6}'],
          ['5th', '{@damage 10d6}'],
        ],
      },
      {
        type: 'inset',
        name: 'Designer Note',
        entries: [
          'The 20-foot radius is measured from the point of origin, not from the caster. This matters when the caster is near a wall.',
        ],
      },
      {
        type: 'insetReadaloud',
        entries: [
          'The air crackles with heat as a small bead of fire streaks toward its destination — and then the world ignites.',
        ],
      },
      {
        type: 'quote',
        entries: ['With great power comes great responsibility — and great fire.'],
        by: 'Gandalf the Red (after the incident)',
      },
      {
        type: 'image',
        href: { type: 'internal', path: 'img/spells/fireball.webp' },
        title: 'Fireball eruption',
        altText: 'A massive ball of fire explodes across a dungeon corridor',
      },
      {
        type: 'statblock',
        tag: 'creature',
        name: 'Fire Elemental',
        source: 'MM',
      },
    ],
  },
];

const _compendiumCompositeNode: EntryNode = {
  type: 'entries',
  name: 'Dragon\'s Breath (3rd level)',
  entries: [
    'When you or a creature you choose within range exhales, it deals {@damage 3d6} {@condition prone}-inducing fire damage in a 15-foot cone.',
    {
      type: 'list',
      items: [
        'Range: 60 feet',
        'Duration: 1 minute (concentration)',
        'Save: {@dc 13} Constitution',
      ],
    },
    {
      type: 'inset',
      name: 'At Higher Levels',
      entries: ['When cast using a 4th-level slot, the damage increases by {@damage 1d6} per slot level above 3rd.'],
    },
  ],
};

const compendiumEntriesEntry: ComponentEntry = {
  id: 'compendium-entries',
  name: 'CompendiumEntries',
  group: 'compendium',
  notes: 'Top-level renderer for a 5etools entries array. Dispatches each Entry by type — strings go through StringNode (inline tags), objects go through NODE_REGISTRY. Rich fixture exercises: section, entries, list, table, inset, insetReadaloud, quote, image, statblock nodes.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Fireball spell — rich multi-node fixture' },
  ],
  render: () => <CompendiumEntries entries={_compendiumRichEntries} />,
};

const entryNodeRendererEntry: ComponentEntry = {
  id: 'entry-node-renderer',
  name: 'EntryNodeRenderer',
  group: 'compendium',
  notes: 'Per-entry dispatcher. Exported for recursive use by node components (entries, list, item, table cells). Accepts Entry (string | EntryNode). Fixture: a composite entries node with list and inset.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Composite entries node' },
    { _label: 'Plain string with inline tags' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('string')) {
      const entry: Entry = 'A target must make a {@dc 15} {@skill Strength} saving throw or be pushed {@dice 2d6} × 5 feet away and knocked {@condition prone}.';
      return <EntryNodeRenderer entry={entry} />;
    }
    return <EntryNodeRenderer entry={_compendiumCompositeNode} />;
  },
};

const inlineRendererEntry: ComponentEntry = {
  id: 'inline-renderer',
  name: 'InlineRenderer',
  group: 'compendium',
  notes: 'Tokenizes a 5etools string and renders inline {@tag args} tokens via TAG_REGISTRY. Unknown tags fall through to UnknownTag (keeps prose readable). Fixture covers: {@damage}, {@condition}, {@spell}, {@dice}, {@dc}, {@skill}.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Mixed inline tags — damage + condition + spell' },
    { _label: 'DC + skill save' },
    { _label: 'Plain text — no tags' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('DC')) {
      return <InlineRenderer text="The target must succeed on a {@dc 14} {@skill Dexterity} saving throw or take {@damage 2d6} bludgeoning damage." />;
    }
    if (label.includes('Plain')) {
      return <InlineRenderer text="A creature takes the listed damage and the effect ends at the start of its next turn." />;
    }
    return <InlineRenderer text="On a hit, the target takes {@damage 3d8 + 5} fire damage and is {@condition prone} until the start of your next turn. See {@spell fireball|PHB} for full rules. Roll {@dice 1d20+7} to attack." />;
  },
};

const _statblockFixture: StatblockNode = {
  type: 'statblock',
  tag: 'creature',
  name: 'Goblin',
  source: 'MM',
};

const statblockNodeViewEntry: ComponentEntry = {
  id: 'statblock-node-view',
  name: 'StatblockNodeView',
  group: 'compendium',
  notes: 'v1: renders a data-compendium-ref link-styled span for a creature/object/hazard stat block. No inline expansion yet (future SDD). Props: node (StatblockNode) — requires name, source; tag defaults to "creature".',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Goblin (MM)' },
    { _label: 'Adult Red Dragon (MM)' },
    { _label: 'object tag — Ballista' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Dragon')) {
      const node: StatblockNode = { type: 'statblock', tag: 'creature', name: 'Adult Red Dragon', source: 'MM' };
      return <StatblockNodeView node={node} />;
    }
    if (label.includes('Ballista')) {
      const node: StatblockNode = { type: 'statblock', tag: 'object', name: 'Ballista', source: 'DMG' };
      return <StatblockNodeView node={node} />;
    }
    return <StatblockNodeView node={_statblockFixture} />;
  },
};

const _tableFixture: TableNode = {
  type: 'table',
  caption: 'Wild Magic Surge (d100)',
  colLabels: ['d100', 'Effect'],
  rows: [
    ['01–02', 'Roll on this table at the start of each of your turns for the next minute, ignoring this result on subsequent rolls.'],
    ['03–04', 'For the next minute, you can see any {@condition invisible} creature if you have line of sight to it.'],
    ['05–06', 'A modron chosen and controlled by the DM appears in an unoccupied space within 5 feet of you, then disappears 1 minute later.'],
    ['07–08', 'You cast {@spell fireball} as a 3rd-level spell centered on yourself.'],
    ['09–10', 'You cast {@spell magic missile} as a 5th-level spell.'],
  ],
};

const tableNodeViewEntry: ComponentEntry = {
  id: 'table-node-view',
  name: 'TableNodeView',
  group: 'compendium',
  notes: 'Table renderer with optional caption and column headers. Cells are arbitrary Entry values (go through EntryNodeRenderer, so they can contain inline tags). Fixture: Wild Magic Surge table.',
  propsSchema: {},
  render: () => <TableNodeView node={_tableFixture} />,
};

const _insetFixture: InsetNode = {
  type: 'inset',
  name: 'Variant: Flanking',
  entries: [
    'If a character is wielding a melee weapon and is on the opposite side of the target from an ally, both the character and the ally are flanking the target.',
    'While flanking a target, each flanking creature has advantage on melee attack rolls against that target.',
  ],
};

const _insetReadaloudFixture: InsetReadaloudNode = {
  type: 'insetReadaloud',
  entries: [
    'The iron door groans open, revealing a vast chamber. Columns of obsidian rise to a ceiling lost in shadow. At the far end, upon a throne of bones, sits a figure draped in tattered robes — and it looks up as you enter.',
  ],
};

const insetNodeViewEntry: ComponentEntry = {
  id: 'inset-node-view',
  name: 'InsetNodeView',
  group: 'compendium',
  notes: 'Sidebar callout — neutral surface (bg-paper-soft + border). Renders name as h4 when present, then entries. Fixture: optional Flanking variant rule.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Named inset — Flanking variant' },
    { _label: 'Unnamed inset' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('Unnamed')) {
      const node: InsetNode = {
        type: 'inset',
        entries: ['This rule is optional and applies only when the DM explicitly enables it.'],
      };
      return <InsetNodeView node={node} />;
    }
    return <InsetNodeView node={_insetFixture} />;
  },
};

const insetReadaloudNodeViewEntry: ComponentEntry = {
  id: 'inset-readaloud-node-view',
  name: 'InsetReadaloudNodeView',
  group: 'compendium',
  notes: 'Read-aloud callout — italicised prose on primary-tinted surface (bg-primary-soft). Fixture: dungeon room description the DM reads aloud to players.',
  propsSchema: {},
  render: () => <InsetReadaloudNodeView node={_insetReadaloudFixture} />,
};

const _imageFixture: ImageNode = {
  type: 'image',
  href: { type: 'internal', path: 'img/environments/dungeon-entrance.webp' },
  title: 'Dungeon Entrance',
  altText: 'A stone archway leading into darkness',
  width: 800,
  height: 600,
};

const _galleryFixture: GalleryNode = {
  type: 'gallery',
  images: [
    {
      type: 'image',
      href: { type: 'internal', path: 'img/items/sword-of-sharpness.webp' },
      title: 'Sword of Sharpness',
      altText: 'A gleaming longsword with a razor edge',
    },
    {
      type: 'image',
      href: { type: 'external', url: 'https://5etools-mirror-2.github.io/img/items/bag-of-holding.webp' },
      title: 'Bag of Holding',
      altText: 'A cloth bag that is larger on the inside',
    },
  ],
};

const imageNodeViewEntry: ComponentEntry = {
  id: 'image-node-view',
  name: 'ImageNodeView',
  group: 'compendium',
  notes: 'v1: image nodes render as figure placeholders (data-image-ref attribute for future swap). href: internal (path) or external (url). title / altText used as figcaption. Fixture: internal + external href shapes.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'Internal href' },
    { _label: 'External href' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('External')) {
      const node: ImageNode = {
        type: 'image',
        href: { type: 'external', url: 'https://5etools-mirror-2.github.io/img/environments/market.webp' },
        title: 'Town Market',
        altText: 'A bustling medieval market',
      };
      return <ImageNodeView node={node} />;
    }
    return <ImageNodeView node={_imageFixture} />;
  },
};

const galleryNodeViewEntry: ComponentEntry = {
  id: 'gallery-node-view',
  name: 'GalleryNodeView',
  group: 'compendium',
  notes: 'Grid of ImageNodeView — renders each image in the images array as a figure placeholder. Fixture: 2-item gallery with internal + external href.',
  propsSchema: {},
  render: () => <GalleryNodeView node={_galleryFixture} />,
};

const _quoteFixture: QuoteNode = {
  type: 'quote',
  entries: [
    'Not all those who wander are lost — but most of them forgot to buy a torch.',
  ],
  by: 'Elminster Aumar',
  from: 'Tome of the Wandering Mage',
};

const quoteNodeViewEntry: ComponentEntry = {
  id: 'quote-node-view',
  name: 'QuoteNodeView',
  group: 'compendium',
  notes: 'Block quote — italicised entries on left border (border-secondary). Attribution rendered in footer as em-dash + cite when by or from is present. Fixture: flavor quote with by + from.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'With attribution' },
    { _label: 'No attribution' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    if (label.includes('No attribution')) {
      const node: QuoteNode = {
        type: 'quote',
        entries: ['The dragon does not concern itself with the opinion of the sheep.'],
      };
      return <QuoteNodeView node={node} />;
    }
    return <QuoteNodeView node={_quoteFixture} />;
  },
};

const termHoverEntry: ComponentEntry = {
  id: 'term-hover',
  name: 'Term hover (TermProvider · mockMode)',
  group: 'compendium',
  notes: 'INTERACTIVE — client island. Inline {@kind slug|source} tags become dotted-underline spans whose hover/focus opens a HoverCard (Term/TermCard) with the referenced entry. Production resolves over the API; catalog passes a populated mockMode resolver (Prone / Fireball / Goblin fixtures + one unresolved ref for the error state). Term/TermCard are internal — exercised via the public CompendiumEntriesWithTerms wrapper. Hover/tap a term; tap outside / Esc to dismiss.',
  propsSchema: {},
  preview: 'bare',
  render: () => <TermHoverIsland />,
};

const domainContentEntry: ComponentEntry = {
  id: 'domain-content',
  name: 'Compendium domain content',
  group: 'compendium',
  notes: 'Real /compendium domain renderers (SpellHeader, MonsterStatblockHeader, ItemHeader, RaceHeader, ClassHeader, BackgroundHeader) with representative PHB/MM fixture data — no live API or auth. Each of the 6 categories constrained to 375px (mobile-first). Spell body uses CompendiumEntriesWithTerms in mockMode.',
  propsSchema: {},
  preview: 'bare',
  render: () => <DomainContentIsland />,
};

// ── world/ group ──────────────────────────────────────────────────────────────

const subNavEntry: ComponentEntry = {
  id: 'world-sub-nav',
  name: 'SubNav',
  group: 'world',
  notes: 'Horizontal pill strip for world sub-routes. Each pill is a Next.js Link, ≥44px tall, fills 375px width. Active pill: bg-ink + text-surface. REQ-FAC-04, REQ-GATE-03.',
  propsSchema: {
    activePath: { kind: 'string', default: '/world/npcs', label: 'Current pathname' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { activePath: '/world/npcs' },
    { activePath: '/world/factions' },
  ],
  render: (p) => (
    <SubNav
      items={[
        { label: 'PNJs', href: '/world/npcs' },
        { label: 'Facciones', href: '/world/factions' },
        { label: 'Diario', href: '/world/journal' },
        { label: 'Mapa', href: '/world/map' },
        { label: 'Eventos', href: '/world/events' },
      ]}
      activePath={p.activePath as string}
    />
  ),
};

const _eventRowFixture: EventRow = {
  id: 'evt-01',
  worldId: 'world-01',
  title: 'La Caída del Puente de Vallaki',
  description: 'El puente principal de Vallaki colapsó durante una tormenta, cortando el acceso al norte.',
  dmNotes: 'Strahd lo hizo colapsar intencionalmente para aislar al grupo.',
  occurredAt: '2024-10-15T00:00:00.000Z',
  sourceSessionId: null,
  visibility: 'public' as EventVisibility,
  tags: ['Vallaki', 'infraestructura'],
  createdAt: '2024-10-16T12:00:00.000Z',
  updatedAt: '2024-10-16T12:00:00.000Z',
};

const _eventRowDmOnlyFixture: EventRow = {
  id: 'evt-02',
  worldId: 'world-01',
  title: 'Reunión secreta en el Castillo Ravenloft',
  description: null,
  dmNotes: 'Strahd está preparando el ritual de vinculación. Los jugadores no deben saber aún.',
  occurredAt: '2024-11-01T00:00:00.000Z',
  sourceSessionId: 'session-07',
  visibility: 'dm-only' as EventVisibility,
  tags: ['Ravenloft', 'ritual'],
  createdAt: '2024-11-02T09:00:00.000Z',
  updatedAt: '2024-11-02T09:00:00.000Z',
};

const eventRowViewEntry: ComponentEntry = {
  id: 'world-event-row',
  name: 'EventRowView',
  group: 'world',
  notes: 'Single world-event list row. Renders title + occurredAt formatted date + visibility Pill (public → primary, dm-only → amber). ≥44px via ListRow. REQ-CRO-02.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _event: _eventRowFixture },
    { _event: _eventRowDmOnlyFixture },
  ],
  render: (p) => <EventRowView row={p._event as EventRow} />,
};

const eventDetailViewDmEntry: ComponentEntry = {
  id: 'world-event-detail-dm',
  name: 'EventDetailView (dm)',
  group: 'world',
  notes: 'Event detail — DM view. Shows title, visibility pill, occurredAt, description, tags, dmNotes, and sourceSessionId. REQ-CRO-02, REQ-GATE-01.',
  propsSchema: {},
  render: () => (
    <EventDetailView detail={_eventRowDmOnlyFixture} effectiveView="dm" />
  ),
};

const eventDetailViewPlayerEntry: ComponentEntry = {
  id: 'world-event-detail-player',
  name: 'EventDetailView (player)',
  group: 'world',
  notes: 'Event detail — player view. dm-only events render a "no disponible" fallback. Public events omit dmNotes + sourceSessionId entirely. REQ-CRO-02, REQ-GATE-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'public event — player' },
    { _label: 'dm-only event — player (fallback)' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const detail = label.includes('dm-only') ? _eventRowDmOnlyFixture : _eventRowFixture;
    return <EventDetailView detail={detail} effectiveView="player" />;
  },
};

const _factionRowFixture: FactionRow = {
  id: 'fac-01',
  worldId: 'world-01',
  name: 'Los Vistani',
  state: 'active' as FactionState,
  description: 'Pueblo nómade con lazos misteriosos con Strahd von Zarovich. Controlan las rutas comerciales de Barovia.',
  dmNotes: 'En realidad sirven a Strahd como espías voluntarios.',
  createdAt: '2024-09-01T00:00:00.000Z',
  updatedAt: '2024-10-20T00:00:00.000Z',
};

const _factionRowDormantFixture: FactionRow = {
  id: 'fac-02',
  worldId: 'world-01',
  name: 'La Orden del Dragón de Plata',
  state: 'dormant' as FactionState,
  description: 'Antigua orden paladínica que alguna vez protegió Barovia. Sus miembros restantes se esconden en las montañas.',
  dmNotes: null,
  createdAt: '2024-09-05T00:00:00.000Z',
  updatedAt: '2024-10-10T00:00:00.000Z',
};

const factionRowViewEntry: ComponentEntry = {
  id: 'world-faction-row',
  name: 'FactionRowView',
  group: 'world',
  notes: 'Single faction list row. Renders name + state Pill (active → primary, dormant → stone, destroyed → ink, disbanded → amber). ≥44px via ListRow. REQ-FAC-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _faction: _factionRowFixture },
    { _faction: _factionRowDormantFixture },
  ],
  render: (p) => <FactionRowView row={p._faction as FactionRow} />,
};

const factionDetailViewDmEntry: ComponentEntry = {
  id: 'world-faction-detail-dm',
  name: 'FactionDetailView (dm)',
  group: 'world',
  notes: 'Faction detail — DM view. Shows name, state pill, description, and dmNotes. REQ-FAC-01, REQ-GATE-01.',
  propsSchema: {},
  render: () => (
    <FactionDetailView detail={_factionRowFixture} effectiveView="dm" />
  ),
};

const factionDetailViewPlayerEntry: ComponentEntry = {
  id: 'world-faction-detail-player',
  name: 'FactionDetailView (player)',
  group: 'world',
  notes: 'Faction detail — player view. dmNotes section is absent from DOM entirely. REQ-FAC-01, REQ-GATE-01.',
  propsSchema: {},
  render: () => (
    <FactionDetailView detail={_factionRowFixture} effectiveView="player" />
  ),
};

const _journalRowFixture: JournalRow = {
  id: 'jrn-01',
  worldId: 'world-01',
  title: 'Primera noche en Barovia',
  body: 'Llegamos al pueblo de Barovia al anochecer. Las calles estaban vacías excepto por una niña llorando en el umbral de una puerta...',
  visibility: 'public' as JournalVisibility,
  tags: ['Barovia', 'llegada'],
  authorUserId: 'user-dm-01',
  createdAt: '2024-09-10T20:00:00.000Z',
  updatedAt: '2024-09-10T20:00:00.000Z',
};

const _journalRowDmOnlyFixture: JournalRow = {
  id: 'jrn-02',
  worldId: 'world-01',
  title: 'Notas del DM — Sesión 3',
  body: 'El grupo no sabe aún que Ireena es la reencarnación de Tatyana. Strahd los observó desde la niebla durante toda la noche.',
  visibility: 'dm-only' as JournalVisibility,
  tags: ['DM', 'secreto', 'Ireena'],
  authorUserId: 'user-dm-01',
  createdAt: '2024-09-20T22:00:00.000Z',
  updatedAt: '2024-09-20T22:00:00.000Z',
};

const journalRowViewEntry: ComponentEntry = {
  id: 'world-journal-row',
  name: 'JournalRowView',
  group: 'world',
  notes: 'Single journal entry list row. Renders title + visibility Pill (public → primary, dm-only → amber). ≥44px via ListRow. REQ-CRO-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _entry: _journalRowFixture },
    { _entry: _journalRowDmOnlyFixture },
  ],
  render: (p) => <JournalRowView row={p._entry as JournalRow} />,
};

const journalDetailViewDmEntry: ComponentEntry = {
  id: 'world-journal-detail-dm',
  name: 'JournalDetailView (dm)',
  group: 'world',
  notes: 'Journal detail — DM view. Shows title, visibility pill, body (plain text / whitespace-pre-wrap per ADR-3), and tags. REQ-CRO-03, REQ-GATE-01.',
  propsSchema: {},
  render: () => (
    <JournalDetailView detail={_journalRowDmOnlyFixture} effectiveView="dm" />
  ),
};

const journalDetailViewPlayerEntry: ComponentEntry = {
  id: 'world-journal-detail-player',
  name: 'JournalDetailView (player)',
  group: 'world',
  notes: 'Journal detail — player view. dm-only entries render "Nota no disponible" fallback. Public entries render normally. REQ-CRO-03, REQ-GATE-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _label: 'public entry — player' },
    { _label: 'dm-only entry — player (fallback)' },
  ],
  render: (p) => {
    const label = (p._label as string) ?? '';
    const detail = label.includes('dm-only') ? _journalRowDmOnlyFixture : _journalRowFixture;
    return <JournalDetailView detail={detail} effectiveView="player" />;
  },
};

const _hexRowFixture: HexRow = {
  id: 'hex-01',
  worldId: 'world-01',
  parentHexId: null,
  scale: 'region',
  q: 3,
  r: -2,
  worldX: 320,
  worldY: 180,
  name: 'Bosque de Svalich',
  terrain: 'forest',
  status: 'explored' as HexStatus,
  dmNotes: 'Un lobo fantasmal patrulla estos bosques de noche.',
  playerNotes: 'Vimos huellas de lobo enormes cerca del río.',
  createdAt: '2024-09-12T00:00:00.000Z',
  updatedAt: '2024-10-05T00:00:00.000Z',
};

const _hexRowUnexploredFixture: HexRow = {
  id: 'hex-02',
  worldId: 'world-01',
  parentHexId: null,
  scale: 'region',
  q: 5,
  r: -1,
  worldX: null,
  worldY: null,
  name: null,
  terrain: null,
  status: 'unexplored' as HexStatus,
  dmNotes: null,
  playerNotes: null,
  createdAt: '2024-09-12T00:00:00.000Z',
  updatedAt: '2024-09-12T00:00:00.000Z',
};

const hexRowViewEntry: ComponentEntry = {
  id: 'world-hex-row',
  name: 'HexRowView',
  group: 'world',
  notes: 'Single hex list row. Renders name (or "Hex (q,r)" fallback), terrain subtitle, and status Pill (unexplored→stone, rumored→amber, explored→primary, cleared→success). REQ-MAP-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _hex: _hexRowFixture },
    { _hex: _hexRowUnexploredFixture },
  ],
  render: (p) => <HexRowView row={p._hex as HexRow} />,
};

const _npcRowFixture: NpcRow = {
  id: 'npc-01',
  worldId: 'world-01',
  name: 'Strahd von Zarovich',
  race: 'Vampiro',
  description: 'El Señor Oscuro de Barovia. Un vampiro antiguo de poder incalculable que gobierna desde el Castillo Ravenloft.',
  dmNotes: 'Strahd está enamorado de Ireena Kolyana. Manipulará al grupo para acercarse a ella.',
  hexId: 'hex-ravenloft',
  status: 'alive' as NpcStatus,
  worldX: 512,
  worldY: 256,
  factions: [
    {
      id: 'fac-strahd',
      worldId: 'world-01',
      name: 'Corte de Ravenloft',
      state: 'active' as FactionState,
      description: null,
    },
  ],
  createdAt: '2024-09-01T00:00:00.000Z',
  updatedAt: '2024-11-01T00:00:00.000Z',
};

const _npcRowDeadFixture: NpcRow = {
  id: 'npc-02',
  worldId: 'world-01',
  name: 'Kolyan Indirovich',
  race: 'Humano',
  description: 'Burgomaestre de Barovia. Murió a causa de la maldición de Strahd que afecta al pueblo.',
  dmNotes: null,
  hexId: 'hex-barovia-village',
  status: 'dead' as NpcStatus,
  worldX: null,
  worldY: null,
  factions: [],
  createdAt: '2024-09-02T00:00:00.000Z',
  updatedAt: '2024-09-15T00:00:00.000Z',
};

const npcRowViewEntry: ComponentEntry = {
  id: 'world-npc-row',
  name: 'NpcRowView',
  group: 'world',
  notes: 'Single NPC list row. Renders name + status Pill (alive→primary, dead→ink, missing→amber, unknown→stone). ≥44px via ListRow. REQ-NPC-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [
    { _npc: _npcRowFixture },
    { _npc: _npcRowDeadFixture },
  ],
  render: (p) => <NpcRowView row={p._npc as NpcRow} />,
};

// ── world/ interactive islands (batch 9a) ────────────────────────────────────

const worldEntityShellEntry: ComponentEntry = {
  id: 'world-entity-shell',
  name: 'WorldEntityShell',
  group: 'world',
  notes: 'Generic world-entity client island: debounced search, list rows, detail V3Sheet, DM FAB (create), edit/delete buttons. Slot functions (renderRow, renderDetail, renderForm) supplied by per-entity client wrappers — NOT serializable from RSC. Fixture: Barovia NPCs, DM view. INTERACTIVE — search, tap row → detail sheet, FAB → create form. All mutations are stubs. REQ-FAC-01, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <WorldEntityShellIsland />,
};

const eventFormEntry: ComponentEntry = {
  id: 'world-event-form',
  name: 'EventForm',
  group: 'world',
  notes: 'DM-only event create/edit form inside V3Sheet. Props: mode ("create"|"edit"), initial (EventRow|null), onSubmit((EventBody)→Promise<{ok,error?}>), onDone(). Fields: title (required), occurredAt (date), visibility select (public|dm-only), description, tags (comma-separated), dmNotes. Uses canonical FormLabel/FormInput/FormErrorAlert/FormSubmitButton. INTERACTIVE — submit runs stub (~400ms). REQ-CRO-02, REQ-GATE-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <EventFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const factionFormEntry: ComponentEntry = {
  id: 'world-faction-form',
  name: 'FactionForm',
  group: 'world',
  notes: 'DM-only faction create/edit form inside V3Sheet. Props: mode ("create"|"edit"), initial (FactionRow|null), onSubmit((FactionBody)→Promise<{ok,error?}>), onDone(). Fields: name (required), state select (active|dormant|destroyed|disbanded), description, dmNotes. Uses canonical ui/ form primitives. INTERACTIVE — submit runs stub (~400ms). REQ-FAC-03, REQ-GATE-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <FactionFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const journalFormEntry: ComponentEntry = {
  id: 'world-journal-form',
  name: 'JournalForm',
  group: 'world',
  notes: 'DM-only journal create/edit form inside V3Sheet. Props: mode ("create"|"edit"), initial (JournalRow|null), onSubmit((JournalBody)→Promise<{ok,error?}>), onDone(). Fields: title (required), visibility select (public|dm-only), body (plain text — ADR-3, no markdown), tags (comma-separated). Uses canonical ui/ form primitives. INTERACTIVE — submit runs stub (~400ms). REQ-CRO-03, REQ-GATE-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <JournalFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const npcFormEntry: ComponentEntry = {
  id: 'world-npc-form',
  name: 'NpcForm',
  group: 'world',
  notes: 'DM-only NPC create/edit form inside V3Sheet. Props: mode ("create"|"edit"), initial (NpcRow|null), onSubmit((NpcBody)→Promise<{ok,error?}>), onDone(). Fields: name (required), race (text), status select (alive|dead|missing|unknown), description, dmNotes. Uses canonical ui/ form primitives. INTERACTIVE — submit runs stub (~400ms). REQ-NPC-01, REQ-GATE-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <NpcFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const hexFormEntry: ComponentEntry = {
  id: 'world-hex-form',
  name: 'HexForm',
  group: 'world',
  notes: 'DM-only hex create/edit form inside V3Sheet. Props: mode ("create"|"edit"), initial (HexRow|null), onSubmit((HexBody)→Promise<{ok,error?}>), onDone(). Fields: q/r coordinates (required integers), name, terrain, status select (unexplored|rumored|explored|cleared), playerNotes, dmNotes. Uses canonical ui/ form primitives. INTERACTIVE — submit runs stub (~400ms). REQ-MAP-01, REQ-GATE-03.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <HexFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const poiFormEntry: ComponentEntry = {
  id: 'world-poi-form',
  name: 'PoiForm',
  group: 'world',
  notes: 'Shared POI create/edit form (REQ-PWC-FORM-01). Props: mode, initial (PoiRow|null), initialCoords ({worldX,worldY}|null), onSubmit((PoiBody)→Promise<{ok,error?}>), onDone(), idPrefix (string, default "poi"). Fields: name (required), description, dmNotes, status select (unknown|discovered|cleared), worldX/worldY coords (optional numbers, 0..IMAGE_W/H range). Uses inline labels/inputs (not canonical ui/ primitives — intentional). INTERACTIVE — submit runs stub (~400ms). REQ-MAP-01, REQ-PLACE-FIELDS-01.',
  propsSchema: {},
  matrixMode: 'list',
  explicitCombos: [{ _mode: 'create' }, { _mode: 'edit' }],
  render: (p) => <PoiFormIsland mode={(p._mode as 'create' | 'edit') ?? 'create'} />,
};

const hexDetailViewEntry: ComponentEntry = {
  id: 'world-hex-detail-view',
  name: 'HexDetailView',
  group: 'world',
  notes: 'Hex detail sheet body. Props: detail (HexRow), effectiveView, onLoadPois((hexId)→Promise<PoiRow[]>), onCreatePoi, onUpdatePoi, onDeletePoi. DM: name, status pill, terrain, q/r coords, dmNotes (amber block), playerNotes, + PoiAccordion (lazy). Player: same minus coords/dmNotes. Accordion calls onLoadPois ONLY on first user expand (no N+1). INTERACTIVE — expand accordion to load fixture POIs (~300ms). CRUD stubs. REQ-MAP-01, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <HexDetailViewIsland />,
};

const poiAccordionEntry: ComponentEntry = {
  id: 'world-poi-accordion',
  name: 'PoiAccordion',
  group: 'world',
  notes: 'Lazy inline POI accordion for a single hex. Props: hexId, effectiveView, onLoadPois, onCreatePoi, onUpdatePoi, onDeletePoi. Loads POIs only on first expand (no N+1 at page load). DM: full list + PoiDetail + CRUD controls (edit/delete/+ add). Player: filtered list (status != "unknown"), read-only. "Colocar en mapa" button on null-coord POIs uses router.push — catalog shows it. INTERACTIVE — expand, CRUD stubs. REQ-MAP-01, REQ-GATE-01, REQ-PLACE-TAP-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <PoiAccordionIsland />,
};

const poiDetailEntry: ComponentEntry = {
  id: 'world-poi-detail',
  name: 'PoiDetail',
  group: 'world',
  notes: 'Presentational POI body. Props: poi (PoiRow), isDM (boolean). Renders: name + status Pill (via POI_STATUS_TONE), optional description, DM-gated dmNotes (amber italic). Used by PoiAccordion and Leaflet popups. Three combos: isDM=true with notes, isDM=false (notes absent), cleared status no notes. REQ-POI-DETAIL-01, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <PoiDetailIsland />,
};

const poiMapDrawerEntry: ComponentEntry = {
  id: 'world-poi-map-drawer',
  name: 'PoiMapDrawer',
  group: 'world',
  notes: 'Collapsible POI list overlay for the Mapa view. Props: pois (PoiRow[]), effectiveView, open (boolean), onClose, onFlyTo((PoiRow)→void). Mobile: bottom-sheet ~55vh. Desktop: left panel 320px. NOT a portal — does NOT lock body scroll. Placed POIs (worldX/Y != null): tappable fly-to row. Null-coord POIs: non-interactive "sin ubicación". Rendered inline in catalog (not fixed) so it stays in frame. INTERACTIVE — open/close, tap placed POIs → onFlyTo stub. REQ-PML-DRAWER-01, REQ-PML-FLYTO-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <PoiMapDrawerIsland />,
};

const factionChipSectionEntry: ComponentEntry = {
  id: 'world-faction-chip-section',
  name: 'FactionChipSection',
  group: 'world',
  notes: 'NPC faction membership chip list. Props: factions (NpcFaction[]), worldFactions (FactionRow[]), effectiveView, onAttach((factionId)→Promise<{ok,error?}>), onDetach((factionId)→Promise<{ok,error?}>). DM view: chips with × detach + "+" picker for unattached factions. Player view: read-only chips. Local state reflects attach/detach stubs immediately. INTERACTIVE — detach/attach run stubs (~300ms). REQ-NPC-02, REQ-GATE-01, REQ-GATE-03.',
  propsSchema: {},
  preview: 'bare',
  render: () => <FactionChipSectionIsland />,
};

const worldMapPlaceholderEntry: ComponentEntry = {
  id: 'world-map-placeholder',
  name: 'WorldMap (Leaflet — catalog placeholder)',
  group: 'world',
  notes: 'Static catalog stand-in for WorldMapLeaflet / MapClientWrapper. Leaflet cannot run in the catalog (requires window/tile fetches/server actions on mount). Renders: disabled controls bar (Capas / zoom+/−), canvas placeholder with grid + map glyph + explanatory text, real PoiMapDrawer (safe — no window deps) shown open/closed below. The live map lives in apps/web/components/world/map/map-client-wrapper.tsx. INTERACTIVE — drawer open/close + onFlyTo stub. REQ-PML-DRAWER-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <WorldMapPlaceholderIsland />,
};

// ── world/ orchestrator islands (batch 9b) ────────────────────────────────────

const eventClientWrapperEntry: ComponentEntry = {
  id: 'world-event-client-wrapper',
  name: 'EventClientWrapper',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. Full event list+detail+CRUD orchestrator (Eventos). DM view: list rows, tap → detail sheet with dmNotes, FAB → create form, edit/delete in sheet. Search debounced. Tag filter chips. All mutations stub ~400ms. REQ-CRO-02, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <EventClientWrapperIsland />,
};

const factionClientWrapperEntry: ComponentEntry = {
  id: 'world-faction-client-wrapper',
  name: 'FactionClientWrapper',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. Full faction list+detail+CRUD orchestrator (Facciones). DM view: list rows, tap → detail sheet with dmNotes, FAB → create form, edit/delete in sheet. Search debounced. All mutations stub ~400ms. REQ-FAC-01, REQ-FAC-03, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <FactionClientWrapperIsland />,
};

const journalClientWrapperEntry: ComponentEntry = {
  id: 'world-journal-client-wrapper',
  name: 'JournalClientWrapper',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. Full journal list+detail+CRUD orchestrator (Notas). DM view: list rows, tap → detail sheet, FAB → create form, edit/delete in sheet. Search debounced. Tag filter chips. Body rendered as plain text (ADR-3). All mutations stub ~400ms. REQ-CRO-03, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <JournalClientWrapperIsland />,
};

const hexClientWrapperEntry: ComponentEntry = {
  id: 'world-hex-client-wrapper',
  name: 'HexClientWrapper',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. Full hex list+detail+CRUD orchestrator (Mapa/Ubicaciones). DM view: list rows, tap → detail sheet with PoiAccordion (lazy — expand to load fixture POIs ~300ms), FAB → create form. ← Ver mapa button (router.push). All mutations stub ~400ms. REQ-MAP-01, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <HexClientWrapperIsland />,
};

const npcClientWrapperEntry: ComponentEntry = {
  id: 'world-npc-client-wrapper',
  name: 'NpcClientWrapper',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. Full NPC list+detail+CRUD orchestrator (NPCs). DM view: list rows, tap → detail sheet with faction chips (attach/detach stubs), FAB → create form. Actions bundle threaded to NpcDetailView. All mutations stub ~400ms. REQ-NPC-01, REQ-NPC-02, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <NpcClientWrapperIsland />,
};

const npcDetailViewEntry: ComponentEntry = {
  id: 'world-npc-detail-view',
  name: 'NpcDetailView',
  group: 'world',
  notes: 'INTERACTIVE — client island; real component driven by injected stub actions, no backend. NPC detail sheet body: name, status pill, race, description, DM-gated dmNotes (amber block), FactionChipSection (DM: × detach + + attach; Player: read-only chips). attach/detach stubs ~350ms. REQ-NPC-02, REQ-GATE-01.',
  propsSchema: {},
  preview: 'bare',
  render: () => <NpcDetailViewIsland />,
};

// ── Registry export ───────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: ComponentEntry[] = [
  // ui/
  statCellEntry,
  buttonEntry,
  pillEntry,
  progressBarEntry,
  toggleChipEntry,
  cardEntry,
  iconEntry,
  dashedCtaEntry,
  characterPortraitEntry,
  characterCardEntry,
  scrollNavEntry,
  toastEntry,
  listRowEntry,
  questRowEntry,
  sectionHeadEntry,
  crowMarkEntry,
  discordIconEntry,
  emptyEntry,
  // layout/
  topbarEntry,
  appShellEntry,
  tabbarEntry,
  roleSwitcherEntry,
  navProgressEntry,
  stepperEntry,
  // sheet/
  v3SheetEntry,
  sheetHeroEntry,
  vitalGridEntry,
  abilityScoreGridEntry,
  bannerEntry,
  sheetTabsEntry,
  // wizard/
  statTileEntry,
  reviewBannerEntry,
  numberedReviewCardEntry,
  publishedSplashEntry,
  choiceCardEntry,
  choiceListEntry,
  characterNameInputEntry,
  wizardFooterNavEntry,
  // form/
  formLabelEntry,
  formInputEntry,
  formErrorAlertEntry,
  formSubmitButtonEntry,
  // encuentros/
  radialDialEntry,
  rosterListEntry,
  turnBannerEntry,
  conditionBadgesEntry,
  resourcePanelEntry,
  attackSheetEntry,
  playerActionPanelEntry,
  rageControlsEntry,
  passTurnButtonEntry,
  refreshButtonEntry,
  turnControlsEntry,
  encuentrosListViewEntry,
  // ficha/
  atributosEditorEntry,
  atributosSectionEditorEntry,
  hpEditorEntry,
  hpSectionEditorEntry,
  spellKnownEditorEntry,
  spellKnownSectionEditorEntry,
  spellPrepEditorEntry,
  spellPrepSectionEditorEntry,
  viewOnlySectionSheetEntry,
  backgroundSectionEntry,
  classSectionEntry,
  raceSectionEntry,
  // campanas/
  campanasViewEntry,
  v3CampCardEntry,
  campanaDetailViewEntry,
  // inicio/
  activeCharacterCardEntry,
  heroNextSessionEntry,
  novedadesFeedEntry,
  quickActionsEntry,
  dmNextSessionCardEntry,
  dmQuickActionsEntry,
  pendientesFichaCardEntry,
  pendientesSheetContentEntry,
  questsSinTocarListEntry,
  pendingFichasCardEntry,
  pendingFichasCardTriggerEntry,
  pendientesActionButtonsEntry,
  // personajes/
  setActiveCharacterButtonEntry,
  statusFilterChipsEntry,
  personajeCardEntry,
  subclassPickerEntry,
  // compendium/
  compendiumEntriesEntry,
  entryNodeRendererEntry,
  inlineRendererEntry,
  statblockNodeViewEntry,
  tableNodeViewEntry,
  insetNodeViewEntry,
  insetReadaloudNodeViewEntry,
  imageNodeViewEntry,
  galleryNodeViewEntry,
  quoteNodeViewEntry,
  termHoverEntry,
  domainContentEntry,
  // world/
  subNavEntry,
  eventRowViewEntry,
  eventDetailViewDmEntry,
  eventDetailViewPlayerEntry,
  factionRowViewEntry,
  factionDetailViewDmEntry,
  factionDetailViewPlayerEntry,
  journalRowViewEntry,
  journalDetailViewDmEntry,
  journalDetailViewPlayerEntry,
  hexRowViewEntry,
  npcRowViewEntry,
  // world/ interactive islands (batch 9a)
  worldEntityShellEntry,
  eventFormEntry,
  factionFormEntry,
  journalFormEntry,
  npcFormEntry,
  hexFormEntry,
  poiFormEntry,
  hexDetailViewEntry,
  poiAccordionEntry,
  poiDetailEntry,
  poiMapDrawerEntry,
  factionChipSectionEntry,
  worldMapPlaceholderEntry,
  // world/ orchestrator islands (batch 9b)
  eventClientWrapperEntry,
  factionClientWrapperEntry,
  journalClientWrapperEntry,
  hexClientWrapperEntry,
  npcClientWrapperEntry,
  npcDetailViewEntry,
];
