import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

export function CreatePersonajeCTA() {
  return (
    <Link
      href="/characters/new"
      className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line p-4 font-sans text-[13px] font-semibold text-ink-mute transition-colors hover:border-accent hover:text-accent"
    >
      <Icon name="plus" size={18} className="text-accent" />
      <span>Crear personaje · 6 pasos</span>
    </Link>
  );
}
