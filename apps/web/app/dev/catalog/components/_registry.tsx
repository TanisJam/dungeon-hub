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

// form/ primitives
import { FormLabel } from '@/components/ui/form-label';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';

// Client islands (thin 'use client' wrappers for server-module compatibility)
import { TabBarIsland } from './_islands/tabbar-island';
import { RoleSwitcherIsland } from './_islands/role-switcher-island';
import { V3SheetIsland } from './_islands/v3-sheet-island';
import { FormInputIsland } from './_islands/form-input-island';

// Re-export types for page.tsx
export type { ComponentGroup, ComponentEntry, VariantCombination } from './_registry-types';
import type { ComponentEntry } from './_registry-types';

// ── ui/ group ─────────────────────────────────────────────────────────────────

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
  notes: 'Semantic tones: primary (cyan) | accent (copper) | secondary (magenta) | ink | stone | amber | danger | success. B2: danger+success added.',
  propsSchema: {
    tone:     { kind: 'enum', options: ['primary', 'accent', 'secondary', 'ink', 'stone', 'amber', 'danger', 'success'] as const, default: 'primary', label: 'Tone' },
    size:     { kind: 'enum', options: ['sm', 'md'] as const,                                                                      default: 'md',      label: 'Size' },
    children: { kind: 'node', default: 'Label',                                                                                    label: 'Label' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { tone: 'primary',   size: 'md', children: 'Active' },
    { tone: 'accent',    size: 'md', children: 'Player' },
    { tone: 'secondary', size: 'md', children: 'DM' },
    { tone: 'ink',       size: 'md', children: 'Ink' },
    { tone: 'stone',     size: 'md', children: 'Stone' },
    { tone: 'amber',     size: 'md', children: 'Amber' },
    { tone: 'danger',    size: 'md', children: 'Danger' },
    { tone: 'success',   size: 'md', children: 'Success' },
    { tone: 'primary',   size: 'sm', children: 'Active sm' },
    { tone: 'accent',    size: 'sm', children: 'Player sm' },
  ],
  render: (p) => (
    <Pill
      tone={p.tone as 'primary' | 'accent' | 'secondary' | 'ink' | 'stone' | 'amber' | 'danger' | 'success'}
      size={p.size as 'sm' | 'md'}
    >
      {p.children as ReactNode}
    </Pill>
  ),
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

const sectionHeadEntry: ComponentEntry = {
  id: 'section-head',
  name: 'SectionHead',
  group: 'ui',
  notes: 'Props: num (optional), title, meta (optional).',
  propsSchema: {
    num:   { kind: 'string', label: 'Num (optional)' },
    title: { kind: 'string', default: 'Abilities', label: 'Title' },
    meta:  { kind: 'node',   label: 'Meta (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { title: 'Abilities' },
    { num: '1', title: 'Choose Race' },
    { num: '★', title: 'Special', meta: '3 slots' },
  ],
  render: (p) => (
    <SectionHead
      num={p.num as string | number | undefined}
      title={p.title as string}
      meta={p.meta as ReactNode}
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

const numberedSectionHeadEntry: ComponentEntry = {
  id: 'numbered-section-head',
  name: 'NumberedSectionHead',
  group: 'layout',
  notes: 'Props: num, title, meta?, description?.',
  propsSchema: {
    num:         { kind: 'string', default: '1',            label: 'Num' },
    title:       { kind: 'string', default: 'Choose race', label: 'Title' },
    meta:        { kind: 'string', label: 'Meta (optional)' },
    description: { kind: 'string', label: 'Description (optional)' },
  },
  matrixMode: 'list',
  explicitCombos: [
    { num: '1', title: 'Choose your race' },
    { num: '2', title: 'Class Features', meta: '3 choices' },
    { num: '3', title: 'Background', description: 'Your background defines who you were before becoming an adventurer.' },
  ],
  render: (p) => (
    <NumberedSectionHead
      num={p.num as string}
      title={p.title as string}
      meta={p.meta as string | undefined}
      description={p.description as string | undefined}
    />
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

// ── Registry export ───────────────────────────────────────────────────────────

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
  // form/
  formLabelEntry,
  formInputEntry,
  formErrorAlertEntry,
  formSubmitButtonEntry,
];
