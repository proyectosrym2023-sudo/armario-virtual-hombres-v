import { NextResponse } from 'next/server';
import { compararHottok } from '@/lib/hotmart';
import { recibirEvento } from '@/lib/procesar-hotmart';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// POST /api/hotmart/webhook — Hotmart Webhook v2.0.0
export async function POST(req: Request) {
  const secreto = process.env.HOTMART_HOTTOK;
  if (!secreto || !process.env.HOTMART_PRODUCT_ID) {
    console.error('webhook: faltan HOTMART_HOTTOK o HOTMART_PRODUCT_ID');
    return NextResponse.json({ ok: false, error: 'Servidor sin configurar' }, { status: 500 });
  }
  if (!compararHottok(req.headers.get('x-hotmart-hottok'), secreto)) {
    return NextResponse.json({ ok: false, error: 'Hottok inválido' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }
  try {
    const r = await recibirEvento(supabaseAdmin(), body);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('webhook', (e as Error).message);
    return NextResponse.json({ ok: false, error: 'Error temporal; reintentar' }, { status: 500 }); // Hotmart reintentará
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Solo POST' }, { status: 405 });
}
