'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

// Perezoso: se crea al primer uso (en un evento del navegador), nunca durante el render del servidor.
export function sb(): SupabaseClient {
  return (cliente ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
}
