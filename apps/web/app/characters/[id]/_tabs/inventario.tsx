import type { InventoryItem } from '@/lib/sheet-types';
import { Card } from '@/components/ui';

interface InventarioTabProps {
  inventory: InventoryItem[];
}

const STATE_LABEL: Record<string, string> = {
  equipped: 'Equipado',
  carried: 'Portado',
  stowed: 'Guardado',
};

export function InventarioTab({ inventory }: InventarioTabProps) {
  if (inventory.length === 0) {
    return (
      <Card variant="surface" className="px-4 py-10 text-center">
        <p className="text-sm text-ink-mute">Sin equipo.</p>
      </Card>
    );
  }

  return (
    <Card variant="surface" className="p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Inventario
      </p>
      <div className="space-y-2">
        {inventory.map((item) => (
          <div
            key={item.instanceId}
            className="flex items-center justify-between gap-2 rounded-md bg-paper-soft px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {item.customName ?? item.itemSlug}
              </p>
              <p className="text-[10px] text-ink-mute">
                {STATE_LABEL[item.state] ?? item.state}
              </p>
            </div>
            <span className="flex-shrink-0 text-sm font-bold text-ink-soft">×{item.quantity}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
