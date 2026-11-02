import { describe, expect, it } from 'vitest';
import { CATEGORIAS, TIPOS, categoriaDeTipo, colorMasCercano, esEstacion } from '@/lib/catalogo';
import { convertirPeso, kgALb, lbAKg, normalizarTalla, validarAccesorio, validarMedida, validarPeso } from '@/lib/unidades';

describe('catálogo', () => {
  it('tiene exactamente 5 categorías y 16 tipos', () => {
    expect(CATEGORIAS.map(c => c.id)).toEqual(['ropa', 'lentes', 'pulseras', 'cadenas', 'relojes']);
    expect(TIPOS).toHaveLength(16);
  });
  it('los 12 tipos de ropa obligatorios existen', () => {
    const ropa = TIPOS.filter(t => t.categoria === 'ropa').map(t => t.id).sort();
    expect(ropa).toEqual(['abrigo', 'camisa', 'chaqueta', 'jeans', 'pantalon', 'polera', 'polo', 'ropa_casual', 'ropa_deportiva', 'saco', 'shorts', 'traje']);
  });
  it('tipo → categoría', () => {
    expect(categoriaDeTipo('reloj')).toBe('relojes');
    expect(categoriaDeTipo('jeans')).toBe('ropa');
    expect(categoriaDeTipo('falda')).toBeNull();
  });
  it('estaciones válidas', () => {
    expect(['verano', 'otono', 'invierno', 'primavera'].every(esEstacion)).toBe(true);
    expect(esEstacion('otoño')).toBe(false);
  });
  it('nombra colores dominantes', () => {
    expect(colorMasCercano('#1f2f4f')).toBe('azul_marino');
    expect(colorMasCercano('#202020')).toBe('negro');
    expect(colorMasCercano('#fafafa')).toBe('blanco');
    expect(colorMasCercano('#c9a54a')).toBe('dorado');
    expect(colorMasCercano('basura')).toBe('gris');
  });
});

describe('peso (lo escribe el usuario)', () => {
  it('convierte kg ↔ lb', () => {
    expect(kgALb(78)).toBe(172);
    expect(lbAKg(172)).toBe(78);
    expect(convertirPeso(78, 'kg', 'kg')).toBe(78);
  });
  it('valida rangos en ambas unidades', () => {
    expect(validarPeso(78, 'kg')).toBeNull();
    expect(validarPeso(172, 'lb')).toBeNull();
    expect(validarPeso(5, 'kg')).not.toBeNull();
    expect(validarPeso('abc', 'kg')).not.toBeNull();
  });
});

describe('medidas y tallas', () => {
  it('medidas corporales en cm o pulgadas', () => {
    expect(validarMedida('waist', 82, 'cm')).toBeNull();
    expect(validarMedida('waist', 32, 'in')).toBeNull();
    expect(validarMedida('neck', 200, 'cm')).not.toBeNull();
  });
  it('accesorios usan dimensiones físicas, no tallas de ropa', () => {
    expect(validarAccesorio('wrist', 17, 'cm')).toBeNull();
    expect(validarAccesorio('glasses_lens', 52, 'mm')).toBeNull();
    expect(validarAccesorio('chain_length', 20, 'in')).toBeNull();   // 50.8 cm
    expect(validarAccesorio('glasses_lens', 52, 'cm')).not.toBeNull(); // 520 mm: error de unidad
  });
  it('talla: texto corto libre (letra o número), sin asumir equivalencias entre marcas', () => {
    expect(normalizarTalla(' l ')).toBe('L');
    expect(normalizarTalla('32/32')).toBe('32/32');
    expect(normalizarTalla('')).toBeNull();
    expect(() => normalizarTalla('<script>')).toThrow();
  });
});
