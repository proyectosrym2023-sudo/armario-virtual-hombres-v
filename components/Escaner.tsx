'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colorMasCercano, type Categoria, type Estacion } from '@/lib/catalogo';
import { procesarFoto, type FotoProcesada } from '@/lib/imagen-navegador';
import { sb } from '@/lib/supabase/navegador';
import { FormArticulo, type DatosArticulo } from './FormArticulo';

type Paso = 'inicio' | 'camara' | 'procesando' | 'revision' | 'guardando';
interface RespuestaScan {
  scan_id: string | null;
  sugerencia: null | { itemType: string; categoria: Categoria; nombre: string; color: string; colorHex: string | null; estacionPrincipal: Estacion; estacionesAdicionales: Estacion[]; talla: string; marca: string; confianza: number; esArticulo: boolean };
  uso?: { modelo: string; ms: number; costoUSD: number; tokens: number };
  cuota?: { usados: number; limite: number };
  error?: string | null;
}

export function Escaner({ tallasHabituales, userId }: { tallasHabituales: Record<string, string | null>; userId: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>('inicio');
  const [foto, setFoto] = useState<FotoProcesada | null>(null);
  const [ia, setIa] = useState<RespuestaScan | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [msTotal, setMsTotal] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);

  useEffect(() => () => { flujo.current?.getTracks().forEach(t => t.stop()); if (foto) URL.revokeObjectURL(foto.vistaPrevia); }, [foto]);
  useEffect(() => {
    if (paso === 'camara' && video.current && flujo.current) { video.current.srcObject = flujo.current; video.current.play().catch(() => {}); }
  }, [paso]);

  async function abrirCamara() {
    setAviso(null);
    if (!navigator.mediaDevices?.getUserMedia) return document.getElementById('entrada-camara')?.click();
    try {
      flujo.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      setPaso('camara');
    } catch {
      document.getElementById('entrada-camara')?.click(); // sin permiso: cámara nativa del celular
    }
  }

  async function capturar() {
    const v = video.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    flujo.current?.getTracks().forEach(t => t.stop());
    c.toBlob(b => b && procesar(b), 'image/jpeg', 0.92);
  }

  async function procesar(archivo: Blob) {
    if (!archivo.type.startsWith('image/')) return setAviso('Ese archivo no es una imagen.');
    setPaso('procesando'); setAviso(null); setIa(null);
    const t0 = performance.now();
    try {
      const f = await procesarFoto(archivo);
      setFoto(f);
      const r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imagen: f.paraIA, recorte_ok: f.recorteOk, ms_recorte: f.msRecorte }) });
      const json: RespuestaScan & { error?: string } = await r.json().catch(() => ({ scan_id: null, sugerencia: null }));
      if (!r.ok) setAviso(json.error ?? 'La IA no respondió. Completa los datos a mano.');
      else if (json.sugerencia && !json.sugerencia.esArticulo) setAviso('La IA no ve una prenda o accesorio claro. Revisa los datos.');
      else if (!json.sugerencia) setAviso('La IA no pudo clasificar esta foto. Completa los datos a mano.');
      setIa(r.ok ? json : null);
      setMsTotal(Math.round(performance.now() - t0));
      setPaso('revision');
    } catch (e) {
      setAviso('No pude leer la imagen: ' + (e as Error).message);
      setPaso('inicio');
    }
  }

  function datosIniciales(): DatosArticulo {
    const s = ia?.sugerencia;
    const color = s?.color ?? (foto?.colorHex ? colorMasCercano(foto.colorHex) : 'gris');
    return {
      name: s?.nombre ?? '', category: s?.categoria ?? 'ropa', item_type: s?.itemType ?? 'camisa',
      color, color_hex: s?.colorHex ?? foto?.colorHex ?? null,
      main_season: s?.estacionPrincipal ?? 'primavera', additional_seasons: s?.estacionesAdicionales ?? [],
      clothing_size: s?.talla ?? '', brand_optional: s?.marca ?? '', notes: '',
    };
  }

  async function guardar(d: DatosArticulo) {
    if (!foto) return;
    setPaso('guardando'); setAviso(null);
    const id = crypto.randomUUID();
    const base = `${userId}/${id}`;
    const ext = foto.procesada.type === 'image/png' ? 'png' : 'webp';
    try {
      const { error: e1 } = await sb().from('wardrobe_items').insert({
        id, user_id: userId, category: d.category, item_type: d.item_type, name: d.name || null, color: d.color, color_hex: d.color_hex,
        main_season: d.main_season, additional_seasons: d.additional_seasons,
        clothing_size: d.category === 'ropa' && d.clothing_size ? d.clothing_size : null,
        brand_optional: d.brand_optional || null, notes: d.notes || null,
      });
      if (e1) throw e1;
      const up1 = await sb().storage.from('wardrobe').upload(`${base}/original.jpg`, foto.original, { contentType: 'image/jpeg' });
      if (up1.error) throw up1.error;
      const up2 = await sb().storage.from('wardrobe').upload(`${base}/processed.${ext}`, foto.procesada, { contentType: foto.procesada.type });
      const { error: e2 } = await sb().from('item_images').insert({
        item_id: id, user_id: userId, original_path: `${base}/original.jpg`,
        processed_path: up2.error ? null : `${base}/processed.${ext}`,
        processing_status: up2.error ? 'failed' : foto.recorteOk ? 'processed' : 'manual',
      });
      if (e2) throw e2;
      if (ia?.scan_id) {
        await fetch(`/api/scan/${ia.scan_id}/resultado`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ item_id: id, category: d.category, item_type: d.item_type, color: d.color, main_season: d.main_season, additional_seasons: d.additional_seasons }) });
      }
      router.push(`/app/prenda/${id}?nuevo=1`);
      router.refresh();
    } catch (e) {
      await sb().from('wardrobe_items').delete().eq('id', id); // deshace a medias (la foto se borra con el artículo)
      await sb().storage.from('wardrobe').remove([`${base}/original.jpg`, `${base}/processed.${ext}`]);
      setAviso('No se pudo guardar: ' + ((e as { message?: string }).message ?? String(e)));
      setPaso('revision');
    }
  }

  async function descartar() {
    if (ia?.scan_id) await fetch(`/api/scan/${ia.scan_id}/resultado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ descartado: true }) });
    if (foto) URL.revokeObjectURL(foto.vistaPrevia);
    setFoto(null); setIa(null); setPaso('inicio');
  }

  const entradas = (
    <>
      <input id="entrada-camara" type="file" accept="image/*" capture="environment" hidden onChange={e => e.target.files?.[0] && procesar(e.target.files[0])} />
      <input id="entrada-galeria" type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && procesar(e.target.files[0])} />
    </>
  );

  if (paso === 'inicio') return (
    <div className="pila">
      {entradas}
      <section className="tarjeta escaner-hero">
        <button className="boton-escanear" onClick={abrirCamara} aria-label="Abrir cámara">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></svg>
          ESCANEAR</button>
        <p className="suave">Extiende la prenda sobre un fondo liso (cama, piso o pared) o pon el accesorio sobre una mesa. Sin personas en la foto.</p>
        <button className="boton ancho" onClick={() => document.getElementById('entrada-galeria')?.click()}>Elegir de la galería</button>
      </section>
      {aviso && <p className="aviso error">{aviso}</p>}
      <p className="privado">Tus fotos se guardan en tu espacio privado. Solo tú puedes verlas.</p>
    </div>
  );

  if (paso === 'camara') return (
    <div className="pila">
      {entradas}
      <video ref={video} className="camara" playsInline muted />
      <button className="boton primario ancho" onClick={capturar}>Capturar</button>
      <button className="boton ancho" onClick={() => { flujo.current?.getTracks().forEach(t => t.stop()); setPaso('inicio'); }}>Cancelar</button>
    </div>
  );

  if (paso === 'procesando') return (
    <section className="tarjeta escaner-hero"><span className="cargando" style={{ width: 40, height: 40 }} /><p>Recortando el fondo e identificando…</p></section>
  );

  return (
    <div className="pila">
      <div className="foto grande transparente"><img src={foto!.vistaPrevia} alt="Vista previa recortada" /></div>
      {!foto!.recorteOk && <p className="aviso">No pude separar el fondo con seguridad. Guardé la foto completa; con un fondo liso sale mejor.</p>}
      {aviso && <p className="aviso error">{aviso}</p>}
      {ia?.uso && <p className="suave">IA: {ia.uso.modelo} · {(msTotal / 1000).toFixed(1)} s · US${ia.uso.costoUSD.toFixed(4)}{ia.cuota ? ` · ${ia.cuota.usados}/${ia.cuota.limite} este mes` : ''}</p>}
      {ia?.sugerencia && <p className="aviso ok">Sugerencias de la IA: revisa y corrige lo que haga falta. Tú decides.</p>}
      <FormArticulo inicial={datosIniciales()} tallasHabituales={tallasHabituales} textoBoton="Guardar en mi armario" ocupado={paso === 'guardando'} onGuardar={guardar} />
      <button className="boton ancho" onClick={descartar} disabled={paso === 'guardando'}>Descartar</button>
    </div>
  );
}
