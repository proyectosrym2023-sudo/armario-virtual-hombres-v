// Webhook Hotmart v2.0.0 → decisión de suscripción. Lógica pura: sin red ni base de datos (probada con Vitest).

export type EstadoSuscripcion = 'pending' | 'active' | 'past_due' | 'canceled' | 'refunded' | 'chargeback' | 'expired';
export type Plan = 'mensual' | 'anual' | 'desconocido';

export interface ConfigHotmart {
  productId: string;
  planMensual?: string; // nombre de plan u oferta de Hotmart (opcional)
  planAnual?: string;
}

export interface DecisionHotmart {
  ignorar: false;
  eventId: string;
  eventName: string;
  eventAt: string;
  email: string;
  productId: string;
  transactionId: string;
  subscriptionKey: string;
  plan: Plan;
  status: EstadoSuscripcion;
  access: boolean;
  periodEnd: string | null;
  registrarPago: boolean;
  amount: number | null;
  currency: string | null;
  recurrence: number | null;
}
export interface Ignorado { ignorar: true; motivo: string; eventId: string; eventName: string; transactionId: string | null }

type Json = Record<string, any>;

const EVENTOS: Record<string, { status: EstadoSuscripcion; access: boolean; pago: boolean }> = {
  PURCHASE_APPROVED: { status: 'active', access: true, pago: true },
  PURCHASE_COMPLETE: { status: 'active', access: true, pago: true },
  PURCHASE_DELAYED: { status: 'past_due', access: true, pago: false },
  SUBSCRIPTION_CANCELLATION: { status: 'canceled', access: true, pago: false },
  PURCHASE_REFUNDED: { status: 'refunded', access: false, pago: false },
  PURCHASE_CHARGEBACK: { status: 'chargeback', access: false, pago: false },
  PURCHASE_PROTEST: { status: 'chargeback', access: false, pago: false },
  PURCHASE_CANCELED: { status: 'expired', access: false, pago: false },
  PURCHASE_EXPIRED: { status: 'expired', access: false, pago: false },
};

export function compararHottok(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = String(recibido ?? ''), b = String(esperado ?? '');
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0 && b.length > 0;
}

export function aFecha(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)) ? Number(v) : NaN;
  const d = new Date(Number.isNaN(n) ? String(v) : n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function detectarPlan(data: Json, cfg: ConfigHotmart): Plan {
  const nombres = [data.subscription?.plan?.name, data.subscription?.plan?.id, data.purchase?.offer?.code, data.plan?.name]
    .filter(Boolean).map((s: unknown) => String(s).toLowerCase());
  const coincide = (ref?: string) => !!ref && nombres.some(n => n === ref.toLowerCase());
  if (coincide(cfg.planAnual)) return 'anual';
  if (coincide(cfg.planMensual)) return 'mensual';
  if (nombres.some(n => /anual|annual|yearly|12 ?mes/.test(n))) return 'anual';
  if (nombres.some(n => /mensual|monthly|mes\b/.test(n))) return 'mensual';
  return 'desconocido';
}

function sumarPeriodo(desde: string, plan: Plan): string {
  const d = new Date(desde);
  if (plan === 'anual') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1); // mensual o desconocido: lo más conservador
  return d.toISOString();
}

export function interpretar(body: Json, cfg: ConfigHotmart, ahora = new Date()): DecisionHotmart | Ignorado {
  const eventName = String(body?.event ?? '');
  const data: Json = body?.data ?? {};
  const transactionId: string | null = data.purchase?.transaction ?? null;
  const eventId = String(body?.id ?? `${eventName}:${transactionId ?? ''}:${body?.creation_date ?? ''}`);
  const ign = (motivo: string): Ignorado => ({ ignorar: true, motivo, eventId, eventName, transactionId });

  if (!cfg.productId) throw new Error('HOTMART_PRODUCT_ID no configurado');
  if (body?.version !== '2.0.0') return ign(`versión ${body?.version ?? '(sin versión)'} no soportada`);
  const regla = EVENTOS[eventName];
  if (!regla) return ign(`evento ${eventName || '(vacío)'} no usado`);

  const productId = data.product?.id != null ? String(data.product.id) : '';
  if (productId !== String(cfg.productId)) return ign('producto distinto de Armario Virtual Hombres');

  const email = String(data.buyer?.email ?? data.subscriber?.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ign('comprador sin email válido');

  const subscriber = data.subscription?.subscriber?.code ?? data.subscriber?.code ?? null;
  const subscriptionKey = String(subscriber ?? transactionId ?? '');
  if (!subscriptionKey) return ign('sin código de suscriptor ni transacción');
  if (regla.pago && !transactionId) return ign('pago sin transacción');

  const eventAt = aFecha(body.creation_date) ?? ahora.toISOString();
  const plan = detectarPlan(data, cfg);
  const recurrence = Number(data.purchase?.recurrence_number) || null;
  const amountRaw = Number(data.purchase?.price?.value);
  const proximoCobro = aFecha(data.purchase?.date_next_charge ?? data.date_next_charge ?? data.subscription?.date_next_charge);

  let periodEnd: string | null = null;
  if (regla.status === 'active') {
    periodEnd = proximoCobro ?? sumarPeriodo(aFecha(data.purchase?.approved_date) ?? eventAt, plan);
  } else if (regla.status === 'canceled') {
    periodEnd = proximoCobro; // se respeta el periodo pagado; null = conserva el actual
  } else if (regla.status === 'refunded' || regla.status === 'chargeback') {
    periodEnd = ahora.toISOString(); // corta de inmediato
  }

  return {
    ignorar: false, eventId, eventName, eventAt, email, productId,
    transactionId: transactionId ?? subscriptionKey,
    subscriptionKey, plan,
    status: regla.status,
    access: regla.access,
    periodEnd,
    registrarPago: regla.pago,
    amount: Number.isFinite(amountRaw) ? amountRaw : null,
    currency: data.purchase?.price?.currency_value ?? null,
    recurrence,
  };
}

// Solo lo necesario, con la MISMA estructura de Hotmart (para poder reprocesarlo):
// sin documento, teléfono, dirección ni nombre del comprador.
export function payloadMinimo(body: Json) {
  const d: Json = body?.data ?? {};
  const limpio = (o: Json) => JSON.parse(JSON.stringify(o)); // quita undefined
  return limpio({
    id: body?.id, event: body?.event, version: body?.version, creation_date: body?.creation_date,
    data: {
      product: d.product ? { id: d.product.id } : undefined,
      buyer: d.buyer?.email ? { email: String(d.buyer.email).toLowerCase() } : undefined,
      subscriber: d.subscriber ? { code: d.subscriber.code, email: d.subscriber.email ? String(d.subscriber.email).toLowerCase() : undefined } : undefined,
      purchase: d.purchase ? {
        transaction: d.purchase.transaction, status: d.purchase.status, recurrence_number: d.purchase.recurrence_number,
        price: d.purchase.price, date_next_charge: d.purchase.date_next_charge, approved_date: d.purchase.approved_date,
        offer: d.purchase.offer ? { code: d.purchase.offer.code } : undefined,
      } : undefined,
      subscription: d.subscription ? {
        status: d.subscription.status, date_next_charge: d.subscription.date_next_charge,
        plan: d.subscription.plan ? { name: d.subscription.plan.name, id: d.subscription.plan.id } : undefined,
        subscriber: d.subscription.subscriber ? { code: d.subscription.subscriber.code } : undefined,
      } : undefined,
      date_next_charge: d.date_next_charge,
    },
  });
}
