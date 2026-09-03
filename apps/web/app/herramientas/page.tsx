import { redirect } from 'next/navigation';

/**
 * /herramientas index — redirects to the first Herramientas subnav item.
 * See HERRAMIENTAS_SUBNAV_ITEMS in ./_components/subnav-items.ts.
 */
export default function HerramientasIndexPage() {
  redirect('/herramientas/facciones');
}
