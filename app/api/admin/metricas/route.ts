import { NextResponse } from 'next/server';
import { esAdmin } from '@/lib/admin-auth';
import { percentil, proyectar } from '@/lib/costes';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Métricas REALES del escáner a partir de la tabla scans (sin datos inventados).
export async function GET(req: Request) {
  if (!esAdmin(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const dias = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('dias') ?? 30)));
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('scans')
    .select('processing_time, client_time, processing_cost, error, correction_status, corrected_fields, bg_ok, model').gte('created_at', desde).limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const n = data.length;
  if (!n) return NextResponse.json({ dias, intentos: 0, nota: 'Sin escaneos en el periodo: no hay métricas que reportar.' });
  const exitosos = data.filter(s => !s.error);
  const revisados = data.filter(s => s.correction_status === 'accepted' || s.correction_status === 'corrected');
  const campo = (c: string) => revisados.length ? Math.round(1000 * revisados.filter(s => !(s.corrected_fields ?? []).includes(c)).length / revisados.length) / 10 : null;
  const coste = data.reduce((s, r) => s + Number(r.processing_cost), 0);
  const costeIntento = coste / n;

  return NextResponse.json({
    dias, intentos: n, exitosos: exitosos.length,
    latencia_ia_ms: { p50: percentil(data.map(s => s.processing_time ?? NaN), 0.5), p95: percentil(data.map(s => s.processing_time ?? NaN), 0.95) },
    recorte_local_ms: { p50: percentil(data.map(s => s.client_time ?? NaN), 0.5), p95: percentil(data.map(s => s.client_time ?? NaN), 0.95) },
    recorte_ok_pct: Math.round(1000 * data.filter(s => s.bg_ok).length / n) / 10,
    coste_usd: Math.round(coste * 1e4) / 1e4,
    coste_por_intento: Math.round(costeIntento * 1e6) / 1e6,
    coste_por_exitoso: exitosos.length ? Math.round((coste / exitosos.length) * 1e6) / 1e6 : null,
    revisados_por_usuario: revisados.length,
    pct_corregidos: revisados.length ? Math.round(1000 * revisados.filter(s => s.correction_status === 'corrected').length / revisados.length) / 10 : null,
    // "Acierto" = el usuario NO corrigió ese campo (aproximación: el usuario es la referencia).
    acierto_pct: { categoria: campo('category'), tipo: campo('item_type'), color: campo('color'), estacion: campo('main_season') },
    proyeccion: proyectar(costeIntento, exitosos.length / n),
  });
}
