import type { ReactNode } from 'react';
import { CrowMark, Icon, type IconName } from '@/components/ui';

/**
 * LandingMarketing — portfolio-facing landing page shell.
 *
 * ux-p2-consistency Fix 4: enriches the previously-empty landing (title +
 * 2 buttons) with a hero, feature highlights, and a footer, within the
 * existing dark aesthetic (paper/ink/line tokens, font-display, CrowMark).
 * Mobile-first (375px): single column, stacks vertically; md:+ widens.
 *
 * Pure presentational component — `page.tsx` (async Server Component doing
 * the Supabase auth check + redirect) passes the interactive CTAs in via
 * `ctaSlot`/`devSlot` so this shell stays trivially unit-testable.
 */

interface Feature {
  icon: IconName;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'user',
    title: 'Constructor de personajes',
    description: 'Creá tu PJ paso a paso, con las reglas de PHB 2014 validadas en cada elección.',
  },
  {
    icon: 'hammer',
    title: 'Herramientas de DM',
    description: 'Iniciativa, facciones, campañas y mesa — todo lo que necesitás para dirigir.',
  },
  {
    icon: 'book',
    title: 'Compendium',
    description: 'Hechizos, objetos y monstruos, siempre a mano y buscables al instante.',
  },
  {
    icon: 'feather',
    title: 'Mapa de mundo',
    description: 'Explorá el mundo de tu campaña con un mapa interactivo compartido.',
  },
];

interface LandingMarketingProps {
  /** Existing sign-in CTAs (Discord + demo) — rendered as-is, unchanged. */
  ctaSlot: ReactNode;
  /** Dev-only login form, rendered only outside production. */
  devSlot?: ReactNode;
}

export function LandingMarketing({ ctaSlot, devSlot }: LandingMarketingProps) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col items-center px-4 py-16 text-center md:max-w-md">
      <div className="mb-6">
        <CrowMark />
      </div>

      <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
        Dungeon Hub
      </h1>
      <p className="mt-3 text-sm text-ink-mute">
        Tu gremio en un solo lugar.
      </p>

      <div className="mt-10 w-full">
        {ctaSlot}
      </div>

      {devSlot}

      <ul className="mt-14 flex w-full flex-col gap-4 text-left">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            data-landing-feature
            className="flex items-start gap-3 rounded-md border border-line bg-surface p-3"
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-accent/35 bg-accent-soft text-accent">
              <Icon name={feature.icon} size={16} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{feature.title}</span>
              <span className="block text-xs text-ink-mute">{feature.description}</span>
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-14 w-full border-t border-line pt-6 text-[11px] text-ink-mute">
        <p>Dungeon Hub — compañero de mesa para D&amp;D 5e (PHB 2014).</p>
        <p className="mt-1">Proyecto personal de Mauricio Romero.</p>
      </footer>
    </main>
  );
}
