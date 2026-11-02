import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clasificar, MODELO } from '@/lib/clasificar';
import { inicioMesUTC } from '@/lib/costes';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Entrada = z.object({
  imagen: z.string().min(100).max(2_000_000),
  recorte_ok: z.boolean(),
  ms_recorte: z.number().int().min(0).max(120000),
});

export async function POST(req: Request) {
  const { user, acceso } = await usuarioYAcceso();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  if (!acceso) return NextResponse.json({ error: 'Tu suscripción no está activa' }, { status: 403 });

  const parsed = Entrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Imagen ausente o demasiado grande' }, { status: 400 });
  const { imagen, recorte_ok, ms_recorte } = parsed.data;

  const admin = supabaseAdmin();
  const limite = Number(process.env.SCAN_LIMITE_MENSUAL ?? 150);
  const tope = Number(process.env.SCAN_TOPE_USD_MES ?? 2);
  const { data: mes, error: errMes } = await admin.from('scans').select('processing_cost').eq('user_id', user.id).gte('created_at', inicioMesUTC());
  if (errMes) return NextResponse.json({ error: 'No se pudo revisar tu cuota' }, { status: 500 });
  const gastado = mes.reduce((s, r) => s + Number(r.processing_cost), 0);
  const cuota = { usados: mes.length, limite, gastadoUSD: Math.round(gastado * 1e6) / 1e6, topeUSD: tope };
  if (mes.length >= limite || gastado >= tope) {
    return NextResponse.json({ error: 'Llegaste al límite de escaneos con IA de este mes. Puedes registrar prendas a mano.', cuota }, { status: 429 });
  }

  let r;
  try {
    r = await clasificar(imagen, 'image/jpeg');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from('scans').insert({ user_id: user.id, model: MODELO, correction_status: 'failed', error: msg.slice(0, 300), bg_method: 'local', bg_ok: recorte_ok, client_time: ms_recorte });
    console.error('scan', msg);
    return NextResponse.json({ error: 'La IA no respondió. Completa los datos a mano.' }, { status: 502 });
  }

  const s = r.sugerencia;
  const { data: fila, error } = await admin.from('scans').insert({
    user_id: user.id,
    processing_time: r.ms,
    client_time: ms_recorte,
    detected_category: s?.categoria ?? null,
    detected_item_type: s?.itemType ?? null,
    detected_color: s?.color ?? null,
    suggested_season: s?.estacionPrincipal ?? null,
    suggested_additional_seasons: s?.estacionesAdicionales ?? null,
    confidence: s?.confianza ?? null,
    correction_status: s ? 'pending' : 'failed',
    processing_cost: r.costo,
    model: r.modelo,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    bg_method: 'local',
    bg_ok: recorte_ok,
    error: r.error,
  }).select('id').single();
  if (error) console.error('scans insert', error.message);

  return NextResponse.json({
    scan_id: fila?.id ?? null,
    sugerencia: s,
    error: r.error,
    uso: { modelo: r.modelo, ms: r.ms, costoUSD: r.costo, tokens: r.inputTokens + r.outputTokens },
    cuota: { ...cuota, usados: cuota.usados + 1, gastadoUSD: Math.round((gastado + r.costo) * 1e6) / 1e6 },
  });
}
