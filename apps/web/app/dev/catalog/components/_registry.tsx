import type { ReactNode } from 'react';

// ui/ primitives
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
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
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

// Client islands (thin 'use client' wrappers for server-module compatibility)
import { TabBarIsland } from './_islands/tabbar-island';
import { RoleSwitcherIsland } from './_islands/role-switcher-island';
import { V3SheetIsland } from './_islands/v3-sheet-island';

export type ComponentGroup = 'ui' | 'layout' | 'sheet' | 'wizard';

export interface VariantCase {
  label: string;
  node: ReactNode;
}

export interface ComponentEntry {
  id: string;
  name: string;
  group: ComponentGroup;
  notes?: string;
  variants: VariantCase[];
}

// ── ui/ group ──

const buttonEntry: ComponentEntry = {
  id: 'button',
  name: 'Button',
  group: 'ui',
  notes: 'ButtonTone: cta | green | ghost. ButtonSize: sm | md | lg.',
  variants: [
    // tones × md size
    { label: 'cta/md',   node: <Button tone="cta"   size="md">Save Character</Button> },
    { label: 'green/md', node: <Button tone="green" size="md">Confirm</Button> },
    { label: 'ghost/md', node: <Button tone="ghost" size="md">Cancel</Button> },
    // sizes × cta
    { label: 'cta/sm',   node: <Button tone="cta"   size="sm">Small CTA</Button> },
    { label: 'cta/lg',   node: <Button tone="cta"   size="lg">Large CTA</Button> },
    // disabled state
    { label: 'cta/disabled',   node: <Button tone="cta"   size="md" disabled>Disabled</Button> },
    { label: 'ghost/disabled', node: <Button tone="ghost" size="md" disabled>Disabled Ghost</Button> },
  ],
};

const pillEntry: ComponentEntry = {
  id: 'pill',
  name: 'Pill',
  group: 'ui',
  notes: 'Current tones: green (→primary) | pink (→accent) | coral (→secondary) | ink | stone | amber. Rename pending Slice 4.',
  variants: [
    { label: 'green/md',  node: <Pill tone="green"  size="md">Active</Pill> },
    { label: 'pink/md',   node: <Pill tone="pink"   size="md">Player</Pill> },
    { label: 'coral/md',  node: <Pill tone="coral"  size="md">DM</Pill> },
    { label: 'ink/md',    node: <Pill tone="ink"    size="md">Ink</Pill> },
    { label: 'stone/md',  node: <Pill tone="stone"  size="md">Stone</Pill> },
    { label: 'amber/md',  node: <Pill tone="amber"  size="md">Amber</Pill> },
    { label: 'green/sm',  node: <Pill tone="green"  size="sm">Active sm</Pill> },
    { label: 'pink/sm',   node: <Pill tone="pink"   size="sm">Player sm</Pill> },
  ],
};

const cardEntry: ComponentEntry = {
  id: 'card',
  name: 'Card',
  group: 'ui',
  notes: 'CardVariant: surface | surface-soft | ink.',
  variants: [
    {
      label: 'surface',
      node: (
        <Card variant="surface" className="p-4">
          <p className="text-sm text-ink">Surface card</p>
          <p className="text-xs text-ink-mute">Default variant — border + shadow-stamp-md</p>
        </Card>
      ),
    },
    {
      label: 'surface-soft',
      node: (
        <Card variant="surface-soft" className="p-4">
          <p className="text-sm text-ink">Surface-soft card</p>
          <p className="text-xs text-ink-mute">Lighter bg + shadow-stamp-sm</p>
        </Card>
      ),
    },
    {
      label: 'ink',
      node: (
        <Card variant="ink" className="p-4">
          <p className="text-sm text-ink">Ink card</p>
          <p className="text-xs text-ink-mute">Gradient hero treatment</p>
        </Card>
      ),
    },
  ],
};

const iconEntry: ComponentEntry = {
  id: 'icon',
  name: 'Icon',
  group: 'ui',
  notes: '28 SVG icons. Props: name, size (default 20), strokeWidth (default 1.5).',
  variants: [
    { label: 'shield/20',    node: <Icon name="shield"   size={20} /> },
    { label: 'sword/20',     node: <Icon name="sword"    size={20} /> },
    { label: 'scroll/20',    node: <Icon name="scroll"   size={20} /> },
    { label: 'user/20',      node: <Icon name="user"     size={20} /> },
    { label: 'dice/20',      node: <Icon name="dice"     size={20} /> },
    { label: 'sparkle/20',   node: <Icon name="sparkle"  size={20} /> },
    { label: 'heart/20',     node: <Icon name="heart"    size={20} /> },
    { label: 'wand/20',      node: <Icon name="wand"     size={20} /> },
    { label: 'crown/20',     node: <Icon name="crown"    size={20} /> },
    { label: 'compass/20',   node: <Icon name="compass"  size={20} /> },
    { label: 'book/20',      node: <Icon name="book"     size={20} /> },
    { label: 'home/20',      node: <Icon name="home"     size={20} /> },
    { label: 'eye/20',       node: <Icon name="eye"      size={20} /> },
    { label: 'check/20',     node: <Icon name="check"    size={20} /> },
    { label: 'plus/20',      node: <Icon name="plus"     size={20} /> },
    { label: 'minus/20',     node: <Icon name="minus"    size={20} /> },
    { label: 'edit/20',      node: <Icon name="edit"     size={20} /> },
    { label: 'bag/20',       node: <Icon name="bag"      size={20} /> },
    { label: 'bolt/20',      node: <Icon name="bolt"     size={20} /> },
    { label: 'arrow-left/20', node: <Icon name="arrow-left"  size={20} /> },
    { label: 'arrow-right/20', node: <Icon name="arrow-right" size={20} /> },
    { label: 'shield/32',    node: <Icon name="shield"   size={32} strokeWidth={1} /> },
  ],
};

const sectionHeadEntry: ComponentEntry = {
  id: 'section-head',
  name: 'SectionHead',
  group: 'ui',
  notes: 'Props: num (optional), title, meta (optional).',
  variants: [
    { label: 'title only',         node: <SectionHead title="Abilities" /> },
    { label: 'with num',           node: <SectionHead num={1} title="Choose Race" /> },
    { label: 'with num + meta',    node: <SectionHead num="★" title="Special" meta="3 slots" /> },
  ],
};

const crowMarkEntry: ComponentEntry = {
  id: 'crow-mark',
  name: 'CrowMark',
  group: 'ui',
  notes: 'App logo mark. No props.',
  variants: [
    { label: 'default', node: <CrowMark /> },
  ],
};

const discordIconEntry: ComponentEntry = {
  id: 'discord-icon',
  name: 'DiscordIcon',
  group: 'ui',
  notes: 'Discord SVG glyph. Props: size (default 20).',
  variants: [
    { label: 'size 24', node: <DiscordIcon size={24} /> },
    { label: 'size 32', node: <DiscordIcon size={32} /> },
  ],
};

const emptyEntry: ComponentEntry = {
  id: 'empty',
  name: 'V3Empty',
  group: 'ui',
  notes: 'Empty state component. Props: glyph (IconName), title, sub (optional).',
  variants: [
    { label: 'title only',       node: <V3Empty glyph="scroll" title="No results" /> },
    { label: 'with sub',         node: <V3Empty glyph="dice" title="Nothing here" sub="Try adjusting your filters or search query." /> },
  ],
};

// ── layout/ group ──

const topbarEntry: ComponentEntry = {
  id: 'topbar',
  name: 'TopBar',
  group: 'layout',
  notes: 'Props: title, subtitle?, right?, canBeDM?, hasNotif?, backHref?, roleDefault?.',
  variants: [
    {
      label: 'default',
      node: (
        <div className="bg-paper rounded-md overflow-hidden">
          <TopBar title="Inicio" canBeDM={false} />
        </div>
      ),
    },
    {
      label: 'with subtitle + notif',
      node: (
        <div className="bg-paper rounded-md overflow-hidden">
          <TopBar title="Campañas" subtitle="3 activas" hasNotif canBeDM={false} />
        </div>
      ),
    },
    {
      label: 'with back arrow',
      node: (
        <div className="bg-paper rounded-md overflow-hidden">
          <TopBar title="Ficha de Personaje" backHref="/personajes" canBeDM={false} />
        </div>
      ),
    },
    {
      label: 'with role switcher',
      node: (
        <div className="bg-paper rounded-md overflow-hidden">
          <TopBar title="Inicio" canBeDM roleDefault="player" />
        </div>
      ),
    },
  ],
};

const appShellEntry: ComponentEntry = {
  id: 'app-shell',
  name: 'AppShell',
  group: 'layout',
  notes: 'Full page shell: TopBar + main + TabBar. Shown without TabBar to avoid fixed-position clash in catalog.',
  variants: [
    {
      label: 'shell (no tabbar)',
      node: (
        <div className="relative bg-paper rounded-md overflow-hidden" style={{ height: '200px' }}>
          <AppShell title="Personajes" showTabBar={false} canBeDM={false}>
            <p className="text-sm text-ink-mute">Page content renders here inside max-w-sm px-4 py-4.</p>
          </AppShell>
        </div>
      ),
    },
  ],
};

const tabbarEntry: ComponentEntry = {
  id: 'tabbar',
  name: 'TabBar',
  group: 'layout',
  notes: 'Client component. Shown via TabBarIsland (static preview wrapper) to avoid route dependency in catalog.',
  variants: [
    { label: 'player tabs (interactive)', node: <TabBarIsland /> },
  ],
};

const roleSwitcherEntry: ComponentEntry = {
  id: 'role-switcher',
  name: 'RoleSwitcher',
  group: 'layout',
  notes: 'Client component. Animated pill — Jugador/DM. Writes dh:role cookie on toggle.',
  variants: [
    { label: 'default (player)', node: <RoleSwitcherIsland /> },
  ],
};

const navProgressEntry: ComponentEntry = {
  id: 'nav-progress',
  name: 'NavProgress',
  group: 'layout',
  notes: 'Top progress bar, activates on client-side navigation. Nothing visible at rest — renders null when inactive.',
  variants: [
    {
      label: 'at rest (null)',
      node: (
        <div className="px-3 py-2 bg-surface rounded text-xs text-ink-mute">
          NavProgress renders <code className="font-mono text-ink-soft">null</code> when no navigation is in progress.
          It activates automatically when a &lt;Link&gt; is clicked.
        </div>
      ),
    },
  ],
};

const stepperEntry: ComponentEntry = {
  id: 'stepper',
  name: 'Stepper',
  group: 'layout',
  notes: 'Client component. Wizard step progress bar. Requires a characterId. Shown as static rendering below.',
  variants: [
    {
      label: 'static layout',
      node: (
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
    },
  ],
};

const numberedSectionHeadEntry: ComponentEntry = {
  id: 'numbered-section-head',
  name: 'NumberedSectionHead',
  group: 'layout',
  notes: 'Props: num, title, meta?, description?.',
  variants: [
    { label: 'basic',                node: <NumberedSectionHead num="1" title="Choose your race" /> },
    { label: 'with meta',            node: <NumberedSectionHead num="2" title="Class Features" meta="3 choices" /> },
    { label: 'with description',     node: <NumberedSectionHead num="3" title="Background" description="Your background defines who you were before becoming an adventurer." /> },
  ],
};

// ── sheet/ group ──

const v3SheetEntry: ComponentEntry = {
  id: 'v3-sheet',
  name: 'V3Sheet',
  group: 'sheet',
  notes: 'Client component. Portal-based bottom modal. Props: open, onClose, title?, labelledBy?, children.',
  variants: [
    { label: 'open/close demo', node: <V3SheetIsland /> },
  ],
};

// ── Registry export ──

export const COMPONENT_REGISTRY: ComponentEntry[] = [
  // ui/
  buttonEntry,
  pillEntry,
  cardEntry,
  iconEntry,
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
  numberedSectionHeadEntry,
  // sheet/
  v3SheetEntry,
];
