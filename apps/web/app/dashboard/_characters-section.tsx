type CharacterRow = {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  xp: number;
  updatedAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  retired: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
  dead: 'bg-red-500/15 text-red-300 ring-red-500/30',
};

export function CharactersSection({ characters }: { characters: CharacterRow[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
        Your Characters
      </h2>

      {characters.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-4 space-y-2">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CharacterCard({ character }: { character: CharacterRow }) {
  const statusClass = STATUS_STYLES[character.status] ?? STATUS_STYLES.retired;
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-700">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{character.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">XP {character.xp.toLocaleString()}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${statusClass}`}
        >
          {character.status}
        </span>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center">
      <p className="text-sm text-zinc-500">You don&apos;t have any characters yet.</p>
      <p className="mt-1 text-xs text-zinc-600">
        The character builder is coming next.
      </p>
    </div>
  );
}
