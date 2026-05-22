import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import type { SheetResponse, CharacterStatus } from '@/lib/sheet-types';
import { Banner } from '@/components/sheet/banner';
import { SheetHero } from '@/components/sheet/sheet-hero';
import { VitalGrid } from '@/components/sheet/vital-grid';
import { SheetTabs, type SheetTab } from '@/components/sheet/sheet-tabs';
import { ResumenTab } from './_tabs/resumen';
import { HabilidadesTab } from './_tabs/habilidades';
import { HechizosTab } from './_tabs/hechizos';
import { InventarioTab } from './_tabs/inventario';
import { NotasTab } from './_tabs/notas';

const VALID_TABS = ['resumen', 'habilidades', 'hechizos', 'inventario', 'notas'] as const;

function isValidTab(tab: string | undefined): tab is SheetTab {
  return VALID_TABS.includes(tab as SheetTab);
}

function buildClassSummary(data: SheetResponse): string {
  const { identity } = data.sheet;
  const race = identity.race?.slug ?? null;
  const classes = identity.classes
    .map((c) => {
      const sub = c.subclass ? ` (${c.subclass.slug})` : '';
      return `${c.slug}${sub} ${c.level}`;
    })
    .join(' / ');
  if (race && classes) return `${race} · ${classes}`;
  if (race) return race;
  return classes || 'Personaje';
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function CharacterSheetPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: SheetTab = isValidTab(tabParam) ? tabParam : 'resumen';

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  let data: SheetResponse;
  try {
    data = await api.get<SheetResponse>(`/characters/${id}/sheet`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <main className="mx-auto max-w-sm px-4 py-10 text-center">
            <p className="text-sm font-semibold text-ink">No tenés acceso a este personaje.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-xs text-primary-deep hover:underline">
              ← Volver al inicio
            </Link>
          </main>
        );
      }
    }
    return (
      <main className="mx-auto max-w-sm px-4 py-10 text-center">
        <p className="text-sm font-semibold text-ink">Error al cargar la ficha.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-xs text-primary-deep hover:underline">
          ← Volver al inicio
        </Link>
      </main>
    );
  }

  const { character, sheet, currentHp, inventory } = data;

  // Draft → redirect to wizard
  if (character.status === 'draft') {
    redirect(`/characters/${id}/wizard/stats`);
  }

  const classSummary = buildClassSummary(data);
  const statusBanner = getStatusBanner(character.status);

  return (
    <main className="mx-auto max-w-sm px-4 py-5 space-y-4">
      {statusBanner && (
        <Banner tone={statusBanner.tone}>{statusBanner.text}</Banner>
      )}

      <SheetHero
        name={sheet.identity.name}
        classSummary={classSummary}
      />

      <VitalGrid
        hp={{ current: currentHp, max: sheet.hitPoints.max }}
        ac={sheet.armorClass.value}
        initiative={sheet.initiative}
      />

      <SheetTabs activeTab={tab} characterId={id} />

      <div>
        {tab === 'resumen' && <ResumenTab sheet={sheet} />}
        {tab === 'habilidades' && <HabilidadesTab sheet={sheet} />}
        {tab === 'hechizos' && <HechizosTab sheet={sheet} />}
        {tab === 'inventario' && <InventarioTab inventory={inventory} />}
        {tab === 'notas' && <NotasTab />}
      </div>
    </main>
  );
}

function getStatusBanner(
  status: CharacterStatus,
): { tone: 'amber' | 'ink' | 'stone'; text: string } | null {
  switch (status) {
    case 'pending_approval':
      return { tone: 'amber', text: 'Pendiente de aprobación del DM' };
    case 'dead':
      return { tone: 'ink', text: 'Descansando en paz' };
    case 'retired':
      return { tone: 'stone', text: 'Retirado' };
    default:
      return null;
  }
}
