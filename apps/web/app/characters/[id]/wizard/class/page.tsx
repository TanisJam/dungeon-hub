import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { requiresL1Subclass, type ClassData } from './_parsers';
import { ClassPicker, type ClassEntry, type SubclassRow } from './_picker';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';

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

  // Para clases que requieren L1 subclass (Cleric/Sorcerer/Warlock en PHB),
  // pre-fetcheamos la lista de subclasses para que el picker pueda mostrarlas
  // sin un round-trip extra al seleccionar.
  const l1SubclassClasses = detailed.filter((d) => requiresL1Subclass(d.data));
  const subclassEntries = await Promise.all(
    l1SubclassClasses.map(async (klass) => {
      const { data } = await api.get<{ data: SubclassRow[] }>(
        `/compendium/subclasses?campaign=${character.campaignId}&class=${klass.slug}&limit=100`,
        token,
      );
      return [`${klass.slug}|${klass.source}`, data] as const;
    }),
  );
  const subclassesByClass: Record<string, SubclassRow[]> = Object.fromEntries(subclassEntries);

  const entries: ClassEntry[] = detailed.map((d) => ({
    slug: d.slug,
    source: d.source,
    name: d.name,
    data: d.data,
  }));

  return (
    <section>
      <NumberedSectionHead
        num="03"
        title="Clase"
        meta="Paso 3 de 6"
        description="Elegí tu clase. Empieza en nivel 1; multiclase y subida de nivel vienen después."
      />

      <div className="mt-6">
        <ClassPicker
          characterId={id}
          entries={entries}
          subclassesByClass={subclassesByClass}
          lockedSkills={(character.data?.background?.skills ?? []).map((s) => s.toLowerCase())}
          initialSelection={(() => {
            const primary = character.data?.classes?.[0];
            return primary
              ? {
                  slug: primary.slug,
                  source: primary.source,
                  skillChoices: primary.skillChoices ?? [],
                  subclass: primary.subclass,
                }
              : null;
          })()}
        />
      </div>
    </section>
  );
}
