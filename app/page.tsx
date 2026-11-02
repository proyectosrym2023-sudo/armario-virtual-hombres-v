import Link from 'next/link';
import { DemoEscaner } from '@/components/DemoEscaner';
import { ILUSTRACIONES, Ilustracion } from '@/components/Ilustraciones';

const PLANES = [
  { id: 'mensual', nombre: 'Mensual', precio: process.env.NEXT_PUBLIC_PRECIO_MENSUAL, url: process.env.NEXT_PUBLIC_HOTMART_CHECKOUT_MENSUAL, nota: 'Cancela cuando quieras.' },
  { id: 'anual', nombre: 'Anual', precio: process.env.NEXT_PUBLIC_PRECIO_ANUAL, url: process.env.NEXT_PUBLIC_HOTMART_CHECKOUT_ANUAL, nota: 'Un solo pago al año.', destacado: true },
];

const BENEFICIOS = [
  ['Escanea en segundos', 'Toma la foto: el fondo se recorta solo y la IA sugiere el tipo de prenda, el color y la estación.'],
  ['Cuatro estaciones', 'Verano, otoño, invierno y primavera. Una prenda puede servir en varias, y tú decides.'],
  ['Encuentra cualquier prenda', 'Busca y filtra por estación, categoría y color.'],
  ['Tus tallas y medidas', 'Guarda tu peso, tus tallas habituales y tus medidas. Son privadas y editables.'],
  ['Ropa y accesorios', 'Camisas, polos, pantalones, jeans, trajes, sacos, chaquetas, abrigos, lentes, pulseras, cadenas y relojes.'],
  ['Sin descargar nada', 'Funciona en el navegador de tu celular, tablet o computadora. Sin tiendas de aplicaciones.'],
];

export default function Venta() {
  return (
    <>
      <header className="cabecera">
        <span className="marca">Armario Virtual Hombres</span>
        <Link href="/entrar" className="boton chico">Entrar</Link>
      </header>
      <main className="contenedor">
        <section className="hero">
          <div className="pila">
            <span className="etiqueta">Para hombres que quieren orden</span>
            <h1>Todo tu armario, <span>en tu celular.</span></h1>
            <p style={{ fontSize: 18 }}>Escanea tu ropa y tus accesorios. La app recorta el fondo, detecta el color y sugiere la estación. Encuentra qué ponerte sin abrir todos los cajones.</p>
            <div className="fila"><a href="#planes" className="boton primario">Ver planes</a><a href="#demo" className="boton">Probar el escáner</a></div>
          </div>
          <div className="telefono" aria-hidden="true"><div>
            <div className="estaciones" style={{ marginBottom: 10 }}>{['☀️', '🍂', '❄️', '🌱'].map((e, i) => <span key={e} className="estacion" aria-pressed={i === 1} style={{ padding: 8 }}><span>{e}</span></span>)}</div>
            <div className="catalogo" style={{ gap: 8 }}>
              {Object.keys(ILUSTRACIONES).map(id => (
                <div key={id} className="articulo" style={{ borderRadius: 14 }}><div className="foto" style={{ padding: 8 }}><Ilustracion id={id} size={70} /></div>
                  <div className="info" style={{ padding: '4px 8px 8px' }}><b style={{ fontSize: 11 }}>{ILUSTRACIONES[id].nombre}</b></div></div>
              ))}
            </div>
          </div></div>
        </section>

        <section id="demo" className="seccion">
          <h2>Demostración real del recorte</h2>
          <DemoEscaner />
        </section>

        <section className="seccion">
          <h2>Beneficios</h2>
          <div className="beneficios">{BENEFICIOS.map(([t, d]) => <div key={t} className="tarjeta"><h3 style={{ color: 'var(--marino-2)' }}>{t}</h3><p>{d}</p></div>)}</div>
        </section>

        <section className="seccion">
          <h2>Galería</h2>
          <p className="suave">Ilustraciones de cómo se ve tu catálogo.</p>
          <div className="catalogo">
            {Object.keys(ILUSTRACIONES).map(id => (
              <div key={id} className="articulo"><div className="foto"><Ilustracion id={id} /></div><div className="info"><b>{ILUSTRACIONES[id].nombre}</b></div></div>
            ))}
          </div>
        </section>

        <section className="seccion">
          <h2>Cómo funciona</h2>
          <ol className="tarjeta pila" style={{ paddingLeft: 36 }}>
            <li><b>Elige tu plan</b> y paga en Hotmart.</li>
            <li><b>Crea tu cuenta</b> con el mismo email de la compra.</li>
            <li><b>Confirma tu email.</b> El acceso se activa solo, sin esperar a nadie.</li>
            <li><b>Escanea tu primera prenda</b> y empieza a ordenar.</li>
          </ol>
        </section>

        <section id="planes" className="seccion">
          <h2>Planes</h2>
          <div className="planes">
            {PLANES.map(p => (
              <div key={p.id} className={`tarjeta pila plan ${p.destacado ? 'destacado' : ''}`}>
                <h3>{p.nombre}</h3>
                <p className="precio">{p.precio || 'Precio por confirmar'}</p>
                <p className="suave">{p.nota} Acceso completo: escáner, cuatro estaciones, perfil y medidas.</p>
                {p.url ? <a className="boton primario ancho" href={p.url} rel="noopener">Suscribirme</a>
                  : <button className="boton ancho" disabled>Próximamente</button>}
              </div>
            ))}
          </div>
          <p className="suave" style={{ marginTop: 12 }}>El pago lo procesa Hotmart. Si cancelas, conservas el acceso hasta el final del periodo pagado.</p>
        </section>

        <section className="seccion tarjeta pila">
          <h2>¿Ya compraste?</h2>
          <div className="fila"><Link href="/registro" className="boton primario">Crear mi cuenta</Link><Link href="/entrar" className="boton">Entrar</Link><Link href="/recuperar" className="boton">Recuperar acceso</Link></div>
        </section>
      </main>
      <footer className="contenedor pie">
        Armario Virtual Hombres · Tus fotos, tu peso y tus medidas son privados: solo tú puedes verlos.
      </footer>
    </>
  );
}
