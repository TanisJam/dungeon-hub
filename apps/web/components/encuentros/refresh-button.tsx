'use client';

// REQ-WCO-WEB-07 — "Actualizar" refresh affordance.
// A minimal 'use client' island that calls router.refresh() so the player
// can manually pull the latest encounter state without a full page reload.
// Fulfils the "promised but unimplemented" refresh requirement from the verify report.

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function RefreshButton() {
  const router = useRouter();

  return (
    <Button tone="ghost" fullWidth onClick={() => router.refresh()} aria-label="Actualizar estado del encuentro">
      Actualizar
    </Button>
  );
}
