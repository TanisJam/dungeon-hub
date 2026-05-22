'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

export function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function handle() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-4">
      <Button tone="ghost" size="sm" onClick={handle}>
        {copied ? 'Copiado ✓' : 'Copiar al portapapeles'}
      </Button>
    </div>
  );
}
