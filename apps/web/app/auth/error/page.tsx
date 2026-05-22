import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold">Authentication failed</h1>
      <p className="mt-3 text-zinc-400">
        We couldn&apos;t complete the sign-in flow. Try again from the home page.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-indigo-400 hover:text-indigo-300"
      >
        ← Back home
      </Link>
    </main>
  );
}
