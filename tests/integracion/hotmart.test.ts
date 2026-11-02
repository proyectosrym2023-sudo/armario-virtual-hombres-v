import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_SECRET, admin, borrarUsuarios, configurar, emailPrueba, enDias, enviarWebhook, eventoHotmart, usuario } from './ayuda';

configurar();
const creados: string[] = [];
const sub = async (email: string) => (await admin().from('subscriptions').select('*').eq('buyer_email', email).maybeSingle()).data;
const acceso = async (uid: string) => (await admin().rpc('has_active_access', { p_uid: uid })).data as boolean;

describe('Webhook Hotmart (integración real con Supabase de pruebas)', () => {
  let u: Awaited<ReturnType<typeof usuario>>;
  beforeAll(async () => { u = await usuario('hotmart'); creados.push(u.id); });
  afterAll(async () => {
    await admin().from('subscriptions').delete().like('buyer_email', 'avh-test-%');
    await borrarUsuarios(creados);
  });

  it('Hottok inválido → 401 y no guarda nada', async () => {
    const ev = eventoHotmart('PURCHASE_APPROVED', u.email);
    expect((await enviarWebhook(ev, 'malo')).status).toBe(401);
    expect((await admin().from('hotmart_events').select('event_id').eq('event_id', ev.id)).data).toHaveLength(0);
  });

  it('compra mensual aprobada → activa el acceso del usuario', async () => {
    const r = await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', u.email, { proximo: enDias(30), tx: 'TX-M1-' + u.id }));
    expect(r).toMatchObject({ status: 200, json: { estado: 'procesado', detalle: 'aplicado' } });
    const s = await sub(u.email);
    expect(s).toMatchObject({ user_id: u.id, plan: 'mensual', subscription_status: 'active', access_enabled: true });
    expect(await acceso(u.id)).toBe(true);
  });

  it('evento duplicado → no duplica transacciones ni accesos', async () => {
    const ev = eventoHotmart('PURCHASE_APPROVED', u.email, { proximo: enDias(30), tx: 'TX-DUP-' + u.id });
    await enviarWebhook(ev);
    const r2 = await enviarWebhook(ev);
    expect(r2.json.estado).toBe('duplicado');
    const pagos = await admin().from('subscription_payments').select('transaction_id').eq('transaction_id', 'TX-DUP-' + u.id);
    expect(pagos.data).toHaveLength(1);
    expect((await admin().from('subscriptions').select('id').eq('buyer_email', u.email)).data).toHaveLength(1);
  });

  it('renovación → extiende el periodo y registra el nuevo pago', async () => {
    const r = await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', u.email, { rec: 2, tx: 'TX-R2-' + u.id, proximo: enDias(60) }));
    expect(r.json.detalle).toBe('aplicado');
    const s = await sub(u.email);
    expect(new Date(s.current_period_end).getTime()).toBeGreaterThan(Date.now() + 55 * 864e5);
  });

  it('pago atrasado → past_due, conserva el acceso del periodo ya pagado', async () => {
    await enviarWebhook(eventoHotmart('PURCHASE_DELAYED', u.email));
    const s = await sub(u.email);
    expect(s.subscription_status).toBe('past_due');
    expect(await acceso(u.id)).toBe(true);
  });

  it('cancelación → no elimina el periodo pagado; al vencer, se bloquea', async () => {
    await enviarWebhook(eventoHotmart('SUBSCRIPTION_CANCELLATION', u.email, { proximo: enDias(60) }));
    let s = await sub(u.email);
    expect(s.subscription_status).toBe('canceled');
    expect(await acceso(u.id)).toBe(true);
    await admin().from('subscriptions').update({ current_period_end: enDias(-1) }).eq('id', s.id); // simula el vencimiento
    expect(await acceso(u.id)).toBe(false);
    s = await sub(u.email);
    expect(s.access_enabled).toBe(true); // el bloqueo lo da la fecha, no hace falta otro webhook
  });

  it('evento viejo que llega tarde no pisa el estado nuevo', async () => {
    const r = await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', u.email, { creado: enDias(-400), proximo: enDias(300) }));
    expect(r.json.detalle).toBe('evento_antiguo');
    expect((await sub(u.email)).subscription_status).toBe('canceled');
  });

  it('compra anual → plan anual', async () => {
    const email = emailPrueba('anual');
    await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', email, { plan: 'AVH Anual', proximo: enDias(365) }));
    expect((await sub(email))).toMatchObject({ plan: 'anual', access_enabled: true, user_id: null });
  });

  it('reembolso → corta el acceso de inmediato', async () => {
    const v = await usuario('reembolso'); creados.push(v.id);
    await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', v.email, { proximo: enDias(30) }));
    expect(await acceso(v.id)).toBe(true);
    await enviarWebhook(eventoHotmart('PURCHASE_REFUNDED', v.email));
    expect(await acceso(v.id)).toBe(false);
    expect((await sub(v.email)).subscription_status).toBe('refunded');
  });

  it('contracargo → corta el acceso de inmediato', async () => {
    const v = await usuario('chargeback'); creados.push(v.id);
    await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', v.email, { proximo: enDias(30) }));
    await enviarWebhook(eventoHotmart('PURCHASE_CHARGEBACK', v.email));
    expect(await acceso(v.id)).toBe(false);
    expect((await sub(v.email)).subscription_status).toBe('chargeback');
  });

  it('compra de OTRO producto no habilita el acceso', async () => {
    const v = await usuario('otroproducto'); creados.push(v.id);
    const r = await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', v.email, { producto: '1234', proximo: enDias(30) }));
    expect(r.json.estado).toBe('ignorado');
    expect(await sub(v.email)).toBeNull();
    expect(await acceso(v.id)).toBe(false);
  });

  it('compra ANTES de crear la cuenta → se vincula al confirmar el email', async () => {
    const email = emailPrueba('compraprimero');
    await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', email, { proximo: enDias(30) }));
    expect((await sub(email)).user_id).toBeNull();
    const { data } = await admin().auth.admin.createUser({ email, password: 'Prueba-' + crypto.randomUUID(), email_confirm: true });
    creados.push(data.user!.id);
    expect((await sub(email)).user_id).toBe(data.user!.id);
    expect(await acceso(data.user!.id)).toBe(true);
  });

  it('cuenta SIN confirmar no se vincula (evita robo de acceso con un email ajeno)', async () => {
    const email = emailPrueba('sinconfirmar');
    await enviarWebhook(eventoHotmart('PURCHASE_APPROVED', email, { proximo: enDias(30) }));
    const { data } = await admin().auth.admin.createUser({ email, password: 'Prueba-' + crypto.randomUUID(), email_confirm: false });
    creados.push(data.user!.id);
    expect((await sub(email)).user_id).toBeNull();
  });

  it('recuperación de notificaciones fallidas: /api/admin/hotmart/reprocesar', async () => {
    const email = emailPrueba('reproceso');
    const ev = eventoHotmart('PURCHASE_APPROVED', email, { proximo: enDias(30) });
    await admin().from('hotmart_events').insert({ event_id: ev.id, event_name: ev.event, payload: ev, processed: false, last_error: 'simulado' });
    const { POST } = await import('@/app/api/admin/hotmart/reprocesar/route');
    expect((await POST(new Request('http://x', { method: 'POST' }))).status).toBe(401);
    const res = await POST(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` } }));
    const json = await res.json();
    expect(json.resultados.find((r: { event_id: string }) => r.event_id === ev.id)?.estado).toBe('procesado');
    expect((await sub(email)).access_enabled).toBe(true);
  });
});
