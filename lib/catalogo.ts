// Catálogo de Armario Virtual Hombres: 5 categorías, tipos, estaciones y colores.

export const CATEGORIAS = [
  { id: 'ropa', nombre: 'Ropa' },
  { id: 'lentes', nombre: 'Lentes' },
  { id: 'pulseras', nombre: 'Pulseras' },
  { id: 'cadenas', nombre: 'Cadenas' },
  { id: 'relojes', nombre: 'Relojes' },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]['id'];

export const TIPOS = [
  { id: 'camisa', nombre: 'Camisa', categoria: 'ropa', campoTalla: 'shirt_size' },
  { id: 'polo', nombre: 'Polo', categoria: 'ropa', campoTalla: 'polo_size' },
  { id: 'polera', nombre: 'Polera / camiseta', categoria: 'ropa', campoTalla: 'polo_size' },
  { id: 'pantalon', nombre: 'Pantalón', categoria: 'ropa', campoTalla: 'trouser_size' },
  { id: 'jeans', nombre: 'Jeans', categoria: 'ropa', campoTalla: 'jeans_size' },
  { id: 'shorts', nombre: 'Shorts', categoria: 'ropa', campoTalla: 'shorts_size' },
  { id: 'traje', nombre: 'Traje', categoria: 'ropa', campoTalla: 'suit_size' },
  { id: 'saco', nombre: 'Saco / blazer', categoria: 'ropa', campoTalla: 'blazer_size' },
  { id: 'chaqueta', nombre: 'Chaqueta', categoria: 'ropa', campoTalla: 'jacket_size' },
  { id: 'abrigo', nombre: 'Abrigo', categoria: 'ropa', campoTalla: 'jacket_size' },
  { id: 'ropa_deportiva', nombre: 'Ropa deportiva', categoria: 'ropa', campoTalla: 'sportswear_size' },
  { id: 'ropa_casual', nombre: 'Ropa casual', categoria: 'ropa', campoTalla: null },
  { id: 'lentes', nombre: 'Lentes', categoria: 'lentes', campoTalla: null },
  { id: 'pulsera', nombre: 'Pulsera', categoria: 'pulseras', campoTalla: null },
  { id: 'cadena', nombre: 'Cadena', categoria: 'cadenas', campoTalla: null },
  { id: 'reloj', nombre: 'Reloj', categoria: 'relojes', campoTalla: null },
] as const;
export type TipoId = (typeof TIPOS)[number]['id'];
export const TIPO = Object.fromEntries(TIPOS.map(t => [t.id, t])) as Record<TipoId, (typeof TIPOS)[number]>;

export function categoriaDeTipo(tipo: string): Categoria | null {
  return (TIPO as Record<string, { categoria: Categoria }>)[tipo]?.categoria ?? null;
}

export const ESTACIONES = [
  { id: 'verano', nombre: 'Verano', icono: '☀️' },
  { id: 'otono', nombre: 'Otoño', icono: '🍂' },
  { id: 'invierno', nombre: 'Invierno', icono: '❄️' },
  { id: 'primavera', nombre: 'Primavera', icono: '🌱' },
] as const;
export type Estacion = (typeof ESTACIONES)[number]['id'];
export const esEstacion = (s: unknown): s is Estacion => ESTACIONES.some(e => e.id === s);

export const TALLAS_LETRA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;

// Paleta para filtrar por color (nombres en español).
export const COLORES = [
  { id: 'negro', nombre: 'Negro', hex: '#1a1a1a' },
  { id: 'gris', nombre: 'Gris', hex: '#8a8a8a' },
  { id: 'blanco', nombre: 'Blanco', hex: '#f4f4f2' },
  { id: 'beige', nombre: 'Beige', hex: '#d8c6a5' },
  { id: 'cafe', nombre: 'Café', hex: '#6b4a2f' },
  { id: 'azul_marino', nombre: 'Azul marino', hex: '#1f2f4f' },
  { id: 'azul', nombre: 'Azul', hex: '#3a6fc4' },
  { id: 'celeste', nombre: 'Celeste', hex: '#9cc3e6' },
  { id: 'verde', nombre: 'Verde', hex: '#3f7a4a' },
  { id: 'oliva', nombre: 'Oliva', hex: '#6b6b3a' },
  { id: 'rojo', nombre: 'Rojo', hex: '#b3261e' },
  { id: 'vino', nombre: 'Vino', hex: '#6a1f2b' },
  { id: 'rosa', nombre: 'Rosa', hex: '#e3a1b5' },
  { id: 'naranja', nombre: 'Naranja', hex: '#e07b28' },
  { id: 'amarillo', nombre: 'Amarillo', hex: '#e6c440' },
  { id: 'morado', nombre: 'Morado', hex: '#6b4a9a' },
  { id: 'dorado', nombre: 'Dorado', hex: '#c9a54a' },
  { id: 'plateado', nombre: 'Plateado', hex: '#c0c4c8' },
] as const;
export type ColorId = (typeof COLORES)[number]['id'];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Distancia perceptual simple ("redmean"): suficiente para nombrar un color dominante.
export function colorMasCercano(hex: string): ColorId {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'gris';
  const [r1, g1, b1] = rgb(hex.toLowerCase());
  let mejor: ColorId = 'gris', min = Infinity;
  for (const c of COLORES) {
    const [r2, g2, b2] = rgb(c.hex);
    const rm = (r1 + r2) / 2;
    const d = (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2;
    if (d < min) { min = d; mejor = c.id; }
  }
  return mejor;
}

export const nombreColor = (id: string) => COLORES.find(c => c.id === id)?.nombre ?? id;
