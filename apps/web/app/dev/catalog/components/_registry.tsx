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
import { QuestRow } from '@/components/ui/quest-row';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionHead } from '@/components/ui/section-head';
import { CrowMark } from '@/components/ui/crow-mark';
import { DiscordIcon } from '@/components/ui/discord-icon';
import { V3Empty } from '@/components/ui/empty';

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
  notes: 'Reusable notification banner. tone: amber (bg-warning-soft / text-warning-deep / border-warning) | ink (bg-ink / text-surface) | stone (bg-paper-soft / text-ink-soft / border-line). Full-width, rounded-md, text-sm font-medium text-center.',
  propsSchema: {
    tone:     { kind: 'enum',    options: ['amber', 'ink', 'stone'] as const, default: 'amber', label: 'Tone' },
    children: { kind: 'node',    default: 'Mensaje del sistema',              label: 'Content' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { tone: 'amber', children: 'Personaje pendiente de aprobación del DM.' },
    { tone: 'ink',   children: 'Tu turno — realizá una acción.' },
    { tone: 'stone', children: 'Vista de solo lectura. Pedí al DM que habilite edición.' },
  ],
  render: (p) => (
    <Banner tone={p.tone as 'amber' | 'ink' | 'stone'}>
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

// ── Registry export ───────────────────────────────────────────────────────────

export const COMPONENT_REGISTRY: ComponentEntry[] = [
  // ui/
  statCellEntry,
  buttonEntry,
  pillEntry,
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
];
