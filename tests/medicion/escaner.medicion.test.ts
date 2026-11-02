// MEDICIÓN REAL del escáner con fotos reales. Gasta dinero de la API: ejecútalo a propósito (`npm run medir`).
// Estructura: fotos-prueba/<item_type>/<foto>.jpg   (ej. fotos-prueba/reloj/casio.jpg)
// Opcional:   fotos-prueba/etiquetas.json  { "reloj/casio.jpg": { "color": "plateado", "estacion": "verano", "bbox": {"x":..,"y":..,"w":..,"h":..} } }
//             (bbox en píxeles de la imagen escalada a 1024 px de lado mayor)
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { categoriaDeTipo, TIPOS } from '@/lib/catalogo';
import { clasificar } from '@/lib/clasificar';
import { percentil, proyectar } from '@/lib/costes';
import { iou, quitarFondo } from '@/lib/recorte';

const DIR = 'fotos-prueba';

it('medir escáner con fotos reales', async () => {
  if (!existsSync(DIR)) { console.log(`No existe ${DIR}/: no hay nada que medir.`); return; }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en .env.local');
  const etiquetas: Record<string, { color?: string; estacion?: string; bbox?: { x: number; y: number; w: number; h: number } }> =
    existsSync(`${DIR}/etiquetas.json`) ? JSON.parse(await readFile(`${DIR}/etiquetas.json`, 'utf8')) : {};
  const filas = [];
  for (const tipo of (await readdir(DIR, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)) {
    if (!TIPOS.some(t => t.id === tipo)) { console.warn(`Carpeta ignorada (no es un tipo válido): ${tipo}`); continue; }
    for (const f of (await readdir(`${DIR}/${tipo}`)).filter(f => /\.(jpe?g|png|webp|heic)$/i.test(f))) {
      const ruta = `${tipo}/${f}`, et = etiquetas[ruta] ?? {};
      const buf = await readFile(`${DIR}/${ruta}`);
      // Recorte local: mismo algoritmo que el navegador, sobre la imagen a 1024 px.
      const { data, info } = await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const t0 = performance.now();
      const rec = quitarFondo({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height });
      const msRecorte = Math.round(performance.now() - t0);
      // IA: misma entrada que la app (JPEG 768 px).
      const jpg = (await sharp(buf).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()).toString('base64');
      let r;
      try { r = await clasificar(jpg, 'image/jpeg'); } catch (e) { r = { sugerencia: null, error: (e as Error).message, costo: 0, ms: 0, modelo: '', inputTokens: 0, outputTokens: 0 }; }
      const s = r.sugerencia;
      filas.push({
        foto: ruta, esperado: tipo, detectado: s?.itemType ?? null,
        tipoOk: s?.itemType === tipo, categoriaOk: s?.categoria === categoriaDeTipo(tipo),
        colorOk: et.color ? s?.color === et.color : null, estacionOk: et.estacion ? s?.estacionPrincipal === et.estacion : null,
        recorteOk: rec.ok, iou: et.bbox && rec.bbox ? Math.round(iou(rec.bbox, et.bbox) * 1000) / 1000 : null,
        msRecorte, msIA: r.ms, costo: r.costo, tokens: r.inputTokens + r.outputTokens, error: r.error, modelo: r.modelo,
      });
      console.log(`${ruta}: ${s?.itemType ?? 'ERROR'} ${s?.itemType === tipo ? '✓' : '✗'} · ${r.ms} ms · $${r.costo}`);
    }
  }
  expect(filas.length).toBeGreaterThan(0);
  const pct = (xs: (boolean | null)[]) => { const v = xs.filter(x => x !== null); return v.length ? Math.round((1000 * v.filter(Boolean).length) / v.length) / 10 : null; };
  const n = filas.length, ok = filas.filter(f => !f.error);
  const coste = filas.reduce((a, f) => a + f.costo, 0);
  const resumen = {
    fecha: new Date().toISOString(), modelo: filas[0].modelo, fotos: n,
    precision_tipo_pct: pct(filas.map(f => f.tipoOk)), precision_categoria_pct: pct(filas.map(f => f.categoriaOk)),
    precision_color_pct: pct(filas.map(f => f.colorOk)), acierto_estacion_pct: pct(filas.map(f => f.estacionOk)),
    recorte_ok_pct: pct(filas.map(f => f.recorteOk)), iou_medio: (() => { const v = filas.map(f => f.iou).filter((x): x is number => x !== null); return v.length ? Math.round(1000 * v.reduce((a, b) => a + b, 0) / v.length) / 1000 : null; })(),
    latencia_ia_ms: { p50: percentil(filas.map(f => f.msIA), 0.5), p95: percentil(filas.map(f => f.msIA), 0.95) },
    recorte_ms: { p50: percentil(filas.map(f => f.msRecorte), 0.5), p95: percentil(filas.map(f => f.msRecorte), 0.95) },
    coste_total_usd: Math.round(coste * 1e6) / 1e6,
    coste_por_intento: Math.round((coste / n) * 1e6) / 1e6,
    coste_por_exitoso: ok.length ? Math.round((coste / ok.length) * 1e6) / 1e6 : null,
    proyeccion: proyectar(coste / n, ok.length / n),
  };
  await mkdir('reportes', { recursive: true });
  const archivo = `reportes/medicion-${resumen.fecha.slice(0, 19).replace(/:/g, '')}.json`;
  await writeFile(archivo, JSON.stringify({ resumen, filas }, null, 2));
  console.log(JSON.stringify(resumen, null, 2), `\nGuardado en ${archivo}`);
}, 3_600_000);
