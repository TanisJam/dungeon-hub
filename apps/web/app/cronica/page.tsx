import { redirect } from 'next/navigation';

/**
 * Crónica — entry redirect (ADR-1, REQ-CRO-01).
 * Hard-redirects to /cronica/eventos so both sub-routes are deep-linkable
 * and the TabBar Crónica tab stays active on either sub-route.
 */
export default function CronicaPage() {
  redirect('/cronica/eventos');
}
