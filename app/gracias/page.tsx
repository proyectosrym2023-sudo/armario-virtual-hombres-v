import Link from 'next/link';

// Configura esta URL como "página de agradecimiento" del producto en Hotmart.
export default function Gracias() {
  return (
    <main className="contenedor">
      <header className="cabecera"><Link href="/" className="marca">Armario Virtual</Link></header>
      <section className="tarjeta pila" style={{ maxWidth: 520, margin: '24px auto' }}>
        <span className="etiqueta">Compra recibida</span>
        <h1 style={{ fontSize: 32 }}>¡Gracias! Falta un paso.</h1>
        <ol className="pila" style={{ paddingLeft: 20 }}>
          <li>Crea tu cuenta con el <b>mismo email</b> que usaste en Hotmart.</li>
          <li>Abre el email de confirmación que te enviamos.</li>
          <li>Listo: el acceso se activa automáticamente en cuanto Hotmart confirma el pago (normalmente en segundos; con pagos en efectivo puede tardar más).</li>
        </ol>
        <Link href="/registro" className="boton primario ancho">Crear mi cuenta</Link>
        <Link href="/entrar" className="boton ancho">Ya tengo cuenta: entrar</Link>
        <p className="suave">¿No te llega el email? Revisa spam o usa <Link href="/recuperar">Recuperar acceso</Link>.</p>
      </section>
    </main>
  );
}
