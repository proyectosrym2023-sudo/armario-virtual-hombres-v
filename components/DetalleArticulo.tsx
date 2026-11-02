'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIAS, ESTACIONES, TIPO, nombreColor, type Categoria, type Estacion } from '@/lib/catalogo';
import type { Articulo } from '@/lib/armario';
import { sb } from '@/lib/supabase/navegador';
import { FormArticulo, type DatosArticulo } from './FormArticulo';

export function DetalleArticulo({ articulo: a, urlOriginal, urlProcesada, tallasHabituales, puedeEditar }: {
  articulo: Articulo; urlOriginal: string | null; urlProcesada: string | null;
  tallasHabituales: Record<string, string | null>; puedeEditar: boolean;
}) {
  const router = useRouter();
  const [ver, setVer] = useState<'recortada' | 'original'>(urlProcesada ? 'recortada' : 'original');
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipo = (TIPO as Record<string, { nombre: string }>)[a.item_type]?.nombre ?? a.item_type;

  async function guardar(d: DatosArticulo) {
    setOcupado(true); setError(null);
    const { error } = await sb().from('wardrobe_items').update({
      name: d.name || null, category: d.category, item_type: d.item_type, color: d.color, color_hex: d.color_hex,
      main_season: d.main_season, additional_seasons: d.additional_seasons,
      clothing_size: d.category === 'ropa' && d.clothing_size ? d.clothing_size : null,
      brand_optional: d.brand_optional || null, notes: d.notes || null,
    }).eq('id', a.id);
    setOcupado(false);
    if (error) return setError(error.message);
    setEditando(false);
    router.refresh();
  }

  async function eliminar() {
    if (!confirm('¿Eliminar este artículo y sus fotos? No se puede deshacer.')) return;
    setOcupado(true);
    const rutas = [a.item_images?.original_path, a.item_images?.processed_path].filter(Boolean) as string[];
    if (rutas.length) await sb().storage.from('wardrobe').remove(rutas);
    const { error } = await sb().from('wardrobe_items').delete().eq('id', a.id);
    if (error) { setOcupado(false); return setError(error.message); }
    router.push('/app');
    router.refresh();
  }

  const url = ver === 'recortada' ? urlProcesada : urlOriginal;
  return (
    <div className="pila" style={{ marginTop: 12 }}>
      <div className={`foto grande ${ver === 'recortada' ? 'transparente' : ''}`}>{url ? <img src={url} alt={a.name ?? tipo} /> : <span>👔</span>}</div>
      {urlProcesada && urlOriginal && (
        <div className="chips" role="group" aria-label="Fotografía">
          <button className="chip" aria-pressed={ver === 'recortada'} onClick={() => setVer('recortada')}>Recortada</button>
          <button className="chip" aria-pressed={ver === 'original'} onClick={() => setVer('original')}>Original</button>
        </div>
      )}
      {error && <p className="aviso error">{error}</p>}
      {!editando ? (
        <section className="tarjeta pila">
          <h2>{a.name || tipo}</h2>
          <ul className="lista">
            <li><span>Categoría</span><b>{CATEGORIAS.find(c => c.id === a.category)?.nombre} · {tipo}</b></li>
            <li><span>Color</span><b><span className="punto" style={{ background: a.color_hex ?? undefined }} />{nombreColor(a.color)}</b></li>
            <li><span>Estación principal</span><b>{ESTACIONES.find(e => e.id === a.main_season)?.nombre}</b></li>
            <li><span>También sirve en</span><b>{a.additional_seasons.length ? a.additional_seasons.map(s => ESTACIONES.find(e => e.id === s)?.nombre).join(', ') : '—'}</b></li>
            {a.category === 'ropa' && <li><span>Talla</span><b>{a.clothing_size ?? '—'}</b></li>}
            {a.brand_optional && <li><span>Marca</span><b>{a.brand_optional}</b></li>}
            <li><span>Registrado</span><b>{new Date(a.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</b></li>
          </ul>
          {a.notes && <p className="suave">{a.notes}</p>}
          {puedeEditar
            ? <button className="boton primario ancho" onClick={() => setEditando(true)}>Editar o cambiar de estación</button>
            : <p className="aviso">Con la suscripción inactiva puedes ver y eliminar tus artículos, pero no editarlos.</p>}
          <button className="boton peligro ancho" onClick={eliminar} disabled={ocupado}>Eliminar</button>
        </section>
      ) : (
        <>
          <FormArticulo
            inicial={{
              name: a.name ?? '', category: a.category as Categoria, item_type: a.item_type, color: a.color, color_hex: a.color_hex,
              main_season: a.main_season as Estacion, additional_seasons: a.additional_seasons as Estacion[],
              clothing_size: a.clothing_size ?? '', brand_optional: a.brand_optional ?? '', notes: a.notes ?? '',
            }}
            tallasHabituales={tallasHabituales} textoBoton="Guardar cambios" ocupado={ocupado} onGuardar={guardar} />
          <button className="boton ancho" onClick={() => setEditando(false)}>Cancelar</button>
        </>
      )}
    </div>
  );
}
