'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useHidratado } from './useHidratado';
import { useRouter, useSearchParams } from 'next/navigation';
import { sb } from '@/lib/supabase/navegador';

const sitio = () => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
const MIN_PASS = 10;

export function FormAuth({ modo }: { modo: 'entrar' | 'registro' | 'recuperar' | 'restablecer' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [ocupado, setOcupado] = useState(false);
  const hidratado = useHidratado();
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(params.get('error') ? { tipo: 'error', texto: params.get('error')! } : null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    const pass = String(fd.get('password') ?? '');
    setOcupado(true); setMsg(null);
    try {
      if (modo === 'entrar') {
        const { error } = await sb().auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(error.message.includes('confirm') ? 'Confirma tu email antes de entrar (revisa tu bandeja).' : 'Email o contraseña incorrectos.');
        const volver = params.get('volver');
        router.push(volver?.startsWith('/app') ? volver : '/app');
        router.refresh();
      } else if (modo === 'registro') {
        if (pass.length < MIN_PASS) throw new Error(`La contraseña debe tener al menos ${MIN_PASS} caracteres.`);
        if (pass !== fd.get('password2')) throw new Error('Las contraseñas no coinciden.');
        const { error } = await sb().auth.signUp({ email, password: pass, options: { emailRedirectTo: `${sitio()}/auth/confirmar?next=/app` } });
        if (error) throw new Error(error.message);
        setMsg({ tipo: 'ok', texto: `Te enviamos un email a ${email}. Ábrelo para confirmar tu cuenta; tu acceso se activa solo si compraste con ese email.` });
      } else if (modo === 'recuperar') {
        await sb().auth.resetPasswordForEmail(email, { redirectTo: `${sitio()}/auth/confirmar?next=/restablecer` });
        // Misma respuesta exista o no la cuenta (no revela qué emails están registrados).
        setMsg({ tipo: 'ok', texto: 'Si existe una cuenta con ese email, te llegará un enlace para crear una contraseña nueva.' });
      } else {
        if (pass.length < MIN_PASS) throw new Error(`La contraseña debe tener al menos ${MIN_PASS} caracteres.`);
        if (pass !== fd.get('password2')) throw new Error('Las contraseñas no coinciden.');
        const { error } = await sb().auth.updateUser({ password: pass });
        if (error) throw new Error('El enlace expiró. Pide uno nuevo en "Recuperar acceso".');
        await sb().auth.signOut({ scope: 'others' }); // cierra las demás sesiones abiertas
        setMsg({ tipo: 'ok', texto: 'Contraseña actualizada. Cerramos tus otras sesiones por seguridad.' });
        setTimeout(() => router.push('/app'), 1200);
      }
    } catch (err) {
      setMsg({ tipo: 'error', texto: (err as Error).message });
    } finally { setOcupado(false); }
  }

  const titulos = { entrar: 'Entrar', registro: 'Crear cuenta', recuperar: 'Recuperar acceso', restablecer: 'Nueva contraseña' };
  return (
    <form method="post" className="tarjeta pila" onSubmit={enviar} style={{ maxWidth: 440, margin: '24px auto' }}>
      <h1 style={{ fontSize: 30 }}>{titulos[modo]}</h1>
      {modo === 'registro' && <p className="suave">Usa el <b>mismo email</b> con el que pagaste en Hotmart. Así tu suscripción se activa automáticamente.</p>}
      {modo === 'recuperar' && <p className="suave">Escribe el email de tu cuenta y te mandamos un enlace para entrar de nuevo, desde cualquier dispositivo.</p>}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
      {modo !== 'restablecer' && <label className="campo"><span>Email</span><input name="email" type="email" required autoComplete="email" /></label>}
      {modo !== 'recuperar' && (
        <label className="campo"><span>{modo === 'entrar' ? 'Contraseña' : `Contraseña (mín. ${MIN_PASS} caracteres)`}</span>
          <input name="password" type="password" required minLength={modo === 'entrar' ? 1 : MIN_PASS} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></label>
      )}
      {(modo === 'registro' || modo === 'restablecer') && (
        <label className="campo"><span>Repite la contraseña</span><input name="password2" type="password" required autoComplete="new-password" /></label>
      )}
      <button className="boton primario ancho" disabled={ocupado || !hidratado}>{ocupado ? <span className="cargando" /> : titulos[modo]}</button>
      <div className="entre">
        {modo !== 'entrar' && <Link href="/entrar">Ya tengo cuenta</Link>}
        {modo !== 'registro' && modo !== 'restablecer' && <Link href="/registro">Crear cuenta</Link>}
        {modo === 'entrar' && <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>}
      </div>
    </form>
  );
}
