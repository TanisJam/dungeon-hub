import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  M_PLUS_Rounded_1c,
  Noto_Serif_Georgian,
} from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { NavProgress } from '@/components/layout/nav-progress';
import { AppChrome } from '@/components/layout/app-chrome';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorld, type CallerRole } from '@/lib/active-world';

const notoSerifGeorgian = Noto_Serif_Georgian({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif-georgian',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mplusRounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mplus-rounded',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dungeon Hub',
  description: 'D&D campaign manager',
};

/**
 * Resolves callerRole for AppChrome, server-side, once per request (audit
 * F1, work unit 1).
 *
 * Only pays for the active-world lookup when a session actually exists — a
 * logged-out request to a standalone route (`/`, `/auth/**`, `/invite/**`,
 * `/link/**`) must not pay for it. Any failure (missing session cookie,
 * Supabase hiccup, API down) degrades to `null` instead of throwing, so a
 * flaky dependency never takes down the whole shell — AppChrome/RoleSwitcher
 * already treat `null` as the safe default-deny state (ADR-C2).
 *
 * getActiveWorld() is request-memoized via React's cache() (see
 * lib/active-world.ts), so calling it here does NOT cost a second fetch on
 * top of whatever an individual page still calls it for directly.
 */
async function resolveCallerRole(): Promise<CallerRole> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const world = await getActiveWorld(session.access_token);
    return world?.callerRole ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const callerRole = await resolveCallerRole();

  return (
    <html
      lang="en"
      data-aesthetic="obsidian"
      data-palette="obsidian"
      className={`${notoSerifGeorgian.variable} ${inter.variable} ${mplusRounded.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-paper text-ink font-sans antialiased">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <AppChrome callerRole={callerRole}>{children}</AppChrome>
      </body>
    </html>
  );
}
