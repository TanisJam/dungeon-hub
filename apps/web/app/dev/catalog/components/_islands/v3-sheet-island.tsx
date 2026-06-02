'use client';

import { useState } from 'react';
import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui';

/**
 * Dev-only client island demo wrapper for V3Sheet.
 * Renders an open/close trigger so the sheet can be exercised in the catalog.
 */
export function V3SheetIsland() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Button size="sm" tone="ghost" onClick={() => setOpen(true)}>
        Open Sheet
      </Button>
      <V3Sheet open={open} onClose={() => setOpen(false)} title="Example Sheet">
        <div className="p-4 space-y-3">
          <p className="text-sm text-ink-soft">
            This is a V3Sheet bottom modal. Tap outside or press Escape to close.
          </p>
          <Button size="sm" tone="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </V3Sheet>
    </div>
  );
}
