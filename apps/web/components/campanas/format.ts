/**
 * Format helpers for the /campanas screens.
 *
 * Both helpers return `null` to signal "do not render the pill" — per
 * memory #1031 (one-shot campaigns) and spec WCL-SESSIONS-PLURAL-03 +
 * WCL-NEXT-SESSION-COND-04.
 */
export function formatSessionsCount(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return '1 sesión';
  return `${count} sesiones`;
}

const DATE_FMT = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatNextSession(iso: string | null): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  return `Próx. ${DATE_FMT.format(d)}`;
}
