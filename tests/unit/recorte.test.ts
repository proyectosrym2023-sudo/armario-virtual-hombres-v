import { describe, expect, it } from 'vitest';
import { colorDominante, iou, quitarFondo, type Pixeles } from '@/lib/recorte';

// Imágenes sintéticas: sirven para probar el algoritmo, NO para medir precisión con ropa real.
function imagen(w: number, h: number, fondo: (x: number, y: number) => [number, number, number],
  objeto?: { x: number; y: number; w: number; h: number; color: [number, number, number] }): Pixeles {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dentro = objeto && x >= objeto.x && x < objeto.x + objeto.w && y >= objeto.y && y < objeto.y + objeto.h;
    const [r, g, b] = dentro ? objeto!.color : fondo(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const sabana = (x: number, y: number): [number, number, number] => [238 - ((x + y) / 700) * 20, 234 - ((x + y) / 700) * 20, 228 - ((x + y) / 700) * 20];

describe('recorte local', () => {
  it('separa una prenda oscura de un fondo claro con degradado', () => {
    const obj = { x: 120, y: 60, w: 160, h: 180, color: [31, 58, 95] as [number, number, number] };
    const px = imagen(400, 300, sabana, obj);
    const r = quitarFondo(px);
    expect(r.ok).toBe(true);
    expect(iou(r.bbox!, obj)).toBeGreaterThan(0.95);
    expect(px.data[(5 * 400 + 5) * 4 + 3]).toBe(0);              // fondo transparente
    expect(px.data[(150 * 400 + 200) * 4 + 3]).toBe(255);         // prenda opaca
    expect(colorDominante(px)).toBe('#1f3a5f');
  });
  it('separa una prenda blanca sobre fondo oscuro', () => {
    const obj = { x: 50, y: 50, w: 100, h: 100, color: [245, 245, 245] as [number, number, number] };
    const r = quitarFondo(imagen(200, 200, () => [40, 40, 45], obj));
    expect(r.ok).toBe(true);
    expect(iou(r.bbox!, obj)).toBeGreaterThan(0.95);
  });
  it('si no hay nada que separar, avisa (ok=false) y no toca la imagen', () => {
    const px = imagen(100, 100, () => [120, 120, 120]);
    const r = quitarFondo(px);
    expect(r.ok).toBe(false);
    expect(px.data[3]).toBe(255);
  });
  it('fondo recargado (ruido) se reporta como fallo en vez de recortar mal', () => {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const r = quitarFondo(imagen(120, 120, () => [rnd() * 255, rnd() * 255, rnd() * 255], { x: 40, y: 40, w: 40, h: 40, color: [0, 0, 0] }));
    expect(r.ok).toBe(false);
  });
  it('IoU', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(0);
  });
});
