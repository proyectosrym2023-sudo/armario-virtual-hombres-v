import * as C from '../public/js/core.js';
import * as IMG from '../public/js/imagen.js';
import { compararHottok, interpretarEvento, payloadMinimo } from '../supabase/functions/_shared/hotmart.js';
import { costoUSD, revisarCuota, tokensImagen } from '../supabase/functions/_shared/costes.js';

const resultados = [];
function prueba(nombre, fn) {
  try { fn(); resultados.push({ nombre, ok: true }); }
  catch (e) { resultados.push({ nombre, ok: false, error: e.message }); }
}
function igual(a, b, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} esperado ${B}, obtenido ${A}`);
}
const cierto = (v, msg) => { if (!v) throw new Error(msg || 'esperado verdadero'); };

// ---------- País / Harvey adaptado ----------
prueba('detecta México por zona horaria', () => igual(C.detectarPais({ timeZone: 'America/Mexico_City' }), 'MX'));
prueba('detecta Monterrey y Tijuana como MX', () => { igual(C.detectarPais({ timeZone: 'America/Monterrey' }), 'MX'); igual(C.detectarPais({ timeZone: 'America/Tijuana' }), 'MX'); });
prueba('detecta Argentina, Chile, Perú, Brasil', () => {
  igual(C.detectarPais({ timeZone: 'America/Argentina/Buenos_Aires' }), 'AR');
  igual(C.detectarPais({ timeZone: 'America/Santiago' }), 'CL');
  igual(C.detectarPais({ timeZone: 'America/Lima' }), 'PE');
  igual(C.detectarPais({ timeZone: 'America/Sao_Paulo' }), 'BR');
});
prueba('cae al idioma si la zona es desconocida', () => igual(C.detectarPais({ timeZone: 'UTC', language: 'es-CO' }), 'CO'));
prueba('precio local MXN vs USD', () => { igual(C.precioLocal('MX'), '$397 MXN'); igual(C.precioLocal('AR'), '$21 USD'); });

// ---------- Estaciones ----------
prueba('noviembre es otoño en el norte', () => igual(C.estacionActual(new Date(2026, 10, 1), 'N'), 'otono'));
prueba('noviembre es primavera en el sur', () => igual(C.estacionActual(new Date(2026, 10, 1), 'S'), 'primavera'));
prueba('enero: invierno N / verano S', () => { igual(C.estacionActual(new Date(2026, 0, 15), 'N'), 'invierno'); igual(C.estacionActual(new Date(2026, 0, 15), 'S'), 'verano'); });
prueba('filtro de estación incluye prendas "todo el año"', () => {
  const r = C.prendasParaEstacion([{ id: 1, estaciones: ['verano'] }, { id: 2, estaciones: [] }, { id: 3, estaciones: ['invierno'] }], 'verano');
  igual(r.map(p => p.id), [1, 2]);
});

// ---------- Peso ----------
prueba('peso estimado por categoría', () => { igual(C.pesoEstimado('jeans'), 680); igual(C.pesoEstimado('xyz'), 300); });
prueba('peso total usa el real o el estimado', () => igual(C.pesoTotal([{ categoria: 'jeans', pesoG: 700 }, { categoria: 'camiseta' }]), 860));

// ---------- Tallas ----------
prueba('talla superior por pecho', () => { igual(C.tallaSuperiorPorPecho(100), 'M'); igual(C.tallaSuperiorPorPecho(95), 'S'); igual(C.tallaSuperiorPorPecho(115), 'XL'); });
prueba('cintura 84 cm → W34, 81 cm → W32', () => { igual(C.tallaCinturaPulgadas(84), 34); igual(C.tallaCinturaPulgadas(81), 32); });
prueba('cuello 39 cm → 15.5"', () => igual(C.tallaCuello(39), 15.5));
prueba('traje pecho 100 → US 40 / EU 50', () => igual(C.tallaTraje(100), { us: 40, eu: 50 }));
prueba('pie 26.3 cm → MX 26.5 / US 8.5', () => { const t = C.tallaCalzadoDesdePie(26.3); igual([t.mx, t.us], [26.5, 8.5]); });
prueba('convertir calzado US 10 → MX 28 / EU 43', () => { const t = C.convertirCalzado(10, 'us'); igual([t.mx, t.eu], [28, 43]); });
prueba('validar medidas marca fuera de rango', () => { const e = C.validarMedidas({ pecho: 20, cintura: 84 }); cierto(e.pecho && !e.cintura); });
prueba('ajuste de camisa L con pecho 100 = grande', () => igual(C.evaluarAjuste({ categoria: 'camisa', talla: 'L' }, { pecho: 100 }), 'grande'));
prueba('ajuste de jeans W32 con cintura 81 = ok', () => igual(C.evaluarAjuste({ categoria: 'jeans', talla: '32' }, { cintura: 81 }), 'ok'));
prueba('ajuste de pantalón EU 48 con cintura 81 = ok', () => igual(C.evaluarAjuste({ categoria: 'pantalon', talla: '48', sistemaTalla: 'EU' }, { cintura: 81 }), 'ok'));
prueba('sin medidas no hay veredicto', () => igual(C.evaluarAjuste({ categoria: 'camisa', talla: 'M' }, {}), null));

// ---------- Costes de ropa ----------
prueba('costo por uso', () => { igual(C.costoPorUso(600, 12), 50); igual(C.costoPorUso(600, 0), 600); igual(C.costoPorUso(null, 3), null); });

// ---------- QR ----------
prueba('texto QR de caja respeta el límite', () => {
  const prendas = Array.from({ length: 80 }, (_, i) => ({ nombre: 'Suéter de lana gris ' + i, talla: 'M' }));
  const t = C.textoQRCaja({ nombre: 'Invierno 1' }, prendas, 600);
  cierto(t.length <= 600, 'largo ' + t.length); cierto(/\+\d+ más$/.test(t));
});

// ---------- Normalizar IA ----------
prueba('normaliza salida válida de la IA', () => {
  const n = C.normalizarClasificacion({ es_prenda: true, categoria: 'jeans', subtipo: 'Jeans slim', color_hex: '#1A2B3C', estaciones: ['otono', 'invierno', 'xx'], peso_estimado_g: 650, patron: 'liso', formalidad: 'casual', bbox: { x: .1, y: .1, w: .8, h: .8 } });
  igual([n.categoria, n.colorHex, n.estaciones, n.pesoG, !!n.bbox], ['jeans', '#1a2b3c', ['otono', 'invierno'], 650, true]);
});
prueba('normaliza salida basura de forma segura', () => {
  const n = C.normalizarClasificacion({ categoria: 'nave', color_hex: 'rojo', peso_estimado_g: -3, bbox: { x: 2 } });
  igual([n.categoria, n.colorHex, n.pesoG, n.bbox], ['otro', null, 300, null]);
});
prueba('escapar HTML', () => igual(C.esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'));

// ---------- Hotmart v2.0.0 ----------
const compra = (evento, extra = {}) => ({
  id: 'evt-' + evento, event: evento, version: '2.0.0', creation_date: 1793000000000,
  data: {
    product: { id: 1234567, name: 'Armario Virtual Hombres' },
    buyer: { email: ' Cliente@Correo.com ', name: 'X', document: '123', address: { city: 'CDMX' } },
    purchase: { transaction: 'HP1', status: 'APPROVED', price: { value: 397, currency_value: 'MXN' }, recurrence_number: 1, ...extra.purchase },
    ...extra.data,
  },
});
prueba('Hottok: compara igual / distinto / vacío', () => { cierto(compararHottok('abc', 'abc')); cierto(!compararHottok('abd', 'abc')); cierto(!compararHottok('', '')); cierto(!compararHottok(null, 'abc')); });
prueba('PURCHASE_APPROVED → activa + activacion', () => {
  const e = interpretarEvento(compra('PURCHASE_APPROVED'), { productoId: '1234567' });
  igual([e.ignorar, e.estado, e.hottokEvento, e.email, e.accesoHasta], [false, 'activa', 'activacion', 'cliente@correo.com', null]);
});
prueba('renovación de suscripción → renovacion', () => {
  const e = interpretarEvento(compra('PURCHASE_APPROVED', { purchase: { recurrence_number: 3, date_next_charge: 1795000000000 }, data: { subscription: { status: 'ACTIVE' } } }));
  igual([e.estado, e.hottokEvento, !!e.accesoHasta], ['activa', 'renovacion', true]);
});
prueba('prueba gratis → prueba + inicio_prueba', () => {
  const e = interpretarEvento(compra('PURCHASE_APPROVED', { purchase: { price: { value: 0 } }, data: { subscription: { status: 'ACTIVE' } } }));
  igual([e.estado, e.hottokEvento], ['prueba', 'inicio_prueba']);
});
prueba('PURCHASE_REFUNDED → reembolsada + bloqueo_sesion', () => { const e = interpretarEvento(compra('PURCHASE_REFUNDED')); igual([e.estado, e.hottokEvento], ['reembolsada', 'bloqueo_sesion']); });
prueba('PURCHASE_CHARGEBACK → bloqueada + bloqueo_sesion', () => { const e = interpretarEvento(compra('PURCHASE_CHARGEBACK')); igual([e.estado, e.hottokEvento], ['bloqueada', 'bloqueo_sesion']); });
prueba('SUBSCRIPTION_CANCELLATION usa subscriber.email', () => {
  const e = interpretarEvento({ id: 's1', event: 'SUBSCRIPTION_CANCELLATION', version: '2.0.0', creation_date: 1793000000000, data: { subscriber: { email: 'A@B.com' }, date_next_charge: 1000 } });
  igual([e.email, e.estado, e.hottokEvento], ['a@b.com', 'cancelada', 'cancelacion']);
});
prueba('otro producto se ignora', () => cierto(interpretarEvento(compra('PURCHASE_APPROVED'), { productoId: '999' }).ignorar));
prueba('versión distinta de 2.0.0 se ignora', () => cierto(interpretarEvento({ ...compra('PURCHASE_APPROVED'), version: '1.0.0' }).ignorar));
prueba('evento desconocido se ignora', () => cierto(interpretarEvento(compra('CLUB_FIRST_ACCESS')).ignorar));
prueba('payload mínimo sin documento ni dirección', () => { const p = JSON.stringify(payloadMinimo(compra('PURCHASE_APPROVED'))); cierto(!p.includes('document') && !p.includes('address') && !p.includes('CDMX') && !p.includes('Cliente'), p); });

// ---------- Costes IA ----------
prueba('coste Opus 5.5: 1000 in + 500 out = $0.014', () => igual(costoUSD('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 }), 0.014));
prueba('coste Haiku 5.5: 1000 in + 500 out = $0.00035', () => igual(costoUSD('claude-haiku-5-5', { input_tokens: 1000, output_tokens: 500 }), 0.00035));
prueba('modelo sin precio lanza error', () => { let lanzo = false; try { costoUSD('gpt-x', {}); } catch { lanzo = true; } cierto(lanzo); });
prueba('tokens de imagen 768×768 ≈ 787', () => igual(tokensImagen(768, 768), 787));
prueba('cuota corta por número y por USD', () => {
  cierto(revisarCuota({ usados: 5, costoMes: 0.1 }, { limite: 120, topeUSD: 2 }).ok);
  cierto(!revisarCuota({ usados: 120, costoMes: 0 }, { limite: 120, topeUSD: 2 }).ok);
  cierto(!revisarCuota({ usados: 1, costoMes: 2.01 }, { limite: 120, topeUSD: 2 }).ok);
});

// ---------- Imagen: quitar fondo y recortar (sin internet) ----------
function fotoSintetica() {
  const c = IMG.lienzo(400, 300);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 400, 300); // fondo claro con degradado suave (como una sábana)
  grad.addColorStop(0, '#eeeae4'); grad.addColorStop(1, '#ddd8d0');
  g.fillStyle = grad; g.fillRect(0, 0, 400, 300);
  g.fillStyle = '#1f3a5f'; g.fillRect(120, 60, 160, 180); // "prenda" azul marino
  return c;
}
prueba('quitar fondo detecta la prenda y su caja', () => {
  const c = fotoSintetica();
  const r = IMG.quitarFondo(c);
  cierto(r.ok, 'mascara no ok, ratio ' + r.ratio);
  cierto(Math.abs(r.bbox.x - 120) <= 2 && Math.abs(r.bbox.y - 60) <= 2 && Math.abs(r.bbox.w - 160) <= 3 && Math.abs(r.bbox.h - 180) <= 3, JSON.stringify(r.bbox));
  const a = c.getContext('2d').getImageData(5, 5, 1, 1).data[3];
  igual(a, 0, 'fondo transparente');
});
prueba('recorte + color dominante = azul marino', () => {
  const c = fotoSintetica();
  const r = IMG.quitarFondo(c);
  const rec = IMG.recortar(c, r.bbox);
  cierto(rec.width < 200 && rec.height < 220, `${rec.width}x${rec.height}`);
  igual(IMG.colorDominante(rec), '#1f3a5f');
});
prueba('imagen sin fondo separable avisa (ok=false)', () => {
  const c = IMG.lienzo(100, 100);
  c.getContext('2d').fillStyle = '#777'; c.getContext('2d').fillRect(0, 0, 100, 100);
  cierto(!IMG.quitarFondo(c).ok);
});

// ---------- reporte ----------
const mal = resultados.filter(r => !r.ok);
document.getElementById('resumen').textContent = `${resultados.length - mal.length}/${resultados.length} pruebas OK`;
document.getElementById('resumen').className = mal.length ? 'mal' : 'ok';
document.getElementById('lista').innerHTML = resultados.map(r => `<li class="${r.ok ? 'ok' : 'mal'}">${r.ok ? '✓' : '✗'} ${r.nombre}${r.error ? ' — ' + r.error : ''}</li>`).join('');
window.__resultados = { total: resultados.length, fallos: mal };
