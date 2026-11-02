// Procesado de fotos 100% local: redimensionar, quitar fondo, recorte automático y color dominante.
// Nada de esto envía datos a internet.

export async function cargarImagen(file) {
  if ('createImageBitmap' in self) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fallback abajo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function redimensionar(src, max) {
  const w = src.width, h = src.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = lienzo(w * k, h * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const dist2 = (d, i, r, g, b) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return dr * dr + dg * dg + db * db;
};

// Fondo = región conectada al borde con color parecido al color mediano del borde.
// Funciona bien con fondos lisos (cama, piso, pared). Devuelve calidad para avisar si falló.
export function quitarFondo(canvas, { tolerancia = 42 } = {}) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const muestras = [[], [], []];
  const paso = Math.max(1, Math.floor((w + h) / 200));
  const tomar = (x, y) => { const i = (y * w + x) * 4; muestras[0].push(d[i]); muestras[1].push(d[i + 1]); muestras[2].push(d[i + 2]); };
  for (let x = 0; x < w; x += paso) { tomar(x, 0); tomar(x, h - 1); }
  for (let y = 0; y < h; y += paso) { tomar(0, y); tomar(w - 1, y); }
  const mediana = a => a.sort((p, q) => p - q)[a.length >> 1];
  const [br, bg, bb] = muestras.map(mediana);

  const tol2 = tolerancia * tolerancia;
  const tolLejos2 = tol2 * 3.2;   // permite degradados/sombras suaves del fondo
  const tolVecino2 = tol2 / 9;
  const fondo = new Uint8Array(w * h);
  const cola = new Int32Array(w * h);
  let ini = 0, fin = 0;
  const sembrar = p => {
    if (!fondo[p] && dist2(d, p * 4, br, bg, bb) < tol2) { fondo[p] = 1; cola[fin++] = p; }
  };
  for (let x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }

  while (ini < fin) {
    const p = cola[ini++];
    const x = p % w, y = (p / w) | 0, i = p * 4;
    const vecinos = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of vecinos) {
      if (q < 0 || fondo[q]) continue;
      const j = q * 4;
      const aFondo = dist2(d, j, br, bg, bb);
      const aVecino = dist2(d, j, d[i], d[i + 1], d[i + 2]);
      if (aFondo < tol2 || (aVecino < tolVecino2 && aFondo < tolLejos2)) { fondo[q] = 1; cola[fin++] = q; }
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1, frente = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (fondo[p]) { d[p * 4 + 3] = 0; continue; }
      frente++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const borde = (x > 0 && fondo[p - 1]) || (x < w - 1 && fondo[p + 1]) || (y > 0 && fondo[p - w]) || (y < h - 1 && fondo[p + w]);
      if (borde) d[p * 4 + 3] = 170; // suaviza el contorno
    }
  }
  const ratio = frente / (w * h);
  const ok = ratio > 0.03 && ratio < 0.97;
  if (ok) ctx.putImageData(img, 0, 0);
  return { ok, ratio, bbox: x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null, fondo: [br, bg, bb] };
}

export function recortar(canvas, bbox, margen = 0.04) {
  if (!bbox) return canvas;
  const m = Math.round(Math.max(bbox.w, bbox.h) * margen);
  const x = Math.max(0, bbox.x - m), y = Math.max(0, bbox.y - m);
  const w = Math.min(canvas.width - x, bbox.w + 2 * m), h = Math.min(canvas.height - y, bbox.h + 2 * m);
  const c = lienzo(w, h);
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

// bbox normalizado (0-1) que devuelve la IA → píxeles
export function bboxDesdeNormalizado(canvas, b) {
  if (!b) return null;
  return { x: Math.round(b.x * canvas.width), y: Math.round(b.y * canvas.height), w: Math.round(b.w * canvas.width), h: Math.round(b.h * canvas.height) };
}

export function colorDominante(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const cubos = new Map();
  const paso = Math.max(4, Math.floor(data.length / 4 / 20000)) * 4;
  for (let i = 0; i < data.length; i += paso) {
    if (data[i + 3] < 200) continue;
    const k = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4);
    const c = cubos.get(k) || [0, 0, 0, 0];
    c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2]; c[3]++;
    cubos.set(k, c);
  }
  let mejor = null;
  for (const c of cubos.values()) if (!mejor || c[3] > mejor[3]) mejor = c;
  if (!mejor) return null;
  return '#' + mejor.slice(0, 3).map(v => Math.round(v / mejor[3]).toString(16).padStart(2, '0')).join('');
}

export function aBlob(canvas, tipo = 'image/webp', calidad = 0.85) {
  return new Promise(res => canvas.toBlob(b => {
    if (b && b.type === tipo) return res(b);
    canvas.toBlob(res, tipo === 'image/jpeg' ? 'image/jpeg' : 'image/png', calidad); // Safari sin WebP
  }, tipo, calidad));
}

export function aBase64(canvas, calidad = 0.8) {
  return canvas.toDataURL('image/jpeg', calidad).split(',')[1];
}

// Flujo completo del escáner.
export async function procesarFoto(file, { conFondo = false } = {}) {
  const src = await cargarImagen(file);
  const base = redimensionar(src, 1024);
  const paraIA = aBase64(redimensionar(base, 768)); // 768px JPEG ≈ 790 tokens de imagen
  const trabajo = redimensionar(base, 1024);
  let mascara = { ok: false, ratio: 1, bbox: null };
  if (!conFondo) mascara = quitarFondo(trabajo);
  const final = mascara.ok ? recortar(trabajo, mascara.bbox) : trabajo;
  return {
    base, final, paraIA,
    mascaraOk: mascara.ok,
    colorHex: colorDominante(final),
  };
}
