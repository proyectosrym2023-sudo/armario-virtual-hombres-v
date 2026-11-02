// Unidades y validación de datos personales. El usuario escribe sus datos: aquí no se infiere nada.

export type UnidadPeso = 'kg' | 'lb';
export type UnidadLongitud = 'cm' | 'in';

const LB_POR_KG = 2.2046226218;

export const kgALb = (kg: number) => Math.round(kg * LB_POR_KG * 10) / 10;
export const lbAKg = (lb: number) => Math.round((lb / LB_POR_KG) * 10) / 10;
export const cmAIn = (cm: number) => Math.round((cm / 2.54) * 10) / 10;
export const inACm = (inch: number) => Math.round(inch * 2.54 * 10) / 10;

export function convertirPeso(valor: number, de: UnidadPeso, a: UnidadPeso) {
  return de === a ? valor : a === 'lb' ? kgALb(valor) : lbAKg(valor);
}

export function validarPeso(valor: unknown, unidad: UnidadPeso): string | null {
  const v = Number(valor);
  if (!Number.isFinite(v)) return 'Escribe un número';
  const kg = unidad === 'lb' ? v / LB_POR_KG : v;
  if (kg < 30 || kg > 300) return unidad === 'kg' ? 'Entre 30 y 300 kg' : 'Entre 66 y 661 lb';
  return null;
}

// Rangos en cm de medidas corporales de un hombre adulto (para detectar errores de tipeo, no para juzgar).
export const MEDIDAS_CORPORALES = {
  chest: { nombre: 'Pecho', min: 60, max: 180 },
  waist: { nombre: 'Cintura', min: 50, max: 180 },
  hip: { nombre: 'Cadera', min: 60, max: 180 },
  inseam: { nombre: 'Largo de pierna', min: 50, max: 110 },
  sleeve: { nombre: 'Largo de manga', min: 40, max: 95 },
  neck: { nombre: 'Cuello', min: 28, max: 60 },
} as const;

// Accesorios: dimensiones físicas, NO tallas de ropa.
export const MEDIDAS_ACCESORIOS = {
  wrist: { nombre: 'Circunferencia de muñeca', unidad: 'cm', min: 12, max: 28 },
  chain_length: { nombre: 'Largo de cadena', unidad: 'cm', min: 30, max: 90 },
  glasses_lens: { nombre: 'Lentes: ancho de lente', unidad: 'mm', min: 40, max: 65 },
  glasses_bridge: { nombre: 'Lentes: puente', unidad: 'mm', min: 12, max: 26 },
  glasses_temple: { nombre: 'Lentes: varilla', unidad: 'mm', min: 120, max: 160 },
} as const;

export type ClaveMedida = keyof typeof MEDIDAS_CORPORALES;

export function validarMedida(clave: ClaveMedida, valor: unknown, unidad: UnidadLongitud): string | null {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Escribe un número';
  const cm = unidad === 'in' ? v * 2.54 : v;
  const r = MEDIDAS_CORPORALES[clave];
  if (cm < r.min || cm > r.max) {
    return unidad === 'cm' ? `Entre ${r.min} y ${r.max} cm` : `Entre ${cmAIn(r.min)} y ${cmAIn(r.max)} in`;
  }
  return null;
}

export function validarAccesorio(clave: keyof typeof MEDIDAS_ACCESORIOS, valor: unknown, unidad: 'cm' | 'in' | 'mm'): string | null {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Escribe un número';
  const r = MEDIDAS_ACCESORIOS[clave];
  const enBase = r.unidad === 'mm' ? (unidad === 'in' ? v * 25.4 : unidad === 'cm' ? v * 10 : v) : (unidad === 'in' ? v * 2.54 : unidad === 'mm' ? v / 10 : v);
  return enBase < r.min || enBase > r.max ? `Entre ${r.min} y ${r.max} ${r.unidad}` : null;
}

// Talla de ropa: texto corto que escribe el usuario (letra o número). No se valida contra marcas.
export function normalizarTalla(t: unknown): string | null {
  const s = String(t ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s.length > 12 || !/^[0-9A-Z./\- ]+$/.test(s)) throw new Error('Talla no válida (máx. 12 caracteres: letras, números, / . -)');
  return s;
}
