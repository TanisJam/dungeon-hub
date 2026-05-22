'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';

export function SignOutButton() {
  const router = useRouter();

  async function handle() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <Button tone="ghost" size="sm" onClick={handle}>
      Cerrar sesión
    </Button>
  );
}
