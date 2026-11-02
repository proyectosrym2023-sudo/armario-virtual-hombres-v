import { NextResponse } from 'next/server';
import { esAdmin } from '@/lib/admin-auth';
import { aplicar } from '@/lib/procesar-hotmart';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Recuperación de notificaciones fallidas: reaplica, en orden de llegada, los eventos que quedaron sin procesar.
export async function POST(req: Request) {
  if (!esAdmin(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: pendientes, error } = await admin.from('hotmart_events')
    .select('event_id, payload').eq('processed', false).order('received_at').limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const resultados = [];
  for (const ev of pendientes ?? []) {
    try { resultados.push({ event_id: ev.event_id, ...(await aplicar(admin, ev.event_id, ev.payload)) }); }
    catch (e) { resultados.push({ event_id: ev.event_id, estado: 'error', detalle: (e as Error).message }); }
  }
  return NextResponse.json({ procesados: resultados.length, resultados });
}
