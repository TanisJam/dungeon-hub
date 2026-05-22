// Dev-only sign-in endpoint para E2E tests con Playwright.
// Toma email+password, hace signInWithPassword via Supabase, setea las cookies
// de sesión que @supabase/ssr lee en server components. Sin esto, Playwright
// no puede entrar a páginas autenticadas sin pasar por Discord OAuth (que no
// se puede automatizar).
//
// GATING: solo responde si NODE_ENV !== 'production'. En prod devuelve 404.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : null;
  const password = typeof body?.password === 'string' ? body.password : null;
  if (!email || !password) {
    return NextResponse.json({ error: 'email + password required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
