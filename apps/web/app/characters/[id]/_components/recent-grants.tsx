/**
 * RecentGrants — Server Component.
 *
 * REQ-CRG-WIDGET (sdd/inventory-d4-d6 spec #889):
 *   - Shows last 5 item_grant / gold_grant / xp_award events for the character.
 *   - Visible to owner AND DM (callerRole !== null).
 *   - Returns null for unauthenticated / non-viewer callers.
 *   - Empty state: "Sin grants recientes".
 *   - Relative time: "hace X días / horas / minutos".
 *   - 375px mobile-first layout. Tap targets ≥44px.
 */

import { api, ApiError } from '@/lib/api';

type CallerRole = 'gm' | 'player' | null;

interface RecentGrantsProps {
  characterId: string;
  callerRole: CallerRole;
  accessToken: string;
}

type GrantEvent = {
  id: string;
  eventType: 'item_grant' | 'gold_grant' | 'xp_award' | string;
  occurredAt: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
  sessionId: string;
};

/**
 * Formats a past date as a relative string in Spanish.
 * "hace X minutos", "hace X horas", "hace X días".
 * Uses Intl.RelativeTimeFormat with numeric='auto'.
 */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const fmt = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return fmt.format(-minutes, 'minute');
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return fmt.format(-hours, 'hour');
  const days = Math.floor(diff / 86_400_000);
  return fmt.format(-days, 'day');
}

/** Maps payload to a human-readable Spanish label per event type. */
function grantLabel(event: GrantEvent): string {
  const { eventType, payload } = event;

  if (eventType === 'item_grant') {
    const slug = (payload['itemSlug'] as string | undefined) ?? 'ítem';
    return `Recibiste ${slug} del DM`;
  }

  if (eventType === 'gold_grant') {
    // Find first non-zero coin denomination in deltas
    const deltas = payload['deltas'] as Record<string, number> | undefined;
    if (deltas) {
      for (const [coin, amount] of Object.entries(deltas)) {
        if (amount !== 0) {
          return `Recibiste ${Math.abs(amount)} ${coin} del DM`;
        }
      }
    }
    return 'Recibiste oro del DM';
  }

  if (eventType === 'xp_award') {
    const award = (payload['award'] as number | undefined) ?? 0;
    return `Ganaste ${award} XP`;
  }

  return `Evento: ${eventType}`;
}

function EventIcon({ type }: { type: string }) {
  if (type === 'item_grant') return <span aria-hidden>🎁</span>;
  if (type === 'gold_grant') return <span aria-hidden>💰</span>;
  if (type === 'xp_award') return <span aria-hidden>⭐</span>;
  return <span aria-hidden>📋</span>;
}

export async function RecentGrants({ characterId, callerRole, accessToken }: RecentGrantsProps) {
  // Gate: only owner (player) and DM see recent grants.
  if (callerRole === null) return null;

  let events: GrantEvent[] = [];

  try {
    const res = await api.get<{ events: GrantEvent[] }>(
      `/characters/${characterId}/recent-grants?limit=5`,
      accessToken,
    );
    events = res.events;
  } catch (err) {
    // Non-critical: if the endpoint fails (e.g. 403 edge case), render empty.
    if (err instanceof ApiError && err.status === 403) return null;
    // Other errors: show empty state gracefully — do not throw.
    events = [];
  }

  return (
    <section aria-label="Grants recientes">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Grants recientes
      </p>

      {events.length === 0 ? (
        <p className="text-sm text-ink-mute">Sin grants recientes.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex min-h-[44px] items-center gap-3 rounded-md bg-paper-soft px-3 py-2"
            >
              <span className="text-base leading-none">
                <EventIcon type={event.eventType} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {grantLabel(event)}
                </p>
                <p className="text-[10px] text-ink-mute">
                  {relativeTime(event.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
