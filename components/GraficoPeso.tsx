import { convertirPeso, type UnidadPeso } from '@/lib/unidades';

export interface RegistroPeso { id: number; weight: number; unit: UnidadPeso; recorded_at: string }

// Gráfico de línea SVG sin librerías. Convierte todos los registros a la unidad elegida.
export function GraficoPeso({ registros, unidad }: { registros: RegistroPeso[]; unidad: UnidadPeso }) {
  if (registros.length < 2) return <p className="suave">Registra al menos dos pesos para ver la evolución.</p>;
  const puntos = registros.map(r => ({ t: new Date(r.recorded_at).getTime(), v: convertirPeso(Number(r.weight), r.unit, unidad) }));
  const W = 320, H = 170, m = { i: 34, d: 10, s: 12, b: 24 };
  const t0 = puntos[0].t, t1 = puntos[puntos.length - 1].t || t0 + 1;
  const vs = puntos.map(p => p.v), min = Math.floor(Math.min(...vs) - 1), max = Math.ceil(Math.max(...vs) + 1);
  const x = (t: number) => m.i + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.i - m.d);
  const y = (v: number) => m.s + (1 - (v - min) / Math.max(1, max - min)) * (H - m.s - m.b);
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const fecha = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return (
    <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución del peso de ${puntos[0].v} a ${puntos[puntos.length - 1].v} ${unidad}`}>
      {[min, (min + max) / 2, max].map(v => (
        <g key={v}><line x1={m.i} x2={W - m.d} y1={y(v)} y2={y(v)} /><text x={2} y={y(v) + 3}>{Math.round(v)}</text></g>
      ))}
      <path className="linea" d={d} />
      {puntos.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3} />)}
      <text x={m.i} y={H - 6}>{fecha(t0)}</text>
      <text x={W - m.d} y={H - 6} textAnchor="end">{fecha(t1)}</text>
    </svg>
  );
}
