import { Perfil } from '@/components/Perfil';
import { supabaseServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function PaginaPerfil() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  // RLS: estas consultas solo pueden devolver filas del usuario autenticado.
  const [{ data: perfil }, { data: historial }] = await Promise.all([
    sb.from('user_profiles').select('*').eq('user_id', user!.id).maybeSingle(),
    sb.from('weight_history').select('id, weight, unit, recorded_at').order('recorded_at', { ascending: true }).limit(400),
  ]);
  return (
    <>
      <h1>Mi perfil y medidas</h1>
      <p className="privado">Privado: solo tú puedes ver estos datos. No se usan en fotos, no se comparten y la IA nunca los calcula.</p>
      <Perfil perfilInicial={perfil} historialInicial={historial ?? []} />
    </>
  );
}
