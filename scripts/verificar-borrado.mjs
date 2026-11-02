// Verifica (solo lectura) que una cuenta borrada no dejó datos. Uso: node --env-file=.env.local scripts/verificar-borrado.mjs <user_id>
import { createClient } from '@supabase/supabase-js';

const id = process.argv[2];
if (!id) { console.error('Falta user_id'); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const auth = (await sb.auth.admin.getUserById(id)).data.user;
console.log('auth.users:', auth ? 'EXISTE' : 'borrado');
for (const [t, c] of [['users', 'id'], ['user_profiles', 'user_id'], ['weight_history', 'user_id'], ['wardrobe_items', 'user_id'], ['item_images', 'user_id'], ['scans', 'user_id']]) {
  const { data } = await sb.from(t).select(c).eq(c, id);
  console.log(`${t}:`, data?.length ?? '?', 'filas');
}
const { data: fotos } = await sb.storage.from('wardrobe').list(id);
console.log('fotos en wardrobe/<id>/:', fotos?.length ?? 0);
const { data: sub } = await sb.from('subscriptions').select('user_id, buyer_email').eq('subscription_key', 'E2E-' + id).maybeSingle();
console.log('suscripción (registro contable):', sub ? `conservada, user_id=${sub.user_id}` : 'no existe');
