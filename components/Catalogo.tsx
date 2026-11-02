'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CATEGORIAS, COLORES, ESTACIONES, TIPO, nombreColor } from '@/lib/catalogo';
import { filtrar, rutaVisible, type Articulo } from '@/lib/armario';

export function Catalogo({ items, urls }: { items: Articulo[]; urls: Record<string, string> }) {
  const [estacion, setEstacion] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const lista = useMemo(() => filtrar(items, { estacion, categoria, color, texto }), [items, estacion, categoria, color, texto]);
  const coloresUsados = COLORES.filter(c => items.some(i => i.color === c.id));
  const conteo = (e: string) => items.filter(i => i.main_season === e || i.additional_seasons.includes(e)).length;

  return (
    <div className="pila">
      <div className="entre"><h1>Mi armario</h1><small>{items.length} artículos</small></div>

      <section id="estaciones" className="estaciones" role="group" aria-label="Estaciones">
        {ESTACIONES.map(e => (
          <button key={e.id} className="estacion" aria-pressed={estacion === e.id} onClick={() => setEstacion(estacion === e.id ? null : e.id)}>
            <span aria-hidden="true">{e.icono}</span>{e.nombre.toUpperCase()}<small style={{ fontSize: 11, opacity: .8 }}>{conteo(e.id)}</small>
          </button>
        ))}
      </section>

      <input type="search" placeholder="Buscar por nombre, marca, notas…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar" />
      <div className="chips" role="group" aria-label="Categoría">
        <button className="chip" aria-pressed={!categoria} onClick={() => setCategoria(null)}>Todo</button>
        {CATEGORIAS.map(c => <button key={c.id} className="chip" aria-pressed={categoria === c.id} onClick={() => setCategoria(categoria === c.id ? null : c.id)}>{c.nombre}</button>)}
      </div>
      {coloresUsados.length > 1 && (
        <div className="chips" role="group" aria-label="Color">
          {coloresUsados.map(c => (
            <button key={c.id} className="chip" aria-pressed={color === c.id} onClick={() => setColor(color === c.id ? null : c.id)}>
              <span className="punto" style={{ background: c.hex }} />{c.nombre}</button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <section className="tarjeta escaner-hero">
          <p>Tu armario está vacío.</p>
          <Link href="/app/escanear" className="boton primario">Escanear mi primera prenda</Link>
        </section>
      ) : lista.length === 0 ? (
        <p className="suave" style={{ textAlign: 'center', padding: 30 }}>Nada coincide con estos filtros.</p>
      ) : (
        <div className="catalogo">
          {lista.map(a => (
            <Link key={a.id} href={`/app/prenda/${a.id}`} className="articulo">
              <div className="foto">{urls[rutaVisible(a)] ? <img src={urls[rutaVisible(a)]} alt={a.name ?? ''} loading="lazy" /> : <span>👔</span>}</div>
              <div className="info">
                <b>{a.name || (TIPO as Record<string, { nombre: string }>)[a.item_type]?.nombre}</b>
                <small><span className="punto" style={{ background: a.color_hex ?? COLORES.find(c => c.id === a.color)?.hex }} />{nombreColor(a.color)}{a.clothing_size ? ` · ${a.clothing_size}` : ''}</small>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
