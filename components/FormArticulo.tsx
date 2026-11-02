'use client';
import { useState } from 'react';
import { CATEGORIAS, COLORES, ESTACIONES, TIPO, TIPOS, type Categoria, type Estacion } from '@/lib/catalogo';

export interface DatosArticulo {
  name: string;
  category: Categoria;
  item_type: string;
  color: string;
  color_hex: string | null;
  main_season: Estacion;
  additional_seasons: Estacion[];
  clothing_size: string;
  brand_optional: string;
  notes: string;
}

export function FormArticulo({ inicial, tallasHabituales, textoBoton, ocupado, onGuardar }: {
  inicial: DatosArticulo;
  tallasHabituales: Record<string, string | null>;
  textoBoton: string;
  ocupado?: boolean;
  onGuardar: (d: DatosArticulo) => void;
}) {
  const [d, setD] = useState<DatosArticulo>(inicial);
  const cambiar = <K extends keyof DatosArticulo>(k: K, v: DatosArticulo[K]) => setD(x => ({ ...x, [k]: v }));
  const tipos = TIPOS.filter(t => t.categoria === d.category);
  const campoTalla = (TIPO as Record<string, { campoTalla: string | null }>)[d.item_type]?.campoTalla;
  const habitual = campoTalla ? tallasHabituales[campoTalla] : null;

  function cambiarCategoria(c: Categoria) {
    const primero = TIPOS.find(t => t.categoria === c)!.id;
    setD(x => ({ ...x, category: c, item_type: primero, clothing_size: c === 'ropa' ? x.clothing_size : '' }));
  }
  function cambiarPrincipal(e: Estacion) {
    setD(x => ({ ...x, main_season: e, additional_seasons: x.additional_seasons.filter(a => a !== e) }));
  }
  function alternarAdicional(e: Estacion) {
    setD(x => ({ ...x, additional_seasons: x.additional_seasons.includes(e) ? x.additional_seasons.filter(a => a !== e) : [...x.additional_seasons, e] }));
  }

  return (
    <form className="tarjeta pila" onSubmit={e => { e.preventDefault(); onGuardar(d); }}>
      <label className="campo"><span>Nombre</span><input value={d.name} maxLength={80} onChange={e => cambiar('name', e.target.value)} placeholder="Ej. Camisa Oxford celeste" /></label>
      <div className="rejilla-2">
        <label className="campo"><span>Categoría</span>
          <select value={d.category} onChange={e => cambiarCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label className="campo"><span>Tipo</span>
          <select value={d.item_type} onChange={e => cambiar('item_type', e.target.value)} disabled={tipos.length === 1}>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
      </div>
      <label className="campo"><span>Color principal</span>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <span className="punto" style={{ width: 30, height: 30, flex: '0 0 30px', background: d.color_hex ?? COLORES.find(c => c.id === d.color)?.hex }} />
          <select value={d.color} onChange={e => setD(x => ({ ...x, color: e.target.value, color_hex: COLORES.find(c => c.id === e.target.value)?.hex ?? null }))}>
            {COLORES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </div></label>
      <div>
        <span className="campo">Estación principal</span>
        <div className="estaciones" role="group" aria-label="Estación principal" style={{ marginTop: 6 }}>
          {ESTACIONES.map(e => (
            <button type="button" key={e.id} className="estacion" aria-pressed={d.main_season === e.id} onClick={() => cambiarPrincipal(e.id)}>
              <span aria-hidden="true">{e.icono}</span>{e.nombre.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div>
        <span className="campo">También sirve en (opcional)</span>
        <div className="chips" style={{ marginTop: 6 }}>
          {ESTACIONES.filter(e => e.id !== d.main_season).map(e => (
            <button type="button" key={e.id} className="chip" aria-pressed={d.additional_seasons.includes(e.id)} onClick={() => alternarAdicional(e.id)}>{e.icono} {e.nombre}</button>
          ))}
        </div>
      </div>
      {d.category === 'ropa' && (
        <label className="campo"><span>Talla real de esta prenda (la de su etiqueta)</span>
          <input value={d.clothing_size} maxLength={12} onChange={e => cambiar('clothing_size', e.target.value.toUpperCase())} placeholder="M, L, 32, 32/32…" />
          {habitual && d.clothing_size !== habitual && (
            <button type="button" className="boton chico" style={{ marginTop: 6 }} onClick={() => cambiar('clothing_size', habitual)}>Tu talla habitual: {habitual} · usar</button>
          )}
        </label>
      )}
      <label className="campo"><span>Marca (opcional)</span><input value={d.brand_optional} maxLength={60} onChange={e => cambiar('brand_optional', e.target.value)} /></label>
      <label className="campo"><span>Notas (opcional)</span><textarea value={d.notes} maxLength={500} onChange={e => cambiar('notes', e.target.value)} placeholder={d.category === 'ropa' ? 'Ej. lavar en frío' : 'Ej. medidas del accesorio: 52 mm, 45 cm…'} /></label>
      <button className="boton primario ancho" disabled={ocupado}>{ocupado ? <span className="cargando" /> : textoBoton}</button>
    </form>
  );
}
