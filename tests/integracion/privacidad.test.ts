import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, borrarUsuarios, configurar, enDias, enviarWebhook, eventoHotmart, usuario } from './ayuda';

configurar();
type U = Awaited<ReturnType<typeof usuario>>;
let a: U, b: U, sinSub: U;
let itemA: string;

const png = () => new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))], { type: 'image/png' });

describe('Privacidad y aislamiento entre usuarios (RLS real)', () => {
  beforeAll(async () => {
    [a, b, sinSub] = await Promise.all([usuario('rls-a'), usuario('rls-b'), usuario('rls-sinsub')]);
    for (const u of [a, b]) await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', u.email, { proximo: enDias(30) }));
    itemA = crypto.randomUUID();
    const r = await a.sb.from('wardrobe_items').insert({ id: itemA, user_id: a.id, category: 'ropa', item_type: 'camisa', color: 'azul', main_season: 'verano', additional_seasons: ['primavera'], clothing_size: 'L' });
    expect(r.error).toBeNull();
    expect((await a.sb.storage.from('wardrobe').upload(`${a.id}/${itemA}/original.png`, png(), { contentType: 'image/png' })).error).toBeNull();
    expect((await a.sb.from('item_images').insert({ item_id: itemA, user_id: a.id, original_path: `${a.id}/${itemA}/original.png` })).error).toBeNull();
    expect((await a.sb.from('weight_history').insert({ user_id: a.id, weight: 78, unit: 'kg' })).error).toBeNull();
    expect((await a.sb.from('user_profiles').update({ polo_size: 'L', measurements: { waist: { value: 82, unit: 'cm' } } }).eq('user_id', a.id)).error).toBeNull();
  });
  afterAll(async () => {
    await admin().from('subscriptions').delete().like('buyer_email', 'avh-test-%');
    await borrarUsuarios([a.id, b.id, sinSub.id]);
  });

  it('B no puede ver los artículos, fotos ni registros de imagen de A', async () => {
    expect((await b.sb.from('wardrobe_items').select('id').eq('id', itemA)).data).toEqual([]);
    expect((await b.sb.from('item_images').select('*').eq('item_id', itemA)).data).toEqual([]);
    expect((await b.sb.storage.from('wardrobe').download(`${a.id}/${itemA}/original.png`)).error).not.toBeNull();
    expect((await b.sb.storage.from('wardrobe').createSignedUrl(`${a.id}/${itemA}/original.png`, 60)).error).not.toBeNull();
  });

  it('B no puede ver el peso, las tallas ni las medidas de A', async () => {
    expect((await b.sb.from('user_profiles').select('*').eq('user_id', a.id)).data).toEqual([]);
    expect((await b.sb.from('weight_history').select('*').eq('user_id', a.id)).data).toEqual([]);
  });

  it('B no puede modificar ni borrar datos de A (cambiando parámetros)', async () => {
    await b.sb.from('wardrobe_items').update({ color: 'rojo' }).eq('id', itemA);
    await b.sb.from('wardrobe_items').delete().eq('id', itemA);
    await b.sb.from('user_profiles').update({ weight: 1 }).eq('user_id', a.id);
    await b.sb.from('weight_history').delete().eq('user_id', a.id);
    const item = (await admin().from('wardrobe_items').select('color').eq('id', itemA).single()).data;
    const perfil = (await admin().from('user_profiles').select('weight').eq('user_id', a.id).single()).data;
    expect(item?.color).toBe('azul');
    expect(Number(perfil?.weight)).toBe(78);
  });

  it('B no puede crear artículos ni subir fotos a nombre de A', async () => {
    const r = await b.sb.from('wardrobe_items').insert({ user_id: a.id, category: 'ropa', item_type: 'polo', color: 'negro', main_season: 'verano' });
    expect(r.error).not.toBeNull();
    expect((await b.sb.storage.from('wardrobe').upload(`${a.id}/intruso/x.png`, png())).error).not.toBeNull();
  });

  it('B no ve la suscripción de A ni la tabla de eventos, y no puede autoasignarse acceso', async () => {
    expect((await b.sb.from('subscriptions').select('*').eq('buyer_email', a.email)).data).toEqual([]);
    expect((await b.sb.from('hotmart_events').select('*').limit(1)).data).toEqual([]);
    const r = await b.sb.rpc('aplicar_suscripcion', { p_subscription_key: 'x', p_buyer_email: b.email, p_product_id: '1', p_transaction_id: 'x', p_plan: 'anual', p_status: 'active', p_access: true, p_period_end: enDias(999), p_event_at: new Date().toISOString(), p_event_name: 'X', p_amount: 0, p_currency: 'X', p_recurrence: 1, p_registrar_pago: false });
    expect(r.error).not.toBeNull();
    expect((await b.sb.from('subscriptions').insert({ buyer_email: b.email, hotmart_product_id: '1', subscription_key: 'hack', transaction_id: 'h', subscription_status: 'active', access_enabled: true, current_period_end: enDias(999), last_event_at: new Date().toISOString() })).error).not.toBeNull();
  });

  it('usuario sin suscripción no puede guardar artículos, pero sí ver y editar su perfil', async () => {
    const r = await sinSub.sb.from('wardrobe_items').insert({ user_id: sinSub.id, category: 'relojes', item_type: 'reloj', color: 'plateado', main_season: 'invierno' });
    expect(r.error).not.toBeNull();
    expect((await sinSub.sb.from('weight_history').insert({ user_id: sinSub.id, weight: 170, unit: 'lb' })).error).toBeNull();
    expect((await sinSub.sb.from('user_profiles').update({ shirt_size: 'M' }).eq('user_id', sinSub.id)).error).toBeNull();
  });

  it('suscripción vencida bloquea la creación de artículos', async () => {
    await admin().from('subscriptions').update({ current_period_end: enDias(-1) }).eq('buyer_email', b.email);
    const r = await b.sb.from('wardrobe_items').insert({ user_id: b.id, category: 'ropa', item_type: 'jeans', color: 'azul', main_season: 'otono' });
    expect(r.error).not.toBeNull();
    expect((await b.sb.rpc('has_active_access')).data).toBe(false);
    await admin().from('subscriptions').update({ current_period_end: enDias(30) }).eq('buyer_email', b.email);
  });

  it('acceso desde otro dispositivo: una segunda sesión del mismo usuario ve los mismos datos', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const otro = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: link } = await admin().auth.admin.generateLink({ type: 'magiclink', email: a.email });
    const v = await otro.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties!.hashed_token });
    expect(v.error).toBeNull();
    expect((await otro.from('wardrobe_items').select('id').eq('id', itemA)).data).toHaveLength(1);
  });

  it('cerrar sesión: el servidor (getUser) rechaza el token anterior', async () => {
    const tmp = await usuario('logout');
    const token = (await tmp.sb.auth.getSession()).data.session!.access_token;
    expect((await admin().auth.getUser(token)).error).toBeNull();
    await tmp.sb.auth.signOut({ scope: 'global' });
    expect((await admin().auth.getUser(token)).error).not.toBeNull();
    await borrarUsuarios([tmp.id]);
  });
});

describe('Perfil: peso, tallas y medidas', () => {
  let u: U;
  beforeAll(async () => { u = await usuario('perfil'); });
  afterAll(async () => borrarUsuarios([u.id]));

  it('registrar y actualizar peso → el perfil refleja el último y queda historial', async () => {
    await u.sb.from('weight_history').insert({ user_id: u.id, weight: 80, unit: 'kg', recorded_at: '2026-10-01' });
    await u.sb.from('weight_history').insert({ user_id: u.id, weight: 78.5, unit: 'kg', recorded_at: '2026-11-01' });
    const p = (await u.sb.from('user_profiles').select('weight, weight_unit').single()).data;
    expect([Number(p?.weight), p?.weight_unit]).toEqual([78.5, 'kg']);
    expect((await u.sb.from('weight_history').select('id')).data).toHaveLength(2);
  });

  it('borrar el registro más reciente recalcula el peso actual', async () => {
    const { data } = await u.sb.from('weight_history').insert({ user_id: u.id, weight: 77, unit: 'kg', recorded_at: '2026-11-15' }).select('id').single();
    expect(Number((await u.sb.from('user_profiles').select('weight').single()).data?.weight)).toBe(77);
    await u.sb.from('weight_history').delete().eq('id', data!.id);
    expect(Number((await u.sb.from('user_profiles').select('weight').single()).data?.weight)).toBe(78.5);
  });

  it('un registro con fecha anterior no reemplaza el peso actual', async () => {
    await u.sb.from('weight_history').insert({ user_id: u.id, weight: 90, unit: 'kg', recorded_at: '2025-01-01' });
    expect(Number((await u.sb.from('user_profiles').select('weight').single()).data?.weight)).toBe(78.5);
  });

  it('peso fuera de rango se rechaza en la base de datos', async () => {
    expect((await u.sb.from('weight_history').insert({ user_id: u.id, weight: -5, unit: 'kg' })).error).not.toBeNull();
  });

  it('registrar tallas y editar medidas (cm/in)', async () => {
    const r = await u.sb.from('user_profiles').update({ polo_size: 'L', shirt_size: 'L', trouser_size: '32', measurements: { waist: { value: 82, unit: 'cm' }, neck: { value: 15.5, unit: 'in' } } }).eq('user_id', u.id).select().single();
    expect(r.error).toBeNull();
    expect(r.data.measurements.neck).toEqual({ value: 15.5, unit: 'in' });
  });

  it('la talla de ropa no se permite en accesorios (restricción en BD)', async () => {
    const a2 = await admin().from('wardrobe_items').insert({ user_id: u.id, category: 'relojes', item_type: 'reloj', color: 'plateado', main_season: 'verano', clothing_size: 'M' });
    expect(a2.error?.message).toMatch(/talla_solo_ropa/);
  });

  it('borrar datos personales elimina peso, historial, tallas y medidas', async () => {
    expect((await u.sb.rpc('borrar_datos_personales')).error).toBeNull();
    const p = (await u.sb.from('user_profiles').select('weight, polo_size, measurements').single()).data;
    expect(p).toEqual({ weight: null, polo_size: null, measurements: {} });
    expect((await u.sb.from('weight_history').select('id')).data).toEqual([]);
  });

  it('borrar la cuenta elimina en cascada todos sus datos', async () => {
    const t = await usuario('borrado');
    await t.sb.from('weight_history').insert({ user_id: t.id, weight: 70, unit: 'kg' });
    await t.sb.from('user_profiles').update({ polo_size: 'L', measurements: { chest: { value: 100, unit: 'cm' } } }).eq('user_id', t.id);
    expect((await admin().auth.admin.deleteUser(t.id)).error).toBeNull(); // antes fallaba: "Database error deleting user"
    expect((await admin().from('users').select('id').eq('id', t.id)).data).toEqual([]);
    expect((await admin().from('user_profiles').select('user_id').eq('user_id', t.id)).data).toEqual([]);
    expect((await admin().from('weight_history').select('id').eq('user_id', t.id)).data).toEqual([]);
  });
});
