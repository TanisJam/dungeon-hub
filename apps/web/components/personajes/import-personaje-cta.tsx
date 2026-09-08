import { Icon } from '@/components/ui/icon';
import { DashedCTA } from '@/components/ui/dashed-cta';

export function ImportPersonajeCTA() {
  return (
    <DashedCTA href="/characters/import">
      <Icon name="scroll" size={18} className="text-accent" />
      <span>Importar desde archivo</span>
    </DashedCTA>
  );
}
