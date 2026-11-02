// Crea un usuario de PRUEBA confirmado con suscripción activa y devuelve un token_hash de acceso de un solo uso.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `avh-test-e2e-${Date.now().toString(36)}@example.com`;
const { data: u, error } = await sb.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + 'Aa1!' });
if (error) throw error;
const fin = new Date(Date.now() + 30 * 864e5).toISOString();
const { error: e2 } = await sb.from('subscriptions').insert({
  user_id: u.user.id, buyer_email: email, hotmart_product_id: 'e2e', subscription_key: 'E2E-' + u.user.id, transaction_id: 'E2E',
  plan: 'mensual', subscription_status: 'active', access_enabled: true, current_period_end: fin, last_event_at: new Date().toISOString(),
});
if (e2) throw e2;
const { data: link, error: e3 } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
if (e3) throw e3;
console.log(JSON.stringify({ email, userId: u.user.id, tokenHash: link.properties.hashed_token }));
