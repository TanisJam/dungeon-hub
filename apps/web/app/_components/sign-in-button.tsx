'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import { DiscordIcon } from '@/components/ui';

export function SignInButton({ redirectTo }: { redirectTo?: string }) {
  async function handle() {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo ?? '/')}`,
      },
    });
  }

  return (
    <Button tone="green" size="md" onClick={handle}>
      <DiscordIcon />
      Iniciar sesión con Discord
    </Button>
  );
}
