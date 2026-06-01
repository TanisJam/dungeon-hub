import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import {
  parseClassStartingEquipment,
  parseBackgroundStartingEquipment,
} from '@dungeon-hub/domain/character/starting-equipment';
import type {
  ClassStartingEquipment,
  BackgroundStartingEquipment,
  EquipmentSelections,
} from '@dungeon-hub/domain/character/starting-equipment';
import { NumberedSectionHead } from '@/components/layout/numbered-section-head';
import { EquipmentPicker } from './_picker';

// ─── API response types ───────────────────────────────────────────────────────

type Character = {
  id: string;
  worldId: string;
  data: {
    classes?: Array<{ slug: string; source: string }>;
    background?: { slug: string; source: string };
    equipmentSelections?: EquipmentSelections;
  } | null;
};

type ClassCompendiumRow = {
  slug: string;
  source: string;
  data: {
    startingEquipment?: ClassStartingEquipment;
  };
};

type BackgroundCompendiumRow = {
  slug: string;
  source: string;
  data: {
    startingEquipment?: BackgroundStartingEquipment;
  };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> };

export default async function EquipmentStepPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  const character = await api.get<Character>(`/characters/${id}`, token);

  const primaryClass = character.data?.classes?.[0];
  if (!primaryClass) redirect(`/characters/${id}/wizard/class`);

  const background = character.data?.background;
  if (!background) redirect(`/characters/${id}/wizard/background`);

  // Load class compendium row to get startingEquipment.defaultData
  const classRow = await api.get<ClassCompendiumRow>(
    `/compendium/classes/${primaryClass.slug}?source=${primaryClass.source}&world=${character.worldId}`,
    token,
  );

  // Load background compendium row to get startingEquipment array
  const bgRow = await api.get<BackgroundCompendiumRow>(
    `/compendium/backgrounds/${background.slug}?source=${background.source}&world=${character.worldId}`,
    token,
  );

  // Parse both into render-ready models
  const parsedClass = classRow.data.startingEquipment
    ? parseClassStartingEquipment(classRow.data.startingEquipment)
    : parseClassStartingEquipment({ defaultData: [] });

  const parsedBackground = bgRow.data.startingEquipment
    ? parseBackgroundStartingEquipment(bgRow.data.startingEquipment)
    : parseBackgroundStartingEquipment([]);

  // Hydrate from stored selections (round-trip, REQ-SEQUIP-10)
  const initialSelections = character.data?.equipmentSelections ?? null;

  return (
    <section>
      <NumberedSectionHead
        num="05"
        title="Equipo"
        meta="Paso 5 de 7"
        description="Elegí el equipo inicial de tu personaje."
      />
      <div className="mt-6">
        <EquipmentPicker
          characterId={id}
          worldId={character.worldId}
          parsedClass={parsedClass}
          parsedBackground={parsedBackground}
          initialSelections={initialSelections}
        />
      </div>
    </section>
  );
}
