// Interpretación de eventos del Webhook Hotmart v2.0.0 → estado de licencia + evento Hottok V7.
// Lógica pura (sin Deno ni red) para poder probarla en tests/index.html.

export const ESTADOS_CON_ACCESO = ['activa', 'prueba'];

const MAPA = {
  PURCHASE_APPROVED: 'activa',
  PURCHASE_COMPLETE: 'activa',
  PURCHASE_REFUNDED: 'reembolsada',
  PURCHASE_CHARGEBACK: 'bloqueada',
  PURCHASE_PROTEST: 'bloqueada',
  PURCHASE_CANCELED: 'pendiente',
  PURCHASE_DELAYED: 'pendiente',
  PURCHASE_BILLET_PRINTED: 'pendiente',
  PURCHASE_EXPIRED: 'pendiente',
  SUBSCRIPTION_CANCELLATION: 'cancelada',
};

// Comparación en tiempo constante del Hottok (evita ataques por tiempo).
export function compararHottok(recibido, esperado) {
  const a = String(recibido ?? ''), b = String(esperado ?? '');
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0 && b.length > 0;
}

const fecha = v => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(typeof v === 'number' || /^\d+$/.test(v) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function interpretarEvento(body, { productoId } = {}) {
  if (!body || typeof body !== 'object') return { ignorar: true, motivo: 'cuerpo vacío' };
  const evento = String(body.event || '');
  const data = body.data || {};
  const eventId = String(body.id || `${evento}:${data.purchase?.transaction || ''}:${body.creation_date || ''}`);
  const email = String(data.buyer?.email || data.subscriber?.email || '').trim().toLowerCase();
  const base = {
    eventId, evento, email,
    transaccion: data.purchase?.transaction ?? null,
    productoId: data.product?.id != null ? String(data.product.id) : null,
    fechaEvento: fecha(body.creation_date) ?? new Date().toISOString(),
  };

  if (body.version && body.version !== '2.0.0') return { ...base, ignorar: true, motivo: `versión ${body.version} no soportada` };
  if (!MAPA[evento]) return { ...base, ignorar: true, motivo: `evento ${evento || '(vacío)'} no usado` };
  if (!email) return { ...base, ignorar: true, motivo: 'sin email de comprador' };
  if (productoId && base.productoId && base.productoId !== String(productoId)) return { ...base, ignorar: true, motivo: 'otro producto' };

  let estado = MAPA[evento];
  let hottokEvento;
  let accesoHasta = null;
  const recurrencia = Number(data.purchase?.recurrence_number) || 0;
  const monto = Number(data.purchase?.price?.value ?? data.purchase?.full_price?.value);

  if (estado === 'activa') {
    if (monto === 0 && data.subscription) {        // periodo de prueba gratis de suscripción
      estado = 'prueba';
      hottokEvento = 'inicio_prueba';
      accesoHasta = fecha(data.purchase?.date_next_charge) ?? new Date(Date.now() + 7 * 864e5).toISOString();
    } else {
      hottokEvento = recurrencia > 1 ? 'renovacion' : 'activacion';
      accesoHasta = data.subscription ? fecha(data.purchase?.date_next_charge) : null; // pago único = sin vencimiento
    }
  } else if (estado === 'reembolsada' || estado === 'bloqueada') {
    hottokEvento = 'bloqueo_sesion';
  } else if (estado === 'cancelada') {
    hottokEvento = 'cancelacion';
    // Conserva el acceso hasta el final del periodo ya pagado, si Hotmart lo informa.
    accesoHasta = fecha(data.date_next_charge ?? data.subscription?.date_next_charge ?? data.cancellation_date) ?? new Date().toISOString();
    if (new Date(accesoHasta) > new Date()) estado = 'activa';
  } else {
    hottokEvento = 'pendiente';
  }

  return { ...base, ignorar: false, estado, hottokEvento, accesoHasta, recurrencia, monto: Number.isFinite(monto) ? monto : null, moneda: data.purchase?.price?.currency_value ?? null };
}

// Guarda solo lo necesario del payload (sin documento, teléfono ni dirección del comprador).
export function payloadMinimo(body) {
  const d = body?.data || {};
  return {
    id: body?.id, event: body?.event, version: body?.version, creation_date: body?.creation_date,
    product: d.product ? { id: d.product.id, name: d.product.name } : undefined,
    purchase: d.purchase ? { transaction: d.purchase.transaction, status: d.purchase.status, recurrence_number: d.purchase.recurrence_number, price: d.purchase.price, date_next_charge: d.purchase.date_next_charge } : undefined,
    subscription: d.subscription ? { status: d.subscription.status, plan: d.subscription.plan?.name } : undefined,
  };
}
