import { redirect } from 'next/navigation';

/**
 * Redirect: /characters/:id/codex/bestiario → /characters/:id/codex
 *
 * The bespoke bestiary page has been replaced by the generic scoped codex browser:
 *   /characters/:id/codex          — grid (Monstruos card)
 *   /characters/:id/codex/monsters — scoped list + search + DetailSheet
 *
 * REQ-CCB-MIG-01 (spec character-codex-browser): old route MUST redirect, not 404.
 */

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BestiarioRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/characters/${id}/codex`);
}
