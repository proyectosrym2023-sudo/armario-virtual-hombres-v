'use client';
import { useState } from 'react';
import { useHidratado } from './useHidratado';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase/navegador';
import { TALLAS_LETRA } from '@/lib/catalogo';
import {
  MEDIDAS_ACCESORIOS, MEDIDAS_CORPORALES, convertirPeso, normalizarTalla, validarAccesorio, validarMedida, validarPeso,
  type ClaveMedida, type UnidadLongitud, type UnidadPeso,
} from '@/lib/unidades';
import { GraficoPeso, type RegistroPeso } from './GraficoPeso';

type Medida = { value: number; unit: string };
type PerfilDB = Record<string, any> & { measurements: Record<string, Medida> };

const CAMPOS_TALLA = [
  ['polo_size', 'Polo / polera'], ['shirt_size', 'Camisa'], ['trouser_size', 'Pantalón'], ['jeans_size', 'Jeans'],
  ['shorts_size', 'Shorts'], ['jacket_size', 'Chaqueta'], ['blazer_size', 'Saco'], ['suit_size', 'Traje'], ['sportswear_size', 'Ropa deportiva'],
] as const;

export function Perfil({ perfilInicial, historialInicial }: { perfilInicial: PerfilDB | null; historialInicial: RegistroPeso[] }) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilDB>(perfilInicial ?? { measurements: {}, weight_unit: 'kg', preferred_measurement_unit: 'cm', size_system: 'letras' });
  const [historial, setHistorial] = useState(historialInicial);
  const [unidadPeso, setUnidadPeso] = useState<UnidadPeso>((perfil.weight_unit as UnidadPeso) ?? 'kg');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const hidratado = useHidratado();

  const avisar = (tipo: 'ok' | 'error', texto: string) => { setMensaje({ tipo, texto }); setTimeout(() => setMensaje(null), 4000); };

  async function registrarPeso(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const valor = Number(fd.get('peso'));
    const error = validarPeso(valor, unidadPeso);
    if (error) return avisar('error', error);
    setOcupado(true);
    const { data: { user } } = await sb().auth.getUser();
    const { data, error: err } = await sb().from('weight_history')
      .insert({ user_id: user!.id, weight: valor, unit: unidadPeso, recorded_at: String(fd.get('fecha')) })
      .select('id, weight, unit, recorded_at').single();
    setOcupado(false);
    if (err) return avisar('error', 'No se pudo guardar: ' + err.message);
    setHistorial(h => [...h, data as RegistroPeso].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)));
    (e.target as HTMLFormElement).reset();
    avisar('ok', 'Peso registrado');
    router.refresh();
  }

  async function borrarPeso(id: number) {
    if (!confirm('¿Borrar este registro de peso?')) return;
    const { error } = await sb().from('weight_history').delete().eq('id', id);
    if (error) return avisar('error', error.message);
    setHistorial(h => h.filter(r => r.id !== id));
  }

  async function guardarTallas(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const cambios: Record<string, string | null> = { size_system: String(fd.get('size_system')) };
      for (const [k] of CAMPOS_TALLA) cambios[k] = normalizarTalla(fd.get(k));
      await guardar(cambios, 'Tallas guardadas');
    } catch (err) { avisar('error', (err as Error).message); }
  }

  async function guardarMedidas(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const m: Record<string, Medida> = {};
    for (const k of Object.keys(MEDIDAS_CORPORALES) as ClaveMedida[]) {
      const v = fd.get(k), u = String(fd.get(k + '_u')) as UnidadLongitud;
      if (v === '' || v === null) continue;
      const err = validarMedida(k, v, u);
      if (err) return avisar('error', `${MEDIDAS_CORPORALES[k].nombre}: ${err}`);
      m[k] = { value: Number(v), unit: u };
    }
    for (const k of Object.keys(MEDIDAS_ACCESORIOS) as (keyof typeof MEDIDAS_ACCESORIOS)[]) {
      const v = fd.get(k), u = String(fd.get(k + '_u')) as 'cm' | 'in' | 'mm';
      if (v === '' || v === null) continue;
      const err = validarAccesorio(k, v, u);
      if (err) return avisar('error', `${MEDIDAS_ACCESORIOS[k].nombre}: ${err}`);
      m[k] = { value: Number(v), unit: u };
    }
    await guardar({ measurements: m, preferred_measurement_unit: String(fd.get('preferida')) }, 'Medidas guardadas');
  }

  async function guardar(cambios: Record<string, unknown>, ok: string) {
    setOcupado(true);
    const { data, error } = await sb().from('user_profiles').update(cambios).eq('user_id', perfil.user_id).select('*').single();
    setOcupado(false);
    if (error) return avisar('error', 'No se pudo guardar: ' + error.message);
    setPerfil(data as PerfilDB);
    avisar('ok', ok);
  }

  async function borrarTodo() {
    if (!confirm('Se borrarán tu peso, tu historial, tus tallas y tus medidas. Tu armario no se toca. ¿Continuar?')) return;
    const { error } = await sb().rpc('borrar_datos_personales');
    if (error) return avisar('error', error.message);
    setHistorial([]);
    setPerfil(p => ({ ...p, weight: null, measurements: {}, ...Object.fromEntries(CAMPOS_TALLA.map(([k]) => [k, null])) }));
    avisar('ok', 'Datos personales borrados');
  }

  const medida = (k: string) => perfil.measurements?.[k];
  const ultimo = historial[historial.length - 1];
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="pila">
      {mensaje && <p className={`aviso ${mensaje.tipo}`} role="status">{mensaje.texto}</p>}

      <section className="tarjeta pila" aria-labelledby="t-peso">
        <div className="entre"><h3 id="t-peso">Peso corporal (opcional)</h3>
          <div className="fila" role="group" aria-label="Unidad de peso">
            {(['kg', 'lb'] as const).map(u => <button key={u} type="button" className="chip" aria-pressed={unidadPeso === u} onClick={() => setUnidadPeso(u)}>{u}</button>)}
          </div></div>
        <p><span className="cifra">{ultimo ? `${convertirPeso(Number(ultimo.weight), ultimo.unit, unidadPeso)} ${unidadPeso}` : '—'}</span>
          <small>{ultimo ? `Último registro: ${new Date(ultimo.recorded_at + 'T12:00:00').toLocaleDateString('es')}` : 'Sin registros'}</small></p>
        <GraficoPeso registros={historial} unidad={unidadPeso} />
        <form method="post"onSubmit={registrarPeso} className="rejilla-2">
          <label className="campo"><span>Peso actual ({unidadPeso})</span><input name="peso" type="number" step="0.1" inputMode="decimal" required /></label>
          <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={hoy} max={hoy} required /></label>
          <button className="boton primario" disabled={ocupado || !hidratado} style={{ gridColumn: '1 / -1' }}>Registrar peso</button>
        </form>
        {historial.length > 0 && (
          <details><summary>Historial ({historial.length})</summary>
            <ul className="lista">{[...historial].reverse().map(r => (
              <li key={r.id}><span>{new Date(r.recorded_at + 'T12:00:00').toLocaleDateString('es')}</span>
                <span>{Number(r.weight)} {r.unit} <button className="boton chico peligro" onClick={() => borrarPeso(r.id)} aria-label="Borrar registro">✕</button></span></li>
            ))}</ul></details>
        )}
      </section>

      <form method="post"className="tarjeta pila" onSubmit={guardarTallas} aria-labelledby="t-tallas">
        <h3 id="t-tallas">Mis tallas habituales</h3>
        <p className="suave">Son tu referencia al registrar prendas. Cada marca y país mide distinto: confirma siempre la talla real de cada prenda.</p>
        <label className="campo"><span>Sistema preferido</span>
          <select name="size_system" defaultValue={perfil.size_system ?? 'letras'}>
            <option value="letras">Letras (XS–XXXL)</option><option value="numerico">Numérico (ej. 32, 40, 50)</option><option value="mixto">Mixto</option>
          </select></label>
        <datalist id="tallas-letra">{TALLAS_LETRA.map(t => <option key={t} value={t} />)}</datalist>
        <div className="rejilla-2">
          {CAMPOS_TALLA.map(([k, n]) => (
            <label key={k} className="campo"><span>{n}</span><input name={k} list="tallas-letra" maxLength={12} defaultValue={perfil[k] ?? ''} placeholder="M, L, 32, 32/32…" /></label>
          ))}
        </div>
        <button className="boton primario" disabled={ocupado || !hidratado}>Guardar tallas</button>
      </form>

      <form method="post"className="tarjeta pila" onSubmit={guardarMedidas} aria-labelledby="t-medidas">
        <h3 id="t-medidas">Medidas corporales (opcionales)</h3>
        <label className="campo"><span>Unidad preferida</span>
          <select name="preferida" defaultValue={perfil.preferred_measurement_unit ?? 'cm'}><option value="cm">Centímetros</option><option value="in">Pulgadas</option></select></label>
        <div className="rejilla-2">
          {(Object.entries(MEDIDAS_CORPORALES) as [ClaveMedida, { nombre: string }][]).map(([k, d]) => (
            <label key={k} className="campo"><span>{d.nombre}</span>
              <div className="fila" style={{ flexWrap: 'nowrap' }}>
                <input name={k} type="number" step="0.1" inputMode="decimal" defaultValue={medida(k)?.value ?? ''} />
                <select name={k + '_u'} defaultValue={medida(k)?.unit ?? perfil.preferred_measurement_unit ?? 'cm'} style={{ width: 80 }} aria-label={`Unidad de ${d.nombre}`}>
                  <option value="cm">cm</option><option value="in">in</option></select>
              </div></label>
          ))}
        </div>
        <h3>Accesorios: dimensiones físicas, no tallas de ropa</h3>
        <div className="rejilla-2">
          {(Object.entries(MEDIDAS_ACCESORIOS) as [keyof typeof MEDIDAS_ACCESORIOS, { nombre: string; unidad: string }][]).map(([k, d]) => (
            <label key={k} className="campo"><span>{d.nombre}</span>
              <div className="fila" style={{ flexWrap: 'nowrap' }}>
                <input name={k} type="number" step="0.1" inputMode="decimal" defaultValue={medida(k)?.value ?? ''} />
                <select name={k + '_u'} defaultValue={medida(k)?.unit ?? d.unidad} style={{ width: 80 }} aria-label={`Unidad de ${d.nombre}`}>
                  {(d.unidad === 'mm' ? ['mm'] : ['cm', 'in']).map(u => <option key={u}>{u}</option>)}</select>
              </div></label>
          ))}
        </div>
        <button className="boton primario" disabled={ocupado || !hidratado}>Guardar medidas</button>
      </form>

      <section className="tarjeta pila">
        <h3>Borrar mis datos personales</h3>
        <p className="suave">Borra el peso, el historial, las tallas y las medidas. Para borrar la cuenta completa, ve a Cuenta.</p>
        <button className="boton peligro" onClick={borrarTodo}>Borrar peso, tallas y medidas</button>
      </section>
    </div>
  );
}
