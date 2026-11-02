// Lógica pura de Armario Virtual Hombres. Sin DOM: se prueba en tests/index.html.

// ---------- País (Harvey adaptado: hemisferio, moneda, tallas; sin funil de mercados) ----------
export const PAISES = {
  MX: { nombre: 'México', hemisferio: 'N', tropical: false, moneda: 'MXN', tallas: 'MX' },
  US: { nombre: 'Estados Unidos', hemisferio: 'N', tropical: false, moneda: 'USD', tallas: 'US' },
  CO: { nombre: 'Colombia', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  VE: { nombre: 'Venezuela', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  EC: { nombre: 'Ecuador', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  PE: { nombre: 'Perú', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'US' },
  BO: { nombre: 'Bolivia', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'US' },
  CL: { nombre: 'Chile', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'EU' },
  AR: { nombre: 'Argentina', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'EU' },
  UY: { nombre: 'Uruguay', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'EU' },
  PY: { nombre: 'Paraguay', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'EU' },
  BR: { nombre: 'Brasil', hemisferio: 'S', tropical: false, moneda: 'USD', tallas: 'BR' },
  GT: { nombre: 'Guatemala', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  SV: { nombre: 'El Salvador', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  HN: { nombre: 'Honduras', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  NI: { nombre: 'Nicaragua', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  CR: { nombre: 'Costa Rica', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  PA: { nombre: 'Panamá', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  DO: { nombre: 'República Dominicana', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  PR: { nombre: 'Puerto Rico', hemisferio: 'N', tropical: true, moneda: 'USD', tallas: 'US' },
  ES: { nombre: 'España', hemisferio: 'N', tropical: false, moneda: 'USD', tallas: 'EU' },
};

const ZONAS = {
  'America/Bogota': 'CO', 'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'Pacific/Galapagos': 'EC',
  'America/Lima': 'PE', 'America/La_Paz': 'BO', 'America/Santiago': 'CL', 'America/Punta_Arenas': 'CL',
  'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/Guatemala': 'GT', 'America/El_Salvador': 'SV',
  'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA',
  'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
};
const ZONAS_MX = ['Mexico_City', 'Monterrey', 'Merida', 'Cancun', 'Chihuahua', 'Ciudad_Juarez', 'Hermosillo',
  'Mazatlan', 'Tijuana', 'Matamoros', 'Ojinaga', 'Bahia_Banderas'];
const ZONAS_BR = ['Sao_Paulo', 'Fortaleza', 'Recife', 'Bahia', 'Belem', 'Manaus', 'Cuiaba', 'Campo_Grande',
  'Porto_Velho', 'Boa_Vista', 'Rio_Branco', 'Maceio', 'Araguaina', 'Santarem', 'Noronha', 'Eirunepe'];

export function detectarPais({ timeZone = '', language = '' } = {}) {
  if (ZONAS[timeZone]) return ZONAS[timeZone];
  const ciudad = timeZone.split('/').pop();
  if (timeZone.startsWith('America/') && ZONAS_MX.includes(ciudad)) return 'MX';
  if (timeZone.startsWith('America/') && ZONAS_BR.includes(ciudad)) return 'BR';
  if (timeZone.startsWith('America/Argentina') || timeZone === 'America/Buenos_Aires') return 'AR';
  const region = (language.split('-')[1] || '').toUpperCase();
  if (PAISES[region]) return region;
  return language.toLowerCase().startsWith('pt') ? 'BR' : 'MX';
}

export function precioLocal(pais) {
  return PAISES[pais]?.moneda === 'MXN' ? '$397 MXN' : '$21 USD';
}

// ---------- Cuatro estaciones ----------
export const ESTACIONES = [
  { id: 'primavera', nombre: 'Primavera', icono: '🌱' },
  { id: 'verano', nombre: 'Verano', icono: '☀️' },
  { id: 'otono', nombre: 'Otoño', icono: '🍂' },
  { id: 'invierno', nombre: 'Invierno', icono: '❄️' },
];

// Estaciones meteorológicas: N → mar-may primavera; S invertido.
export function estacionActual(fecha = new Date(), hemisferio = 'N') {
  const m = fecha.getMonth(); // 0-11
  const norte = m >= 2 && m <= 4 ? 'primavera' : m >= 5 && m <= 7 ? 'verano' : m >= 8 && m <= 10 ? 'otono' : 'invierno';
  if (hemisferio !== 'S') return norte;
  return { primavera: 'otono', verano: 'invierno', otono: 'primavera', invierno: 'verano' }[norte];
}

export function prendasParaEstacion(prendas, estacion) {
  if (!estacion) return prendas;
  return prendas.filter(p => !p.estaciones?.length || p.estaciones.includes(estacion));
}

// ---------- Categorías y peso ----------
export const CATEGORIAS = [
  { id: 'camiseta', nombre: 'Camiseta', pesoG: 160, grupo: 'superior' },
  { id: 'camisa', nombre: 'Camisa', pesoG: 220, grupo: 'superior' },
  { id: 'polo', nombre: 'Polo', pesoG: 230, grupo: 'superior' },
  { id: 'sueter', nombre: 'Suéter', pesoG: 450, grupo: 'superior' },
  { id: 'sudadera', nombre: 'Sudadera', pesoG: 580, grupo: 'superior' },
  { id: 'chaqueta', nombre: 'Chaqueta', pesoG: 850, grupo: 'exterior' },
  { id: 'abrigo', nombre: 'Abrigo', pesoG: 1500, grupo: 'exterior' },
  { id: 'traje', nombre: 'Traje / saco', pesoG: 1200, grupo: 'traje' },
  { id: 'pantalon', nombre: 'Pantalón', pesoG: 480, grupo: 'inferior' },
  { id: 'jeans', nombre: 'Jeans', pesoG: 680, grupo: 'inferior' },
  { id: 'shorts', nombre: 'Shorts / bermuda', pesoG: 260, grupo: 'inferior' },
  { id: 'deportiva', nombre: 'Ropa deportiva', pesoG: 220, grupo: 'superior' },
  { id: 'ropa_interior', nombre: 'Ropa interior / calcetines', pesoG: 60, grupo: 'otro' },
  { id: 'calzado', nombre: 'Calzado (par)', pesoG: 950, grupo: 'calzado' },
  { id: 'accesorio', nombre: 'Accesorio', pesoG: 120, grupo: 'otro' },
  { id: 'otro', nombre: 'Otro', pesoG: 300, grupo: 'otro' },
];
export const CATEGORIA = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));

export function pesoEstimado(categoria) {
  return CATEGORIA[categoria]?.pesoG ?? 300;
}

export function pesoTotal(prendas) {
  return prendas.reduce((s, p) => s + (Number(p.pesoG) > 0 ? Number(p.pesoG) : pesoEstimado(p.categoria)), 0);
}

// ---------- Tallas ----------
const LETRAS = [['XS', 88], ['S', 96], ['M', 104], ['L', 112], ['XL', 120], ['XXL', 128], ['3XL', 136], ['4XL', 999]];
export const TALLAS_LETRA = LETRAS.map(l => l[0]);

export function tallaSuperiorPorPecho(pechoCm) {
  if (!(pechoCm > 0)) return null;
  return LETRAS.find(([, max]) => pechoCm < max)[0];
}

export function tallaCinturaPulgadas(cinturaCm) {
  if (!(cinturaCm > 0)) return null;
  const pulg = cinturaCm / 2.54;
  return Math.max(26, Math.ceil(pulg / 2) * 2); // tallas pares 28, 30, 32...
}

export function largoPulgadas(entrepiernaCm) {
  if (!(entrepiernaCm > 0)) return null;
  return Math.round(entrepiernaCm / 2.54);
}

export function tallaCuello(cuelloCm) {
  if (!(cuelloCm > 0)) return null;
  return Math.ceil((cuelloCm / 2.54) * 2) / 2; // 15, 15.5, 16...
}

export function tallaTraje(pechoCm) {
  if (!(pechoCm > 0)) return null;
  const us = Math.max(34, Math.round(pechoCm / 2.54 / 2) * 2);
  return { us, eu: us + 10 };
}

// Tabla aproximada de calzado de hombre (varía por marca). MX = largo de pie en cm.
export const CALZADO = [
  { mx: 24, us: 6, eu: 39, br: 37 }, { mx: 24.5, us: 6.5, eu: 39.5, br: 37.5 },
  { mx: 25, us: 7, eu: 40, br: 38 }, { mx: 25.5, us: 7.5, eu: 40.5, br: 38.5 },
  { mx: 26, us: 8, eu: 41, br: 39 }, { mx: 26.5, us: 8.5, eu: 41.5, br: 39.5 },
  { mx: 27, us: 9, eu: 42, br: 40 }, { mx: 27.5, us: 9.5, eu: 42.5, br: 40.5 },
  { mx: 28, us: 10, eu: 43, br: 41 }, { mx: 28.5, us: 10.5, eu: 44, br: 42 },
  { mx: 29, us: 11, eu: 44.5, br: 42.5 }, { mx: 29.5, us: 11.5, eu: 45, br: 43 },
  { mx: 30, us: 12, eu: 46, br: 44 }, { mx: 31, us: 13, eu: 47, br: 45 },
];

export function tallaCalzadoDesdePie(pieCm) {
  if (!(pieCm > 0)) return null;
  const objetivo = Math.ceil(pieCm * 2) / 2;
  return CALZADO.find(f => f.mx >= objetivo) ?? CALZADO[CALZADO.length - 1];
}

export function convertirCalzado(valor, desde) {
  const v = Number(valor);
  if (!CALZADO[0][desde] || !(v > 0)) return null;
  return CALZADO.reduce((mejor, f) => (Math.abs(f[desde] - v) < Math.abs(mejor[desde] - v) ? f : mejor));
}

export const RANGOS_MEDIDAS = {
  altura: [140, 220], peso: [40, 200], pecho: [70, 160], cintura: [55, 160], cadera: [70, 160],
  cuello: [30, 55], manga: [50, 75], entrepierna: [60, 100], pie: [22, 33],
};

export function validarMedidas(m = {}) {
  const errores = {};
  for (const [k, [min, max]] of Object.entries(RANGOS_MEDIDAS)) {
    if (m[k] === undefined || m[k] === null || m[k] === '') continue;
    const v = Number(m[k]);
    if (!Number.isFinite(v) || v < min || v > max) errores[k] = `Entre ${min} y ${max}`;
  }
  return errores;
}

export function recomendarTallas(m = {}) {
  const n = k => (Number(m[k]) > 0 ? Number(m[k]) : null);
  const cintura = tallaCinturaPulgadas(n('cintura'));
  const largo = largoPulgadas(n('entrepierna'));
  return {
    superior: tallaSuperiorPorPecho(n('pecho')),
    cuello: tallaCuello(n('cuello')),
    pantalon: cintura ? { cintura, largo, eu: cintura + 16 } : null,
    traje: tallaTraje(n('pecho')),
    calzado: tallaCalzadoDesdePie(n('pie')),
  };
}

// Compara la talla registrada de una prenda con la recomendada.
export function evaluarAjuste(prenda, medidas) {
  const rec = recomendarTallas(medidas);
  const talla = String(prenda?.talla ?? '').trim().toUpperCase();
  if (!talla) return null;
  const grupo = CATEGORIA[prenda.categoria]?.grupo;
  if ((grupo === 'superior' || grupo === 'exterior') && rec.superior && TALLAS_LETRA.includes(talla)) {
    const d = TALLAS_LETRA.indexOf(talla) - TALLAS_LETRA.indexOf(rec.superior);
    return d === 0 ? 'ok' : d > 0 ? 'grande' : 'chica';
  }
  if (grupo === 'inferior' && rec.pantalon) {
    const w = parseInt(talla.replace(/^W/, ''), 10);
    if (!w) return null;
    const cint = prenda.sistemaTalla === 'EU' ? w - 16 : w;
    const d = cint - rec.pantalon.cintura;
    return Math.abs(d) < 2 ? 'ok' : d > 0 ? 'grande' : 'chica';
  }
  return null;
}

// ---------- Costes de la ropa ----------
export function costoPorUso(precio, usos) {
  const p = Number(precio);
  if (!(p > 0)) return null;
  return Math.round((p / Math.max(1, Number(usos) || 0)) * 100) / 100;
}

// ---------- QR de caja de temporada (texto plano: lo lee cualquier cámara sin internet) ----------
export function textoQRCaja(caja, prendas, max = 600) {
  const cab = `ARMARIO VIRTUAL · ${caja.nombre}${caja.estacion ? ' (' + caja.estacion + ')' : ''}\n`;
  let cuerpo = '';
  let incluidas = 0;
  for (const p of prendas) {
    const linea = `- ${p.nombre || CATEGORIA[p.categoria]?.nombre || 'Prenda'}${p.talla ? ' ' + p.talla : ''}\n`;
    if ((cab + cuerpo + linea).length > max - 20) break;
    cuerpo += linea;
    incluidas++;
  }
  const resto = prendas.length - incluidas;
  return cab + cuerpo + (resto > 0 ? `+${resto} más` : `Total: ${prendas.length}`);
}

// ---------- Normalizar la salida de la IA ----------
const PATRONES = ['liso', 'rayas', 'cuadros', 'estampado', 'otro'];
const FORMALIDAD = ['casual', 'smart_casual', 'formal', 'deportivo'];

export function normalizarClasificacion(raw = {}) {
  const cat = CATEGORIA[raw.categoria] ? raw.categoria : 'otro';
  const est = Array.isArray(raw.estaciones) ? [...new Set(raw.estaciones.filter(e => ESTACIONES.some(x => x.id === e)))] : [];
  const hex = /^#[0-9a-f]{6}$/i.test(raw.color_hex || '') ? raw.color_hex.toLowerCase() : null;
  const peso = Math.round(Number(raw.peso_estimado_g));
  return {
    esPrenda: raw.es_prenda !== false,
    categoria: cat,
    nombre: String(raw.subtipo || CATEGORIA[cat].nombre).slice(0, 60),
    color: String(raw.color_principal || '').slice(0, 30),
    colorHex: hex,
    patron: PATRONES.includes(raw.patron) ? raw.patron : 'otro',
    material: String(raw.material_probable || '').slice(0, 40),
    formalidad: FORMALIDAD.includes(raw.formalidad) ? raw.formalidad : 'casual',
    estaciones: est,
    pesoG: peso > 0 && peso < 5000 ? peso : pesoEstimado(cat),
    talla: String(raw.talla_visible || '').slice(0, 10),
    marca: String(raw.marca_visible || '').slice(0, 40),
    bbox: raw.bbox && [raw.bbox.x, raw.bbox.y, raw.bbox.w, raw.bbox.h].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
      ? raw.bbox : null,
    confianza: Math.min(1, Math.max(0, Number(raw.confianza) || 0)),
  };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
