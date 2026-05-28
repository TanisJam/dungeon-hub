'use client';

/**
 * V3SheetStub — temporary "Próximamente" sheet stub for Slice A.
 *
 * Wraps the existing V3Sheet component. Shows "Próximamente" body copy.
 * Also renders the legacy EquipToggle + DeleteButton below the copy so that
 * the existing equip/delete round-trip tests (inventario.test.tsx) stay green
 * until Slice B ships the real weapon/armor renderers.
 *
 * Reqs: WIVLS-SHEET-STUB-01 (spec #1063)
 * Design ER10: temp legacy affordance — will be replaced in Slice B.
 *
 * RSC stub pattern: no <Link href="#" onClick>. Button with onClick here is fine
 * because this IS a 'use client' file.
 */
import { V3Sheet } from '@/components/ui/sheet';
import { EquipToggle } from '../equip-toggle';
import { DeleteButton } from '../delete-button';

interface V3SheetStubProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  instanceId: string;
  currentState: 'equipped' | 'carried' | 'stowed';
  itemName: string;
}

export function V3SheetStub({
  open,
  onClose,
  characterId,
  instanceId,
  currentState,
  itemName,
}: V3SheetStubProps) {
  return (
    <V3Sheet open={open} onClose={onClose} title={itemName}>
      <p className="text-sm text-ink-soft mb-4">Próximamente</p>
      <p className="text-xs text-ink-mute mb-4">
        El detalle completo de este ítem estará disponible en una próxima actualización.
      </p>
      {/* ER10: legacy affordances — preserved until Slice B ships real renderers */}
      <div className="flex gap-2 mt-2">
        <EquipToggle
          characterId={characterId}
          instanceId={instanceId}
          currentState={currentState}
        />
        <DeleteButton
          characterId={characterId}
          instanceId={instanceId}
          itemName={itemName}
        />
      </div>
    </V3Sheet>
  );
}
