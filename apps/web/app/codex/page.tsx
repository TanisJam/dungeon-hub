import { redirect } from 'next/navigation';

/**
 * Codex entry — redirects to the first sub-section (Facciones).
 * ADR-1: Hard redirect keeps URLs deep-linkable; TabBar matches startsWith('/codex').
 * REQ-FAC-04.
 */
export default function CodexPage() {
  redirect('/codex/facciones');
}
