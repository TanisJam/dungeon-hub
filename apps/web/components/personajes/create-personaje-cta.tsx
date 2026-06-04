import { Icon } from '@/components/ui/icon';
import { DashedCTA } from '@/components/ui/dashed-cta';

export function CreatePersonajeCTA() {
  return (
    <DashedCTA href="/characters/new">
      <Icon name="plus" size={18} className="text-accent" />
      <span>Crear personaje · 6 pasos</span>
    </DashedCTA>
  );
}
