import { Catalogo } from '@/components/Catalogo';
import { SinAcceso } from '@/components/SinAcceso';
import { COLUMNAS, firmarFotos, rutaVisible, type Articulo } from '@/lib/armario';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function MiArmario() {
  const { sb, acceso } = await usuarioYAcceso();
  if (!acceso) {
    const { data: sub } = await sb.from('subscriptions').select('subscription_status').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return <SinAcceso estado={sub?.subscription_status} />;
  }
  const { data, error } = await sb.from('wardrobe_items').select(COLUMNAS).order('created_at', { ascending: false }).limit(1000);
  if (error) return <p className="aviso error">No se pudo cargar tu armario: {error.message}</p>;
  const items = (data ?? []) as unknown as Articulo[];
  const urls = await firmarFotos(sb, items.map(rutaVisible));
  return <Catalogo items={items} urls={urls} />;
}
