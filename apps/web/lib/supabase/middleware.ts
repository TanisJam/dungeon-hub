import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

// The self-hosted Supabase backend sits behind a home-lab tunnel that can be
// slow or fully unreachable. This middleware runs on every non-static route
// (see apps/web/middleware.ts matcher) and only refreshes the session cookie —
// it never redirects or enforces auth — so a bounded wait here is safe: 3s is
// generous for a healthy backend but short enough that a hung tunnel doesn't
// stall every page navigation behind it.
const AUTH_CHECK_TIMEOUT_MS = 3000;

export async function updateSession(
  request: NextRequest,
  authTimeoutMs: number = AUTH_CHECK_TIMEOUT_MS,
) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Fail open: if the auth check throws (network failure) or hangs past the
  // timeout, proceed with the response as-is — the request continues as
  // unauthenticated rather than taking down every route with a 500. This
  // middleware does no access enforcement, so "no session attached" is the
  // worst case, never "more access than intended".
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_resolve, reject) => {
        AbortSignal.timeout(authTimeoutMs).addEventListener('abort', () => {
          reject(new Error(`Supabase auth check timed out after ${authTimeoutMs}ms`));
        });
      }),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console -- middleware has no logger; this is the only diagnostic surface for a home-lab outage.
    console.error('[updateSession] auth check failed, continuing unauthenticated:', err);
  }

  return response;
}
