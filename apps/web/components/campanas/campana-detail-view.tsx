import { SectionHead } from '@/components/ui/section-head';
import { Pill } from '@/components/ui/pill';
import type { CampaignDetail, CampaignMemberRole } from './types';

export type CampanaSessionRow = {
  id: string;
  title: string;
  status: 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  scheduledAt: string | null;
};

type Props = {
  detail: CampaignDetail;
  sessions: CampanaSessionRow[];
};

const ROLE_LABEL: Record<CampaignMemberRole, string> = {
  gm: 'DM',
  player: 'Jugador',
};
const ROLE_TONE: Record<CampaignMemberRole, 'pink' | 'stone'> = {
  gm: 'pink',
  player: 'stone',
};

const STATUS_LABEL: Record<CampanaSessionRow['status'], string> = {
  scheduled: 'Programada',
  active: 'En curso',
  paused: 'Pausada',
  completed: 'Jugada',
  cancelled: 'Cancelada',
};
const STATUS_TONE: Record<CampanaSessionRow['status'], 'green' | 'coral' | 'stone' | 'amber'> = {
  scheduled: 'amber',
  active: 'green',
  paused: 'stone',
  completed: 'green',
  cancelled: 'stone',
};

const SHORT_DATE = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function CampanaDetailView({ detail, sessions }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">{detail.name}</h1>
        {detail.tagline ? (
          <p data-testid="campana-tagline" className="font-script text-sm text-ink-soft">
            {detail.tagline}
          </p>
        ) : null}
      </header>

      <section>
        <SectionHead title="Miembros" meta={detail.members.length} />
        <ul className="mt-2 flex flex-col gap-1.5">
          {detail.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-2"
            >
              <span className="font-sans text-sm font-semibold text-ink">{m.username}</span>
              <Pill size="sm" tone={ROLE_TONE[m.role]}>
                {ROLE_LABEL[m.role]}
              </Pill>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHead title="Sesiones" meta={sessions.length} />
        {sessions.length === 0 ? (
          <p className="mt-2 font-sans text-sm text-ink-mute">No hay sesiones aún</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-raised px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-sm font-semibold text-ink">
                    {s.title}
                  </span>
                  {s.scheduledAt ? (
                    <span className="font-sans text-xs text-ink-mute">
                      {SHORT_DATE.format(new Date(s.scheduledAt))}
                    </span>
                  ) : null}
                </div>
                <Pill size="sm" tone={STATUS_TONE[s.status]}>
                  {STATUS_LABEL[s.status]}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
