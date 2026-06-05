// EventTimeline — chronological list of session events.
// REQ-DPPMB-DETAIL-05, REQ-DPPMB-DETAIL-06.
// Presentational: renders what the API returns (API already filters dm-only events by access).
// Events are sorted ascending by occurredAt.

import type { SessionEvent } from '@/app/campanas/[id]/sessions/actions';

// ---------------------------------------------------------------------------
// Human-readable event type labels
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABEL: Record<string, string> = {
  session_started: 'Sesión iniciada',
  session_paused: 'Sesión pausada',
  session_resumed: 'Sesión retomada',
  session_cancelled: 'Sesión cancelada',
  session_completed: 'Sesión completada',
  player_joined: 'Personaje se unió',
  player_left: 'Personaje salió',
  reward_distributed: 'Recompensa distribuida',
  world_change_recorded: 'Cambio en el mundo registrado',
};

function labelForType(type: string): string {
  return EVENT_TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

const RELATIVE_FMT = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSecs) < 60) return RELATIVE_FMT.format(diffSecs, 'second');
  if (Math.abs(diffMins) < 60) return RELATIVE_FMT.format(diffMins, 'minute');
  if (Math.abs(diffHours) < 24) return RELATIVE_FMT.format(diffHours, 'hour');
  return RELATIVE_FMT.format(diffDays, 'day');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EventTimelineProps {
  events: SessionEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="py-4 text-center font-sans text-sm text-ink-mute">
        No hay eventos registrados aún.
      </p>
    );
  }

  // Sort ascending by occurredAt (REQ-DPPMB-DETAIL-05: chronological ascending)
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <ol
      data-testid="event-timeline"
      className="flex flex-col gap-0 border-l-2 border-line pl-4"
    >
      {sorted.map((event) => (
        <li
          key={event.id}
          data-event-type={event.type}
          className="relative flex flex-col gap-0.5 py-2"
        >
          {/* Left-border accent dot (REQ-DPPMB-DETAIL-06: left-border accent) */}
          <span
            aria-hidden="true"
            className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full bg-accent"
          />

          {/* Event type label */}
          <span className="font-sans text-sm font-semibold text-ink">
            {labelForType(event.type)}
          </span>

          {/* Relative timestamp */}
          <time
            dateTime={event.occurredAt}
            className="font-sans text-xs text-ink-mute"
          >
            {relativeTime(event.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
