// Comprueba (sin modificar nada) si el esquema está aplicado en el Supabase de .env.local.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
console.log('Proyecto:', new URL(url).hostname.split('.')[0].slice(0, 6) + '…');
const sb = createClient(url, key, { auth: { persistSession: false } });

const tablas = ['users', 'user_profiles', 'weight_history', 'wardrobe_items', 'item_images', 'scans', 'subscriptions', 'subscription_payments', 'hotmart_events', 'audit_logs'];
let faltan = 0;
for (const t of tablas) {
  const { error } = await sb.from(t).select('*', { head: true, count: 'exact' });
  console.log(`${error ? '✗' : '✓'} ${t}${error ? ' — ' + error.message : ''}`);
  if (error) faltan++;
}
const { error: errFn } = await sb.rpc('has_active_access', { p_uid: '00000000-0000-0000-0000-000000000000' });
console.log(`${errFn ? '✗' : '✓'} función has_active_access${errFn ? ' — ' + errFn.message : ''}`);
const { data: buckets, error: errB } = await sb.storage.listBuckets();
const wb = buckets?.find(b => b.id === 'wardrobe');
console.log(`${wb ? '✓' : '✗'} bucket wardrobe${wb ? (wb.public ? ' (¡PÚBLICO!)' : ' (privado)') : errB ? ' — ' + errB.message : ''}`);
process.exit(faltan || errFn || !wb ? 2 : 0);
