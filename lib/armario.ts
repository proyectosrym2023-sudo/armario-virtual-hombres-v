import type { SupabaseClient } from '@supabase/supabase-js';

export interface Articulo {
  id: string; category: string; item_type: string; name: string | null; color: string; color_hex: string | null;
  main_season: string; additional_seasons: string[]; clothing_size: string | null; brand_optional: string | null;
  notes: string | null; created_at: string; updated_at: string;
  item_images: { original_path: string; processed_path: string | null; processing_status: string } | null;
}

export const COLUMNAS = 'id, category, item_type, name, color, color_hex, main_season, additional_seasons, clothing_size, brand_optional, notes, created_at, updated_at, item_images(original_path, processed_path, processing_status)';

// URLs firmadas de 1 hora: el bucket es privado y el usuario solo puede firmar sus propios archivos (RLS de storage).
export async function firmarFotos(sb: SupabaseClient, rutas: string[]): Promise<Record<string, string>> {
  const unicas = [...new Set(rutas.filter(Boolean))];
  if (!unicas.length) return {};
  const { data } = await sb.storage.from('wardrobe').createSignedUrls(unicas, 3600);
  return Object.fromEntries((data ?? []).flatMap(d => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])));
}

export const rutaVisible = (a: Articulo) => a.item_images?.processed_path ?? a.item_images?.original_path ?? '';

// Filtro del armario: una prenda aparece en una estación si es su principal O una adicional.
export function filtrar(items: Articulo[], f: { estacion?: string | null; categoria?: string | null; color?: string | null; texto?: string | null }) {
  const t = (f.texto ?? '').trim().toLowerCase();
  return items.filter(a =>
    (!f.estacion || a.main_season === f.estacion || a.additional_seasons.includes(f.estacion)) &&
    (!f.categoria || a.category === f.categoria) &&
    (!f.color || a.color === f.color) &&
    (!t || [a.name, a.item_type, a.brand_optional, a.notes, a.color].join(' ').toLowerCase().includes(t)));
}
