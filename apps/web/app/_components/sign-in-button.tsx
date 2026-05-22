'use client';

import { createClient } from '@/lib/supabase/client';

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
    <button
      onClick={handle}
      className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4] transition"
    >
      Sign in with Discord
    </button>
  );
}
