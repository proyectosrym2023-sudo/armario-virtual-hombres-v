'use client';
// Procesa fotos REALES en el navegador: original, recorte de fondo local, color dominante e imagen para la IA.
import { colorDominante, quitarFondo, type Caja } from './recorte';

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

export async function cargar(fuente: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(fuente, { imageOrientation: 'from-image' }); } catch { /* Safari antiguo */ }
  const url = URL.createObjectURL(fuente);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}

export function escalar(src: CanvasImageSource & { width: number; height: number }, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = lienzo(src.width * k, src.height * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function recortar(c: HTMLCanvasElement, b: Caja, margen = 0.04) {
  const m = Math.round(Math.max(b.w, b.h) * margen);
  const x = Math.max(0, b.x - m), y = Math.max(0, b.y - m);
  const w = Math.min(c.width - x, b.w + 2 * m), h = Math.min(c.height - y, b.h + 2 * m);
  const out = lienzo(w, h);
  out.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h);
  return out;
}

export const aBlob = (c: HTMLCanvasElement, tipo: string, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob(b => {
    if (b && b.type === tipo) return res(b);
    c.toBlob(b2 => (b2 ? res(b2) : rej(new Error('No se pudo codificar la imagen'))), 'image/png'); // Safari sin WebP
  }, tipo, q));

export interface FotoProcesada {
  original: Blob;          // JPEG ≤1600px, para guardar
  procesada: Blob;         // WebP/PNG con fondo transparente (o la original si el recorte falló)
  vistaPrevia: string;     // object URL de la procesada
  paraIA: string;          // base64 JPEG 768px
  colorHex: string | null;
  recorteOk: boolean;
  msRecorte: number;
}

export async function procesarFoto(archivo: Blob): Promise<FotoProcesada> {
  const t0 = performance.now();
  const img = await cargar(archivo);
  const grande = escalar(img, 1600);
  const original = await aBlob(grande, 'image/jpeg', 0.88);
  const trabajo = escalar(grande, 1024);
  const ctx = trabajo.getContext('2d', { willReadFrequently: true })!;
  const px = ctx.getImageData(0, 0, trabajo.width, trabajo.height);
  const r = quitarFondo({ data: px.data, width: px.width, height: px.height });
  let final = trabajo;
  if (r.ok && r.bbox) { ctx.putImageData(px, 0, 0); final = recortar(trabajo, r.bbox); }
  const fpx = final.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, final.width, final.height);
  const procesada = await aBlob(final, 'image/webp', 0.86);
  const paraIA = escalar(grande, 768).toDataURL('image/jpeg', 0.82).split(',')[1];
  return {
    original, procesada, paraIA,
    vistaPrevia: URL.createObjectURL(procesada),
    colorHex: colorDominante({ data: fpx.data, width: fpx.width, height: fpx.height }),
    recorteOk: r.ok,
    msRecorte: Math.round(performance.now() - t0),
  };
}
