import { Escaner } from '@/components/Escaner';
import { SinAcceso } from '@/components/SinAcceso';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function PaginaEscanear() {
  const { sb, user, acceso } = await usuarioYAcceso();
  if (!acceso) {
    const { data: sub } = await sb.from('subscriptions').select('subscription_status').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return <SinAcceso estado={sub?.subscription_status} />;
  }
  const { data: perfil } = await sb.from('user_profiles')
    .select('shirt_size, polo_size, trouser_size, jeans_size, shorts_size, jacket_size, blazer_size, suit_size, sportswear_size')
    .eq('user_id', user!.id).maybeSingle();
  return (
    <>
      <h1>Escanear</h1>
      <Escaner tallasHabituales={perfil ?? {}} userId={user!.id} />
    </>
  );
}
