// Recorte de fondo LOCAL (sin servicios externos, coste $0). Opera sobre píxeles RGBA puros:
// se prueba en Node con imágenes sintéticas y en el navegador con fotos reales.
// Limitación conocida: funciona con fondos lisos o con degradado suave; con fondos recargados avisa (ok=false).

export interface Pixeles { data: Uint8ClampedArray; width: number; height: number }
export interface Caja { x: number; y: number; w: number; h: number }
export interface ResultadoRecorte { ok: boolean; ratio: number; bbox: Caja | null; fondo: [number, number, number] }

const d2 = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return dr * dr + dg * dg + db * db;
};

/** Pone alpha=0 en el fondo conectado al borde. Modifica `px.data`. */
export function quitarFondo(px: Pixeles, tolerancia = 42): ResultadoRecorte {
  const { data: d, width: w, height: h } = px;
  const m: number[][] = [[], [], []];
  const paso = Math.max(1, Math.floor((w + h) / 200));
  const tomar = (x: number, y: number) => { const i = (y * w + x) * 4; m[0].push(d[i]); m[1].push(d[i + 1]); m[2].push(d[i + 2]); };
  for (let x = 0; x < w; x += paso) { tomar(x, 0); tomar(x, h - 1); }
  for (let y = 0; y < h; y += paso) { tomar(0, y); tomar(w - 1, y); }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const [br, bg, bb] = [med(m[0]), med(m[1]), med(m[2])];

  const tol2 = tolerancia * tolerancia, lejos2 = tol2 * 3.2, vecino2 = tol2 / 9;
  const fondo = new Uint8Array(w * h);
  const cola = new Int32Array(w * h);
  let ini = 0, fin = 0;
  const sembrar = (p: number) => { if (!fondo[p] && d2(d, p * 4, br, bg, bb) < tol2) { fondo[p] = 1; cola[fin++] = p; } };
  for (let x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }

  while (ini < fin) {
    const p = cola[ini++];
    const x = p % w, y = (p / w) | 0, i = p * 4;
    const vs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of vs) {
      if (q < 0 || fondo[q]) continue;
      const j = q * 4;
      const aF = d2(d, j, br, bg, bb), aV = d2(d, j, d[i], d[i + 1], d[i + 2]);
      if (aF < tol2 || (aV < vecino2 && aF < lejos2)) { fondo[q] = 1; cola[fin++] = q; }
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1, frente = 0;
  const copia = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (fondo[p]) { copia[p * 4 + 3] = 0; continue; }
    frente++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if ((x > 0 && fondo[p - 1]) || (x < w - 1 && fondo[p + 1]) || (y > 0 && fondo[p - w]) || (y < h - 1 && fondo[p + w])) copia[p * 4 + 3] = 170;
  }
  const ratio = frente / (w * h);
  const ok = ratio > 0.03 && ratio < 0.97;
  if (ok) d.set(copia);
  return { ok, ratio, bbox: x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null, fondo: [br, bg, bb] };
}

/** Color dominante entre los píxeles opacos (cubos de 16 niveles por canal). */
export function colorDominante(px: Pixeles): string | null {
  const d = px.data, cubos = new Map<number, number[]>();
  const paso = Math.max(1, Math.floor(d.length / 4 / 40000)) * 4;
  for (let i = 0; i < d.length; i += paso) {
    if (d[i + 3] < 200) continue;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const c = cubos.get(k) ?? [0, 0, 0, 0];
    c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; c[3]++;
    cubos.set(k, c);
  }
  let mejor: number[] | null = null;
  for (const c of cubos.values()) if (!mejor || c[3] > mejor[3]) mejor = c;
  if (!mejor) return null;
  const n = mejor[3];
  return '#' + mejor.slice(0, 3).map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
}

/** Intersección sobre unión: mide la precisión del recorte contra una caja de referencia. */
export function iou(a: Caja, b: Caja): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
}
