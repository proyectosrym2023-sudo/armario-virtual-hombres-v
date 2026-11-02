import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main className="contenedor" style={{ textAlign: 'center', padding: '80px 16px' }}>
      <h1>No encontrado</h1>
      <p className="suave">Esta página no existe o no tienes permiso para verla.</p>
      <Link href="/app" className="boton primario">Ir a mi armario</Link>
    </main>
  );
}
