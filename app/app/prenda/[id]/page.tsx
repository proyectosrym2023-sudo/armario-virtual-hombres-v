import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetalleArticulo } from '@/components/DetalleArticulo';
import { COLUMNAS, firmarFotos, type Articulo } from '@/lib/armario';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function PaginaArticulo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const [{ id }, { nuevo }] = await Promise.all([params, searchParams]);
  const { sb, user, acceso } = await usuarioYAcceso();
  // RLS: si el id es de otro usuario, la consulta devuelve vacío → 404 (no revela que existe).
  const { data } = await sb.from('wardrobe_items').select(COLUMNAS).eq('id', id).maybeSingle();
  if (!data) notFound();
  const a = data as unknown as Articulo;
  const urls = await firmarFotos(sb, [a.item_images?.original_path ?? '', a.item_images?.processed_path ?? '']);
  const { data: perfil } = await sb.from('user_profiles')
    .select('shirt_size, polo_size, trouser_size, jeans_size, shorts_size, jacket_size, blazer_size, suit_size, sportswear_size')
    .eq('user_id', user!.id).maybeSingle();
  return (
    <>
      <Link href="/app" className="boton chico">← Mi armario</Link>
      {nuevo && <p className="aviso ok" style={{ marginTop: 12 }}>Guardado en tu armario ✓</p>}
      <DetalleArticulo
        articulo={a}
        urlOriginal={urls[a.item_images?.original_path ?? ''] ?? null}
        urlProcesada={urls[a.item_images?.processed_path ?? ''] ?? null}
        tallasHabituales={perfil ?? {}}
        puedeEditar={acceso}
      />
    </>
  );
}
