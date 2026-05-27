import Link from 'next/link';
import { SectionHead, Icon } from '@/components/ui';

const actions = [
  { href: '/personajes',     icon: 'user' as const,  label: 'Ficha activa' },
  { href: '/compendium',     icon: 'book' as const,  label: 'Buscar'       },
  { href: '/characters/new', icon: 'plus' as const,  label: 'Crear PJ'    },
];

export function QuickActions() {
  return (
    <>
      <SectionHead title="Atajos" />
      <div className="grid grid-cols-3 gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-3.5 text-[11px] font-semibold text-ink transition-colors hover:border-accent hover:bg-surface-soft"
          >
            <span className="grid h-8 w-8 place-items-center rounded-md border border-accent/35 bg-accent-soft text-accent">
              <Icon name={a.icon} size={16} />
            </span>
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
