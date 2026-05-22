import Link from 'next/link';
import { Pill, SectionHead, Card } from '@/components/ui';
import type { PillTone } from '@/components/ui';

type CharacterRow = {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  xp: number;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  retired: 'Retirado',
  dead: 'Muerto',
  pending_approval: 'Pendiente',
};

const STATUS_TONES: Record<string, PillTone> = {
  draft: 'stone',
  active: 'green',
  retired: 'ink',
  dead: 'ink',
  pending_approval: 'amber',
};

function getCharacterHref(character: CharacterRow): string {
  if (character.status === 'draft') {
    return `/characters/${character.id}/wizard`;
  }
  // active, pending_approval, retired, dead → sheet (Phase D will add /characters/[id] page)
  return `/characters/${character.id}/wizard`;
}

export function CharactersSection({ characters }: { characters: CharacterRow[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <SectionHead num={characters.length || undefined} title="Tus Personajes" />
        <Link
          href="/characters/new"
          className="text-xs font-semibold text-primary hover:text-primary-deep transition-colors"
        >
          + Nuevo
        </Link>
      </div>

      {characters.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CharacterCard({ character }: { character: CharacterRow }) {
  const statusTone: PillTone = STATUS_TONES[character.status] ?? 'stone';
  const statusLabel = STATUS_LABELS[character.status] ?? character.status;
  const href = getCharacterHref(character);

  return (
    <li>
      <Link href={href} className="block transition-opacity hover:opacity-80">
        <Card variant="surface" className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{character.name}</p>
              <p className="mt-0.5 text-xs text-ink-mute">XP {character.xp.toLocaleString()}</p>
            </div>
            <Pill tone={statusTone} size="sm">{statusLabel}</Pill>
          </div>
        </Card>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
      <p className="text-sm text-ink-mute">Todavía no tenés personajes.</p>
      <Link
        href="/characters/new"
        className="mt-3 inline-block text-xs font-semibold text-primary hover:text-primary-deep transition-colors"
      >
        + Crear tu primer personaje
      </Link>
    </div>
  );
}
