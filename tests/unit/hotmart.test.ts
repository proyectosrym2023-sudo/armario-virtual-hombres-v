import { describe, expect, it } from 'vitest';
import { compararHottok, detectarPlan, interpretar, payloadMinimo, type DecisionHotmart } from '@/lib/hotmart';

const CFG = { productId: '7777777', planMensual: 'Plan Mensual AVH', planAnual: 'Plan Anual AVH' };
const AHORA = new Date('2026-11-01T12:00:00Z');
const MS = (iso: string) => new Date(iso).getTime();

function evento(event: string, over: { purchase?: object; data?: object; product?: string; version?: string } = {}) {
  return {
    id: `evt-${event}-${Math.random().toString(36).slice(2)}`,
    event, version: over.version ?? '2.0.0', creation_date: MS('2026-11-01T10:00:00Z'),
    data: {
      product: { id: Number(over.product ?? '7777777'), name: 'Armario Virtual Hombres' },
      buyer: { email: ' Juan.Perez@Correo.com ', name: 'Juan', document: '12345678', phone: '555', address: { city: 'CDMX' } },
      purchase: {
        transaction: 'HP-1', status: 'APPROVED', recurrence_number: 1,
        approved_date: MS('2026-11-01T10:00:00Z'), date_next_charge: MS('2026-12-01T10:00:00Z'),
        price: { value: 149, currency_value: 'MXN' }, offer: { code: 'abc' }, ...over.purchase,
      },
      subscription: { status: 'ACTIVE', plan: { name: 'Plan Mensual AVH' }, subscriber: { code: 'SUB-1' } },
      ...over.data,
    },
  };
}
const ok = (r: ReturnType<typeof interpretar>) => { expect(r.ignorar).toBe(false); return r as DecisionHotmart; };

describe('Hottok', () => {
  it('acepta solo el valor exacto', () => {
    expect(compararHottok('secreto', 'secreto')).toBe(true);
    expect(compararHottok('secretO', 'secreto')).toBe(false);
    expect(compararHottok('secreto1', 'secreto')).toBe(false);
    expect(compararHottok(null, 'secreto')).toBe(false);
    expect(compararHottok('', '')).toBe(false); // sin secreto configurado nunca valida
  });
});

describe('interpretar eventos de suscripción', () => {
  it('compra mensual aprobada → active, acceso hasta el próximo cobro, registra pago', () => {
    const d = ok(interpretar(evento('PURCHASE_APPROVED'), CFG, AHORA));
    expect(d).toMatchObject({ status: 'active', access: true, plan: 'mensual', email: 'juan.perez@correo.com', subscriptionKey: 'SUB-1', registrarPago: true, transactionId: 'HP-1' });
    expect(d.periodEnd).toBe('2026-12-01T10:00:00.000Z');
  });
  it('compra anual aprobada → plan anual', () => {
    const d = ok(interpretar(evento('PURCHASE_APPROVED', { data: { subscription: { plan: { name: 'Plan Anual AVH' }, subscriber: { code: 'SUB-2' } } }, purchase: { date_next_charge: MS('2027-11-01T10:00:00Z') } }), CFG, AHORA));
    expect(d.plan).toBe('anual');
    expect(d.periodEnd).toBe('2027-11-01T10:00:00.000Z');
  });
  it('sin date_next_charge calcula el periodo según el plan', () => {
    const d = ok(interpretar(evento('PURCHASE_APPROVED', { purchase: { date_next_charge: undefined }, data: { subscription: { plan: { name: 'Plan Anual AVH' }, subscriber: { code: 'S' } } } }), CFG, AHORA));
    expect(d.periodEnd).toBe('2027-11-01T10:00:00.000Z');
  });
  it('renovación (recurrencia 2) → mismo suscriptor, nueva transacción', () => {
    const d = ok(interpretar(evento('PURCHASE_APPROVED', { purchase: { transaction: 'HP-2', recurrence_number: 2, date_next_charge: MS('2027-01-01T10:00:00Z') } }), CFG, AHORA));
    expect([d.subscriptionKey, d.transactionId, d.recurrence, d.registrarPago]).toEqual(['SUB-1', 'HP-2', 2, true]);
  });
  it('pago atrasado → past_due sin acortar ni extender el periodo', () => {
    const d = ok(interpretar(evento('PURCHASE_DELAYED'), CFG, AHORA));
    expect([d.status, d.access, d.periodEnd, d.registrarPago]).toEqual(['past_due', true, null, false]);
  });
  it('cancelación conserva el periodo pagado (date_next_charge)', () => {
    const body = { id: 'c1', event: 'SUBSCRIPTION_CANCELLATION', version: '2.0.0', creation_date: MS('2026-11-10T00:00:00Z'),
      data: { product: { id: 7777777 }, subscriber: { code: 'SUB-1', email: 'JUAN.PEREZ@correo.com' }, subscription: { plan: { name: 'Plan Mensual AVH' } }, date_next_charge: MS('2026-12-01T10:00:00Z') } };
    const d = ok(interpretar(body, CFG, AHORA));
    expect([d.status, d.access, d.periodEnd, d.email, d.subscriptionKey]).toEqual(['canceled', true, '2026-12-01T10:00:00.000Z', 'juan.perez@correo.com', 'SUB-1']);
  });
  it('reembolso corta el acceso de inmediato', () => {
    const d = ok(interpretar(evento('PURCHASE_REFUNDED'), CFG, AHORA));
    expect([d.status, d.access, d.periodEnd]).toEqual(['refunded', false, AHORA.toISOString()]);
  });
  it('contracargo y protesto → chargeback sin acceso', () => {
    for (const e of ['PURCHASE_CHARGEBACK', 'PURCHASE_PROTEST']) {
      const d = ok(interpretar(evento(e), CFG, AHORA));
      expect([d.status, d.access]).toEqual(['chargeback', false]);
    }
  });
  it('compra cancelada o expirada → expired sin acceso', () => {
    for (const e of ['PURCHASE_CANCELED', 'PURCHASE_EXPIRED']) expect(ok(interpretar(evento(e), CFG, AHORA)).access).toBe(false);
  });
});

describe('validaciones que ignoran eventos', () => {
  it('otro producto no habilita Armario Virtual Hombres', () => {
    expect(interpretar(evento('PURCHASE_APPROVED', { product: '1111111' }), CFG, AHORA)).toMatchObject({ ignorar: true, motivo: expect.stringContaining('producto') });
  });
  it('versión distinta de 2.0.0', () => expect(interpretar(evento('PURCHASE_APPROVED', { version: '1.0.0' }), CFG, AHORA).ignorar).toBe(true));
  it('evento no usado', () => expect(interpretar(evento('CLUB_FIRST_ACCESS'), CFG, AHORA).ignorar).toBe(true));
  it('sin email válido', () => expect(interpretar(evento('PURCHASE_APPROVED', { data: { buyer: { email: 'no-es-email' } } }), CFG, AHORA).ignorar).toBe(true));
  it('sin HOTMART_PRODUCT_ID configurado lanza error (no aprueba nada por omisión)', () => {
    expect(() => interpretar(evento('PURCHASE_APPROVED'), { productId: '' }, AHORA)).toThrow();
  });
});

describe('plan y payload', () => {
  it('detecta plan por nombre configurado o por palabra', () => {
    expect(detectarPlan({ subscription: { plan: { name: 'Mensual' } } }, { productId: '1' })).toBe('mensual');
    expect(detectarPlan({ subscription: { plan: { name: 'Yearly' } } }, { productId: '1' })).toBe('anual');
    expect(detectarPlan({}, { productId: '1' })).toBe('desconocido');
  });
  it('payload mínimo no guarda documento, teléfono, dirección ni nombre', () => {
    const p = JSON.stringify(payloadMinimo(evento('PURCHASE_APPROVED')));
    for (const s of ['12345678', '"555"', 'CDMX', 'Juan"', 'document', 'address', 'phone']) expect(p).not.toContain(s);
    expect(p).toContain('juan.perez@correo.com');
  });
  it('el payload mínimo se puede reprocesar y da la misma decisión', () => {
    for (const e of ['PURCHASE_APPROVED', 'PURCHASE_REFUNDED', 'PURCHASE_DELAYED']) {
      const original = evento(e);
      expect(interpretar(payloadMinimo(original), CFG, AHORA)).toEqual(interpretar(original, CFG, AHORA));
    }
    const cancel = { id: 'c2', event: 'SUBSCRIPTION_CANCELLATION', version: '2.0.0', creation_date: 1,
      data: { product: { id: 7777777 }, subscriber: { code: 'S', email: 'a@b.co', name: 'X' }, date_next_charge: 2 } };
    expect(interpretar(payloadMinimo(cancel), CFG, AHORA)).toEqual(interpretar(cancel, CFG, AHORA));
  });
});
