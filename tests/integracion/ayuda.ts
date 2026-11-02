// Utilidades para pruebas de integración contra un proyecto Supabase DE PRUEBAS (.env.local).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const HOTTOK = 'hottok-de-prueba-' + 'x'.repeat(24);
export const PRODUCTO = '9900001';
export const ADMIN_SECRET = 'admin-secret-de-prueba-'.padEnd(40, 'z');

export function configurar() {
  if (!URL_SB || !ANON || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan variables de Supabase en .env.local');
  if (/prod/i.test(URL_SB)) throw new Error('Esto parece producción: usa un proyecto de PRUEBAS');
  Object.assign(process.env, { HOTMART_HOTTOK: HOTTOK, HOTMART_PRODUCT_ID: PRODUCTO, HOTMART_PLAN_MENSUAL: 'AVH Mensual', HOTMART_PLAN_ANUAL: 'AVH Anual', ADMIN_SECRET });
}

export const admin = () => createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const sufijo = Date.now().toString(36);
export const emailPrueba = (n: string) => `avh-test-${n}-${sufijo}@example.com`;

/** Crea un usuario CONFIRMADO y devuelve un cliente con su sesión (anon key + RLS). */
export async function usuario(nombre: string): Promise<{ id: string; email: string; sb: SupabaseClient }> {
  const email = emailPrueba(nombre), password = 'Prueba-' + crypto.randomUUID();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  return { id: data.user.id, email, sb };
}

export async function borrarUsuarios(ids: string[]) {
  const a = admin();
  for (const id of ids) {
    const { data: files } = await a.storage.from('wardrobe').list(id, { limit: 100 });
    for (const carpeta of files ?? []) {
      const { data: dentro } = await a.storage.from('wardrobe').list(`${id}/${carpeta.name}`);
      if (dentro?.length) await a.storage.from('wardrobe').remove(dentro.map(f => `${id}/${carpeta.name}/${f.name}`));
    }
    await a.auth.admin.deleteUser(id);
  }
}

let n = 0;
export function eventoHotmart(event: string, email: string, o: { sub?: string; tx?: string; plan?: string; producto?: string; rec?: number; proximo?: string; creado?: string } = {}) {
  n++;
  const sub = o.sub ?? 'SUB-' + email;
  if (event === 'SUBSCRIPTION_CANCELLATION') {
    return { id: `evt-${n}-${sufijo}`, event, version: '2.0.0', creation_date: new Date(o.creado ?? Date.now()).getTime(),
      data: { product: { id: Number(o.producto ?? PRODUCTO) }, subscriber: { code: sub, email }, subscription: { plan: { name: o.plan ?? 'AVH Mensual' } },
        date_next_charge: o.proximo ? new Date(o.proximo).getTime() : undefined } };
  }
  return {
    id: `evt-${n}-${sufijo}`, event, version: '2.0.0', creation_date: new Date(o.creado ?? Date.now()).getTime(),
    data: {
      product: { id: Number(o.producto ?? PRODUCTO) },
      buyer: { email, name: 'Prueba', document: '000' },
      purchase: { transaction: o.tx ?? `TX-${n}-${sufijo}`, status: 'APPROVED', recurrence_number: o.rec ?? 1,
        approved_date: Date.now(), date_next_charge: o.proximo ? new Date(o.proximo).getTime() : undefined, price: { value: 99, currency_value: 'MXN' } },
      subscription: { status: 'ACTIVE', plan: { name: o.plan ?? 'AVH Mensual' }, subscriber: { code: sub } },
    },
  };
}

export async function enviarWebhook(body: unknown, hottok = HOTTOK) {
  const { POST } = await import('@/app/api/hotmart/webhook/route');
  const res = await POST(new Request('http://localhost/api/hotmart/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hotmart-hottok': hottok }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() };
}

export const enDias = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
