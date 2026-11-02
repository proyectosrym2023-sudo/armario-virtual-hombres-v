'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase/navegador';

export function AccionesCuenta() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function salir(scope: 'local' | 'global') {
    await sb().auth.signOut({ scope });
    router.push('/entrar');
    router.refresh();
  }

  async function borrarCuenta() {
    const texto = prompt('Esto borra tu cuenta, tu armario, tus fotos, tu peso y tus medidas para siempre.\nEscribe BORRAR para confirmar:');
    if (texto !== 'BORRAR') return;
    const r = await fetch('/api/cuenta/borrar', { method: 'POST' });
    if (!r.ok) return setMsg('No se pudo borrar: ' + ((await r.json().catch(() => ({}))).error ?? r.status));
    await sb().auth.signOut();
    router.push('/?cuenta=borrada');
  }

  return (
    <>
      {msg && <p className="aviso error">{msg}</p>}
      <section className="tarjeta pila">
        <h3>Sesiones</h3>
        <button className="boton ancho" onClick={() => salir('local')}>Cerrar sesión en este dispositivo</button>
        <button className="boton ancho" onClick={() => salir('global')}>Cerrar sesión en todos los dispositivos</button>
        <a className="boton ancho" href="/recuperar">Cambiar contraseña</a>
      </section>
      <section className="tarjeta pila">
        <h3>Privacidad</h3>
        <a className="boton ancho" href="/api/cuenta/exportar">Descargar mis datos (JSON)</a>
        <button className="boton peligro ancho" onClick={borrarCuenta}>Borrar mi cuenta y todos mis datos</button>
        <p className="privado">El registro de pagos de Hotmart se conserva por obligación contable, sin tus fotos ni tus datos personales.</p>
      </section>
    </>
  );
}
