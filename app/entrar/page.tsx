import Link from 'next/link';
import { Suspense } from 'react';
import { FormAuth } from '@/components/FormAuth';

export default function Pagina() {
  return (
    <main className="contenedor">
      <header className="cabecera"><Link href="/" className="marca">Armario Virtual</Link></header>
      <Suspense><FormAuth modo="entrar" /></Suspense>
    </main>
  );
}
