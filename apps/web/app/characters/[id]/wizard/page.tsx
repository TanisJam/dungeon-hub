import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function BuildIndex({ params }: Props) {
  const { id } = await params;
  redirect(`/characters/${id}/wizard/stats`);
}
