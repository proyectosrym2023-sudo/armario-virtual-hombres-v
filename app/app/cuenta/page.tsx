import { AccionesCuenta } from '@/components/AccionesCuenta';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

const ESTADOS: Record<string, string> = {
  active: 'Activa', past_due: 'Pago atrasado', canceled: 'Cancelada', refunded: 'Reembolsada',
  chargeback: 'Contracargo', expired: 'Vencida', pending: 'Pendiente',
};

export default async function PaginaCuenta() {
  const { sb, user, acceso } = await usuarioYAcceso();
  const { data: subs } = await sb.from('subscriptions')
    .select('plan, subscription_status, access_enabled, current_period_end, updated_at').order('updated_at', { ascending: false });
  const s = subs?.[0];
  return (
    <div className="pila">
      <h1>Cuenta</h1>
      <section className="tarjeta pila">
        <h3>Suscripción</h3>
        {s ? (
          <ul className="lista">
            <li><span>Plan</span><b>{s.plan === 'anual' ? 'Anual' : s.plan === 'mensual' ? 'Mensual' : '—'}</b></li>
            <li><span>Estado</span><b>{ESTADOS[s.subscription_status] ?? s.subscription_status}</b></li>
            <li><span>Acceso</span><b>{acceso ? '✓ Activo' : 'Inactivo'}</b></li>
            {s.current_period_end && <li><span>{acceso ? 'Acceso hasta' : 'Terminó'}</span><b>{new Date(s.current_period_end).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</b></li>}
          </ul>
        ) : <p>No hay una suscripción asociada a <b>{user!.email}</b>. Si compraste con otro email, escríbenos desde ese email.</p>}
        <p className="suave">Para cancelar o cambiar de plan entra a tu cuenta de Hotmart (Mis compras). Si cancelas, conservas el acceso hasta el final del periodo que ya pagaste.</p>
      </section>
      <AccionesCuenta />
    </div>
  );
}
