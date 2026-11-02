import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServidor } from '@/lib/supabase/servidor';

// Borra la cuenta del usuario autenticado: fotos del bucket + auth.users (cascada sobre todas sus tablas).
export async function POST() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const admin = supabaseAdmin();

  const { data: imgs } = await admin.from('item_images').select('original_path, processed_path').eq('user_id', user.id);
  const rutas = (imgs ?? []).flatMap(i => [i.original_path, i.processed_path].filter(Boolean) as string[]);
  for (let i = 0; i < rutas.length; i += 100) {
    const { error } = await admin.storage.from('wardrobe').remove(rutas.slice(i, i + 100));
    if (error) return NextResponse.json({ error: 'No se pudieron borrar las fotos: ' + error.message }, { status: 500 });
  }
  await admin.from('audit_logs').insert({ user_id: null, action: 'cuenta_borrada', details: { fotos: rutas.length } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
