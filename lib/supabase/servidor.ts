import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente con la sesión del usuario (RLS activo). Para Server Components, Route Handlers y Server Actions.
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: lista => {
        try { lista.forEach(({ name, value, options }) => almacen.set(name, value, options)); }
        catch { /* Server Component: el proxy refresca la sesión */ }
      },
    },
  });
}

export async function usuarioYAcceso() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser(); // valida el JWT contra Supabase (no confía en la cookie)
  if (!user) return { sb, user: null, acceso: false };
  const { data } = await sb.rpc('has_active_access');
  return { sb, user, acceso: data === true };
}
