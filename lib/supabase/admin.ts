import { createClient } from '@supabase/supabase-js';

// Service role: ignora RLS. SOLO en Route Handlers del servidor (webhook, escáner, borrado de cuenta).
export function supabaseAdmin() {
  if (typeof window !== 'undefined') throw new Error('supabaseAdmin no puede usarse en el navegador');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
