import Link from 'next/link';

// Se muestra cuando el SERVIDOR determina que no hay suscripción activa.
export function SinAcceso({ estado }: { estado?: string | null }) {
  const textos: Record<string, string> = {
    past_due: 'Tu pago está atrasado y el periodo pagado ya terminó.',
    canceled: 'Tu suscripción fue cancelada y el periodo pagado terminó.',
    refunded: 'Tu compra fue reembolsada.',
    chargeback: 'El acceso se cerró por un contracargo.',
    expired: 'Tu suscripción venció.',
  };
  return (
    <section className="tarjeta pila">
      <h2>Activa tu armario</h2>
      <p>{estado && textos[estado] ? textos[estado] : 'No encontramos una suscripción activa con tu email.'}</p>
      <p className="suave">Si acabas de comprar, el acceso se activa en cuanto Hotmart confirma el pago (normalmente en segundos). Usa el mismo email de la compra.</p>
      <Link href="/#planes" className="boton primario ancho">Ver planes</Link>
      <p className="privado">Tu perfil, tus medidas y tu cuenta siguen disponibles: puedes consultarlos, exportarlos o borrarlos desde Perfil y Cuenta.</p>
    </section>
  );
}
