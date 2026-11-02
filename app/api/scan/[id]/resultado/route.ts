import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServidor } from '@/lib/supabase/servidor';

// Registra qué corrigió el usuario respecto a la sugerencia de la IA (métrica: % de correcciones).
const Entrada = z.object({
  descartado: z.boolean().default(false),
  item_id: z.uuid().optional(),
  item_type: z.string().max(30).optional(),
  category: z.string().max(20).optional(),
  color: z.string().max(40).optional(),
  main_season: z.string().max(12).optional(),
  additional_seasons: z.array(z.string().max(12)).max(4).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
  const parsed = Entrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const f = parsed.data;

  const admin = supabaseAdmin();
  const { data: scan } = await admin.from('scans').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!scan) return NextResponse.json({ error: 'Escaneo no encontrado' }, { status: 404 });

  if (f.item_id) {
    // El artículo debe ser del mismo usuario (se verifica con su sesión: RLS).
    const { data: item } = await sb.from('wardrobe_items').select('id').eq('id', f.item_id).maybeSingle();
    if (!item) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 });
  }

  const mismo = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const corregidos: string[] = [];
  if (!f.descartado && scan.correction_status === 'pending') {
    if (!mismo(scan.detected_category, f.category)) corregidos.push('category');
    if (!mismo(scan.detected_item_type, f.item_type)) corregidos.push('item_type');
    if (!mismo(scan.detected_color, f.color)) corregidos.push('color');
    if (!mismo(scan.suggested_season, f.main_season)) corregidos.push('main_season');
    if (!mismo([...(scan.suggested_additional_seasons ?? [])].sort(), [...(f.additional_seasons ?? [])].sort())) corregidos.push('additional_seasons');
  }
  const estado = f.descartado ? 'discarded' : scan.correction_status === 'failed' ? 'failed' : corregidos.length ? 'corrected' : 'accepted';
  const { error } = await admin.from('scans').update({ correction_status: estado, corrected_fields: corregidos, item_id: f.item_id ?? null }).eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, estado, corregidos });
}
