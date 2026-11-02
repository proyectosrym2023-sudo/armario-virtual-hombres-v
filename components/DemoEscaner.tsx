'use client';
import { useState } from 'react';
import { colorMasCercano, nombreColor } from '@/lib/catalogo';
import { procesarFoto } from '@/lib/imagen-navegador';

// Demostración REAL del recorte y del color: procesa tu foto en este navegador. No sube nada ni usa IA.
export function DemoEscaner() {
  const [antes, setAntes] = useState<string | null>(null);
  const [res, setRes] = useState<{ url: string; color: string | null; ok: boolean; ms: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function probar(f: File) {
    setOcupado(true);
    if (antes) URL.revokeObjectURL(antes);
    if (res) URL.revokeObjectURL(res.url);
    setAntes(URL.createObjectURL(f));
    try {
      const p = await procesarFoto(f);
      setRes({ url: p.vistaPrevia, color: p.colorHex, ok: p.recorteOk, ms: p.msRecorte });
    } finally { setOcupado(false); }
  }

  return (
    <div className="tarjeta pila">
      <h3>Pruébalo con una foto tuya</h3>
      <p className="suave">Toma una foto de una prenda sobre un fondo liso. Se procesa <b>en tu navegador</b>: no se sube a ningún servidor.</p>
      <label className="boton primario ancho">{ocupado ? <span className="cargando" /> : 'Elegir o tomar foto'}
        <input type="file" accept="image/*" capture="environment" hidden onChange={e => e.target.files?.[0] && probar(e.target.files[0])} /></label>
      {antes && res && (
        <>
          <div className="rejilla-2">
            <figure style={{ margin: 0 }}><div className="foto grande"><img src={antes} alt="Foto original" /></div><figcaption className="suave">Original</figcaption></figure>
            <figure style={{ margin: 0 }}><div className="foto grande transparente"><img src={res.url} alt="Recorte automático" /></div><figcaption className="suave">Recorte automático</figcaption></figure>
          </div>
          <p>{res.ok ? '✓ Fondo eliminado' : 'No pude separar el fondo con seguridad (prueba con un fondo más liso)'} · Color: <span className="punto" style={{ background: res.color ?? undefined }} />{res.color ? nombreColor(colorMasCercano(res.color)) : '—'} · {res.ms} ms</p>
          <p className="suave">En la app, además, la IA sugiere el tipo de prenda y la estación. Tú confirmas o corriges.</p>
        </>
      )}
    </div>
  );
}
