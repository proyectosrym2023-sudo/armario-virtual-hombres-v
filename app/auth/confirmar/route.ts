import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/servidor';

// Enlaces de email (confirmación de cuenta y recuperación de contraseña).
// Acepta token_hash (funciona aunque el email se abra en OTRO dispositivo) y code (PKCE, mismo navegador).
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const siguiente = url.searchParams.get('next') ?? '/app';
  const destino = siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/app'; // sin redirecciones abiertas
  const sb = await supabaseServidor();

  const tokenHash = url.searchParams.get('token_hash');
  const tipo = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  let error: string | null = null;
  if (tokenHash && tipo) error = (await sb.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error?.message ?? null;
  else if (code) error = (await sb.auth.exchangeCodeForSession(code)).error?.message ?? null;
  else error = 'Enlace incompleto';

  if (error) return NextResponse.redirect(new URL(`/entrar?error=${encodeURIComponent('El enlace no es válido o ya expiró. Pide uno nuevo.')}`, url.origin));
  return NextResponse.redirect(new URL(destino, url.origin));
}
