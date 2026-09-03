import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LandingMarketing } from './_components/landing-marketing';
import { SignInButton } from './_components/sign-in-button';
import { DemoButton } from './_components/demo-button';
import { DevLoginForm } from './_components/dev-login-form';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/inicio');

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <LandingMarketing
      ctaSlot={
        <>
          <SignInButton redirectTo="/inicio" />
          <DemoButton redirectTo="/inicio" />
        </>
      }
      devSlot={isDev ? <DevLoginForm redirectTo="/inicio" /> : undefined}
    />
  );
}
