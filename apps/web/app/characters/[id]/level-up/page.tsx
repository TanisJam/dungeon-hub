import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import type { SheetResponse } from '@/lib/sheet-types';
import { AppShell } from '@/components/layout/app-shell';
import { LevelUpFlow } from './_flow';

// PHB ASI cadences for the 12 base classes (MVP L1–L14 cap).
// Fighter extra ASIs at 6; Rogue extra at 10.
// All others: 4, 8, 12.
// Source: PHB 2014 per-class tables.
const ASI_LEVELS: Record<string, number[]> = {
  fighter:   [4, 6, 8, 12, 14],
  rogue:     [4, 8, 10, 12],
  barbarian: [4, 8, 12],
  bard:      [4, 8, 12],
  cleric:    [4, 8, 12],
  druid:     [4, 8, 12],
  monk:      [4, 8, 12],
  paladin:   [4, 8, 12],
  ranger:    [4, 8, 12],
  sorcerer:  [4, 8, 12],
  warlock:   [4, 8, 12],
  wizard:    [4, 8, 12],
};

/** Map of hit die by class slug (PHB 2014). */
const HIT_DIE: Record<string, string> = {
  barbarian: 'd12', fighter: 'd10', paladin: 'd10', ranger: 'd10',
  bard: 'd8', cleric: 'd8', druid: 'd8', monk: 'd8', rogue: 'd8', warlock: 'd8',
  sorcerer: 'd6', wizard: 'd6',
};

type WorldCallerRole = 'gm' | 'player' | null;
type WorldDetailLite = { callerRole: WorldCallerRole; rulesProfile?: { variantRules?: { multiclassing?: boolean } } };

type Props = { params: Promise<{ id: string }> };

export default async function LevelUpPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  let data: SheetResponse;
  try {
    data = await api.get<SheetResponse>(`/characters/${id}/sheet`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <AppShell title="Subir nivel">
        <p className="py-10 text-center text-sm text-ink-mute">Error al cargar el personaje.</p>
      </AppShell>
    );
  }

  const { character, sheet } = data;

  // Only active characters can level up.
  if (character.status !== 'active') {
    redirect(`/characters/${id}`);
  }

  // Fetch world detail for rulesProfile.
  let multiclassingEnabled = true;
  try {
    const world = await api.get<WorldDetailLite>(
      `/worlds/${character.worldId}`,
      session.access_token,
    );
    if (world.rulesProfile?.variantRules?.multiclassing === false) {
      multiclassingEnabled = false;
    }
  } catch {
    // best-effort; default true
  }

  // Build owned-class list with isAsiLevel flag.
  const ownedClasses = sheet.identity.classes.map((cls) => {
    const nextLevel = cls.level + 1;
    const asiLevels = ASI_LEVELS[cls.slug] ?? [4, 8, 12];
    const isAsiLevel = asiLevels.includes(nextLevel);
    return {
      slug: cls.slug,
      source: 'PHB' as const,
      level: cls.level,
      hitDie: HIT_DIE[cls.slug] ?? 'd8',
      isAsiLevel,
    };
  });

  return (
    <AppShell title="Subir nivel" constructorHref={`/characters/${id}`}>
      <div className="md:mx-auto md:max-w-lg">
        <LevelUpFlow
          characterId={id}
          ownedClasses={ownedClasses}
          multiclassingEnabled={multiclassingEnabled}
          characterName={sheet.identity.name}
        />
      </div>
    </AppShell>
  );
}
