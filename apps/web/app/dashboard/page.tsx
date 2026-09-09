import { redirect } from 'next/navigation';

/**
 * /dashboard — dissolved (navigability-audit fix).
 *
 * This page used to be a grab-bag: identity + sign-out (the app's ONLY
 * sign-out control), characters, campaigns, and preferences, none of it
 * reachable from the TabBar/DesktopSidebar. Its pieces now have proper
 * homes: identity + sign-out + preferences moved to /settings (reachable
 * from the new AccountMenu in every TopBar); characters and campaigns
 * already lived at /personajes and /campanas.
 *
 * The route itself stays (redirecting, not removed) so saved links and
 * browser history don't 404.
 */
export default function DashboardPage() {
  redirect('/inicio');
}
