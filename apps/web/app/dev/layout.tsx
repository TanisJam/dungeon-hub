import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Dev-subtree layout guard.
 * All routes under /dev/** return 404 in production.
 * This single guard covers all existing pages (token, compendium-preview,
 * engine-preview) and any new catalog routes — no per-page guards needed.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
