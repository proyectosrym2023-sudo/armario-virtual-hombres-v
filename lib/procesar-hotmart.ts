import type { SupabaseClient } from '@supabase/supabase-js';
import { interpretar, payloadMinimo, type ConfigHotmart } from './hotmart';

export function configHotmart(): ConfigHotmart {
  return {
    productId: process.env.HOTMART_PRODUCT_ID ?? '',
    planMensual: process.env.HOTMART_PLAN_MENSUAL || undefined,
    planAnual: process.env.HOTMART_PLAN_ANUAL || undefined,
  };
}

type Resultado = { estado: 'procesado' | 'duplicado' | 'ignorado'; detalle: string };

/**
 * Guarda el evento (idempotente por event_id) y lo aplica. Si falla, queda processed=false para
 * reintento (Hotmart reintenta solo ante no-2xx; además /api/admin/hotmart/reprocesar).
 */
export async function recibirEvento(admin: SupabaseClient, body: Record<string, any>): Promise<Resultado> {
  const d = interpretar(body, configHotmart());
  const fila = {
    event_id: d.eventId, event_name: d.eventName || 'desconocido', transaction_id: d.transactionId,
    payload: payloadMinimo(body),
    processed: d.ignorar, result: d.ignorar ? `ignorado: ${d.motivo}` : null,
    processed_at: d.ignorar ? new Date().toISOString() : null,
  };
  const { error: errIns } = await admin.from('hotmart_events').insert(fila);
  if (errIns && errIns.code !== '23505') throw new Error('No se pudo registrar el evento: ' + errIns.message);
  if (errIns?.code === '23505') {
    const { data: previo } = await admin.from('hotmart_events').select('processed, result').eq('event_id', d.eventId).single();
    if (previo?.processed) return { estado: 'duplicado', detalle: previo.result ?? '' };
  }
  if (d.ignorar) return { estado: 'ignorado', detalle: d.motivo };
  return aplicar(admin, d.eventId, body);
}

export async function aplicar(admin: SupabaseClient, eventId: string, body: Record<string, any>): Promise<Resultado> {
  const d = interpretar(body, configHotmart());
  if (d.ignorar) {
    await admin.from('hotmart_events').update({ processed: true, result: `ignorado: ${d.motivo}`, processed_at: new Date().toISOString() }).eq('event_id', eventId);
    return { estado: 'ignorado', detalle: d.motivo };
  }
  const { data, error } = await admin.rpc('aplicar_suscripcion', {
    p_subscription_key: d.subscriptionKey, p_buyer_email: d.email, p_product_id: d.productId, p_transaction_id: d.transactionId,
    p_plan: d.plan, p_status: d.status, p_access: d.access, p_period_end: d.periodEnd, p_event_at: d.eventAt,
    p_event_name: d.eventName, p_amount: d.amount, p_currency: d.currency, p_recurrence: d.recurrence, p_registrar_pago: d.registrarPago,
  });
  const { data: ev } = await admin.from('hotmart_events').select('attempts').eq('event_id', eventId).single();
  if (error) {
    await admin.from('hotmart_events').update({ attempts: (ev?.attempts ?? 0) + 1, last_error: error.message }).eq('event_id', eventId);
    throw new Error('No se pudo aplicar: ' + error.message);
  }
  await admin.from('hotmart_events').update({
    processed: true, result: String(data), attempts: (ev?.attempts ?? 0) + 1, last_error: null, processed_at: new Date().toISOString(),
  }).eq('event_id', eventId);
  return { estado: 'procesado', detalle: String(data) };
}
