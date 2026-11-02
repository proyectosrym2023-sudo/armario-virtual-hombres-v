import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/servidor';

// Exporta SOLO los datos del usuario autenticado (RLS). Las fotos van como URLs firmadas de 24 h.
export async function GET() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const [perfil, pesos, items, imagenes, subs] = await Promise.all([
    sb.from('user_profiles').select('*').maybeSingle(),
    sb.from('weight_history').select('weight, unit, recorded_at').order('recorded_at'),
    sb.from('wardrobe_items').select('*').order('created_at'),
    sb.from('item_images').select('item_id, original_path, processed_path'),
    sb.from('subscriptions').select('plan, subscription_status, current_period_end'),
  ]);
  const rutas = (imagenes.data ?? []).flatMap(i => [i.original_path, i.processed_path].filter(Boolean) as string[]);
  const { data: firmadas } = rutas.length ? await sb.storage.from('wardrobe').createSignedUrls(rutas, 86400) : { data: [] };
  const cuerpo = JSON.stringify({
    exportado: new Date().toISOString(), email: user.email,
    perfil: perfil.data, historial_peso: pesos.data, articulos: items.data,
    fotos: (firmadas ?? []).map(f => ({ ruta: f.path, url: f.signedUrl })), suscripcion: subs.data,
  }, null, 2);
  return new NextResponse(cuerpo, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="armario-virtual-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}
