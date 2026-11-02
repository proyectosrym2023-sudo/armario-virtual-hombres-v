'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const I = {
  armario: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a2 2 0 1 1 2 2c-1 0-2 .7-2 1.6V9l8 4.6c1 .6.6 2.1-.5 2.1H4.5c-1.1 0-1.5-1.5-.5-2.1L12 9"/></svg>,
  estaciones: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  escanear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></svg>,
  perfil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h10M4 17h6"/><path d="M17 14v6M20 17h-6"/></svg>,
  cuenta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>,
};

export function Navegacion() {
  const ruta = usePathname();
  const actual = (href: string) => (href === '/app' ? ruta === '/app' || ruta.startsWith('/app/prenda') : ruta.startsWith(href)) ? 'page' : undefined;
  return (
    <nav className="nav" aria-label="Secciones">
      <Link href="/app" aria-current={actual('/app')}>{I.armario}Armario</Link>
      <Link href="/app#estaciones">{I.estaciones}Estaciones</Link>
      <Link href="/app/escanear" aria-label="Escanear" style={{ display: 'grid', justifyItems: 'center' }}>
        <span className="escanear">{I.escanear}</span><span className="escanear-texto">ESCANEAR</span>
      </Link>
      <Link href="/app/perfil" aria-current={actual('/app/perfil')}>{I.perfil}Perfil</Link>
      <Link href="/app/cuenta" aria-current={actual('/app/cuenta')}>{I.cuenta}Cuenta</Link>
    </nav>
  );
}
