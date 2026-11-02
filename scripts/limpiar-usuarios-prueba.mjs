// Borra del Supabase de PRUEBAS los usuarios creados por las pruebas (email avh-test-*@example.com) y sus fotos.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let borrados = 0, errores = 0;
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  const prueba = data.users.filter(u => /^avh-test-.*@example\.com$/.test(u.email ?? ''));
  for (const u of prueba) {
    const { data: carpetas } = await sb.storage.from('wardrobe').list(u.id, { limit: 100 });
    for (const c of carpetas ?? []) {
      const { data: fs } = await sb.storage.from('wardrobe').list(`${u.id}/${c.name}`);
      if (fs?.length) await sb.storage.from('wardrobe').remove(fs.map(f => `${u.id}/${c.name}/${f.name}`));
    }
    const { error: e } = await sb.auth.admin.deleteUser(u.id);
    if (e) { errores++; console.log('✗', u.email, e.message); } else borrados++;
  }
  if (data.users.length < 200) break;
}
const { error: eSub } = await sb.from('subscriptions').delete().like('buyer_email', 'avh-test-%');
console.log(`Usuarios de prueba borrados: ${borrados}, errores: ${errores}${eSub ? ', subs: ' + eSub.message : ''}`);
