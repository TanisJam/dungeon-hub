import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';

interface RaceCantripCardProps {
  cantripName: string;
}

export function RaceCantripCard({ cantripName }: RaceCantripCardProps) {
  return (
    <Card variant="surface" className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">LINAJE</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-base font-bold text-ink">{cantripName}</span>
        <Pill tone="stone" size="sm">
          Cantrip
        </Pill>
      </div>
    </Card>
  );
}
