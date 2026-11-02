import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Navegacion } from '@/components/Navegacion';
import { usuarioYAcceso } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await usuarioYAcceso();
  if (!user) redirect('/entrar');
  return (
    <>
      <header className="cabecera">
        <Link href="/app" className="marca">Armario Virtual</Link>
        <small>{user.email}</small>
      </header>
      <main className="app-main">{children}</main>
      <Navegacion />
    </>
  );
}
