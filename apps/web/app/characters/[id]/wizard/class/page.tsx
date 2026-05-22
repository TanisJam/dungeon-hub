import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import type { ClassData } from './_parsers';
import { ClassPicker, type ClassEntry } from './_picker';

type ClassRow = { id: string; slug: string; source: string; name: string };
type ClassDetail = ClassRow & { data: ClassData };

type AppliedClass = {
  slug: string;
  source: string;
  level: number;
  subclass: { slug: string; source: string } | null;
  skillChoices: string[];
};

type Character = {
  id: string;
  campaignId: string;
  data: {
    classes?: AppliedClass[];
    background?: { skills?: string[] };
  } | null;
};

type Props = { params: Promise<{ id: string }> };

export default async function ClassStepPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  const character = await api.get<Character>(`/characters/${id}`, token);

  const { data: list } = await api.get<{ data: ClassRow[] }>(
    `/compendium/classes?campaign=${character.campaignId}&limit=100`,
    token,
  );

  const detailed: ClassDetail[] = await Promise.all(
    list.map((row) =>
      api.get<ClassDetail>(
        `/compendium/classes/${row.slug}?source=${row.source}&campaign=${character.campaignId}`,
        token,
      ),
    ),
  );

  const entries: ClassEntry[] = detailed.map((d) => ({
    slug: d.slug,
    source: d.source,
    name: d.name,
    data: d.data,
  }));

  return (
    <section>
      <h2 className="text-lg font-semibold">Class</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Pick your class. Starts at level 1; multiclass and level-up come later.
      </p>

      <div className="mt-6">
        <ClassPicker
          characterId={id}
          entries={entries}
          lockedSkills={(character.data?.background?.skills ?? []).map((s) => s.toLowerCase())}
          initialSelection={(() => {
            const primary = character.data?.classes?.[0];
            return primary
              ? {
                  slug: primary.slug,
                  source: primary.source,
                  skillChoices: primary.skillChoices ?? [],
                }
              : null;
          })()}
        />
      </div>
    </section>
  );
}
