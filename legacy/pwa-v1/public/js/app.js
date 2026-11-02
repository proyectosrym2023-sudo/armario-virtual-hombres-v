import * as C from './core.js';
import { db } from './db.js';
import * as IMG from './imagen.js';
import * as N from './nube.js';

const CFG = window.AVH_CONFIG || {};
const QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const LIMITE_MALETA_G = 10000; // equipaje de mano típico
const $ = (s, r = document) => r.querySelector(s);
const vista = $('#vista');
const { esc } = C;

const estado = {
  acceso: { modo: 'demo' },
  ajustes: null,
  prendas: [],
  medidas: {},
  cajas: [],
  filtro: { estacion: undefined, categoria: '', texto: '' },
  seleccion: new Set(),
  modoSeleccion: false,
  borrador: null,
  login: { email: '', enviado: false },
  urls: new Map(),
};

// ---------- utilidades ----------
let temporizador;
function aviso(msg, tipo = '') {
  const el = $('#aviso');
  el.textContent = msg;
  el.className = 'visible ' + tipo;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (el.className = ''), tipo === 'error' ? 5000 : 2800);
}
const kg = g => (g / 1000).toLocaleString('es', { maximumFractionDigits: 1 }) + ' kg';
const usd = v => '$' + Number(v || 0).toFixed(v < 0.1 ? 4 : 2) + ' USD';
const dinero = v => '$' + Number(v || 0).toLocaleString('es', { maximumFractionDigits: 2 });
const hemisferio = () => C.PAISES[estado.ajustes.pais]?.hemisferio || 'N';
const estacionHoy = () => C.estacionActual(new Date(), hemisferio());
const nombreEstacion = id => C.ESTACIONES.find(e => e.id === id)?.nombre || '';
const iaDisponible = () => N.configurado() && navigator.onLine && estado.acceso.modo === 'ok';

async function urlMini(id) {
  if (estado.urls.has(id)) return estado.urls.get(id);
  const f = await db.foto(id);
  if (!f?.mini) return null;
  const u = URL.createObjectURL(f.mini);
  estado.urls.set(id, u);
  return u;
}
function olvidarUrl(id) {
  const u = estado.urls.get(id);
  if (u) URL.revokeObjectURL(u);
  estado.urls.delete(id);
}
async function hidratarFotos() {
  for (const img of vista.querySelectorAll('img[data-mini]')) {
    const u = await urlMini(img.dataset.mini);
    if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { textContent: '👕' }));
  }
}
function cargarScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error('Sin conexión para cargar el generador QR'));
    document.head.appendChild(s);
  });
}
function descargar(nombre, contenido, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const blobADataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

// ---------- acceso: modo demo / login / pago / ok ----------
async function verificarAcceso() {
  if (!N.configurado()) return { modo: 'demo' };
  const cache = await db.leer('licencia');
  const graciaOk = cache?.activa && (Date.now() - new Date(cache.verificadaEn).getTime()) / 864e5 <= (CFG.DIAS_GRACIA_OFFLINE ?? 30);
  if (!navigator.onLine) return graciaOk ? { modo: 'ok', email: cache.email, offline: true } : { modo: 'sin_red' };
  try {
    const s = await N.sesion();
    if (!s) return { modo: 'login' };
    const lic = await N.licencia();
    await db.escribir('licencia', { ...lic, email: s.user.email, verificadaEn: new Date().toISOString() });
    if (!lic.activa) {
      // bloqueo_sesion (reembolso / contracargo): se cierra la sesión; los datos locales siguen siendo del usuario.
      if (['reembolsada', 'bloqueada'].includes(lic.estado)) await N.salir();
      return { modo: 'pago', email: s.user.email, lic };
    }
    return { modo: 'ok', email: s.user.email, lic };
  } catch (e) {
    console.warn('No se pudo verificar la licencia', e);
    return graciaOk ? { modo: 'ok', email: cache.email, offline: true } : { modo: 'login', error: e.message };
  }
}

function vistaLogin() {
  const l = estado.login;
  return `
  <section class="panel pila">
    <h2>Entra a tu armario</h2>
    <p class="ayuda">Usa el mismo email con el que compraste en Hotmart. Te mandamos un código de 6 dígitos (no hay contraseñas).</p>
    ${estado.acceso.error ? `<p class="aviso-sup">${esc(estado.acceso.error)}</p>` : ''}
    <form data-form="login" class="pila">
      <label class="campo">Email<input name="email" type="email" required autocomplete="email" value="${esc(l.email)}" ${l.enviado ? 'readonly' : ''}></label>
      ${l.enviado ? `<label class="campo">Código<input name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" required></label>` : ''}
      <button class="boton primario grande">${l.enviado ? 'Entrar' : 'Enviarme el código'}</button>
      ${l.enviado ? `<button type="button" class="boton" data-accion="otro-email">Usar otro email</button>` : ''}
    </form>
  </section>
  ${vistaPrecio()}`;
}

function vistaPrecio() {
  const precio = C.precioLocal(estado.ajustes.pais);
  return `
  <section class="panel pila">
    <h3>Acceso</h3>
    <p class="cifra">${precio}</p>
    <p class="ayuda">Pago único en Hotmart. Incluye el escáner con IA (con un límite mensual de uso justo), el respaldo opcional en la nube y el uso offline ilimitado.</p>
    ${CFG.HOTMART_CHECKOUT_URL ? `<a class="boton primario grande" href="${esc(CFG.HOTMART_CHECKOUT_URL)}" target="_blank" rel="noopener">Comprar acceso</a>` : '<p class="ayuda">Enlace de compra pendiente de configurar.</p>'}
  </section>`;
}

function vistaPago() {
  const lic = estado.acceso.lic || {};
  const bloqueo = ['reembolsada', 'bloqueada'].includes(lic.estado);
  const textos = {
    sin_compra: 'No encontramos una compra con este email.',
    pendiente: 'Tu pago todavía está pendiente. En cuanto Hotmart lo apruebe, tu acceso se activa solo.',
    cancelada: 'Tu suscripción fue cancelada.',
    reembolsada: 'Tu compra fue reembolsada y el acceso se cerró.',
    bloqueada: 'El acceso se cerró por un contracargo o una disputa.',
  };
  return `
  <section class="panel pila">
    <h2>${bloqueo ? 'Acceso cerrado' : 'Activa tu acceso'}</h2>
    <p>${esc(textos[lic.estado] || textos.sin_compra)}</p>
    <p class="ayuda">Cuenta: ${esc(estado.acceso.email || '')}</p>
    <button class="boton" data-accion="revisar-licencia">Ya pagué, revisar otra vez</button>
    <button class="boton" data-accion="exportar">Exportar mis datos del teléfono</button>
    <button class="boton" data-accion="salir">Cerrar sesión</button>
  </section>
  ${bloqueo ? '' : vistaPrecio()}`;
}

// ---------- bienvenida (primer uso) ----------
function vistaBienvenida() {
  const a = estado.ajustes;
  return `
  <section class="panel pila">
    <h2>Tu armario, en tu teléfono</h2>
    <p>Escanea tu ropa, la app la recorta sola y la ordena por estación, talla y peso. Funciona sin internet.</p>
    <form data-form="bienvenida" class="pila">
      <label class="campo">¿Dónde vives? (para tus estaciones y tallas)
        <select name="pais">${opcionesPais(a.pais)}</select></label>
      <label class="interruptor"><input type="checkbox" name="usarIA" ${a.usarIA ? 'checked' : ''}>
        <span>Clasificar mis prendas con IA<small>Solo la foto de la prenda se envía a la API de Anthropic (Claude) para identificarla. No la guardamos en nuestros servidores.</small></span></label>
      <p class="privacidad">🔒 Tus fotos, medidas y peso se guardan solo en este teléfono. El respaldo en la nube está apagado hasta que tú lo enciendas.</p>
      <button class="boton primario grande">Empezar</button>
    </form>
  </section>`;
}
function opcionesPais(sel) {
  return Object.entries(C.PAISES).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
    .map(([k, p]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
}

// ---------- ARMARIO ----------
function prendasFiltradas() {
  const f = estado.filtro;
  const t = f.texto.trim().toLowerCase();
  return C.prendasParaEstacion(estado.prendas, f.estacion)
    .filter(p => !f.categoria || p.categoria === f.categoria)
    .filter(p => !t || [p.nombre, p.color, p.marca, p.notas].join(' ').toLowerCase().includes(t))
    .sort((a, b) => (b.creadaEn || '').localeCompare(a.creadaEn || ''));
}

function vistaArmario() {
  if (estado.filtro.estacion === undefined) estado.filtro.estacion = estacionHoy();
  const f = estado.filtro;
  const lista = prendasFiltradas();
  const pais = C.PAISES[estado.ajustes.pais];
  const sel = estado.prendas.filter(p => estado.seleccion.has(p.id));
  const pesoSel = C.pesoTotal(sel);
  return `
  <div class="entre"><h1>Mi armario</h1>
    <button class="boton chico" data-accion="modo-seleccion">${estado.modoSeleccion ? 'Listo' : 'Seleccionar'}</button></div>
  <p class="ayuda">${C.ESTACIONES.find(e => e.id === estacionHoy()).icono} Hoy es ${nombreEstacion(estacionHoy()).toLowerCase()} en ${esc(pais?.nombre || '')}${pais?.tropical ? ' (clima tropical: úsalo como guía de lluvias/secas)' : ''}.</p>
  <div class="chips" role="toolbar" aria-label="Estación">
    <button class="chip" data-accion="estacion" data-v="" aria-pressed="${!f.estacion}">Todas</button>
    ${C.ESTACIONES.map(e => `<button class="chip" data-accion="estacion" data-v="${e.id}" aria-pressed="${f.estacion === e.id}">${e.icono} ${e.nombre}</button>`).join('')}
  </div>
  <div class="dos" style="margin:8px 0 12px">
    <select data-filtro="categoria" aria-label="Categoría"><option value="">Todas las prendas</option>
      ${C.CATEGORIAS.map(c => `<option value="${c.id}" ${f.categoria === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select>
    <input data-filtro="texto" type="search" placeholder="Buscar…" value="${esc(f.texto)}" aria-label="Buscar">
  </div>
  <p class="ayuda">${lista.length} de ${estado.prendas.length} prendas · ${kg(C.pesoTotal(lista))}</p>
  ${estado.prendas.length === 0 ? `
    <div class="vacio"><span>👕</span><p>Tu armario está vacío.</p><a class="boton primario" href="#escanear">Escanear mi primera prenda</a></div>`
  : lista.length === 0 ? `<div class="vacio"><p>Nada con estos filtros.</p></div>` : `
  <div class="rejilla">${lista.map(tarjeta).join('')}</div>`}
  ${estado.modoSeleccion ? `
  <div style="height:64px"></div>
  <div class="barra-sel">
    <div class="entre"><span><b>${sel.length}</b> · ${kg(pesoSel)} ${pesoSel > LIMITE_MALETA_G ? '⚠️ excede 10 kg de mano' : sel.length ? '✓ cabe en maleta de mano' : ''}</span>
      <button class="boton chico primario" data-accion="crear-caja" ${sel.length ? '' : 'disabled'}>Caja QR</button></div>
  </div>` : ''}`;
}

function tarjeta(p) {
  const aj = C.evaluarAjuste(p, estado.medidas);
  const elegida = estado.seleccion.has(p.id);
  return `
  <button class="tarjeta ${elegida ? 'elegida' : ''}" data-accion="${estado.modoSeleccion ? 'elegir' : 'abrir'}" data-id="${p.id}">
    <div class="foto"><img data-mini="${p.id}" alt=""></div>
    ${elegida ? '<span class="marca-sel">✓</span>' : ''}
    <div class="info"><b>${esc(p.nombre || C.CATEGORIA[p.categoria]?.nombre)}</b>
      <small><span class="punto" style="background:${esc(p.colorHex || 'transparent')}"></span> ${esc(p.talla || 's/talla')} · ${(p.pesoG || C.pesoEstimado(p.categoria))} g</small>
      ${aj ? `<span class="insignia ${aj}">${{ ok: 'Te queda', grande: 'Grande', chica: 'Chica' }[aj]}</span>` : ''}</div>
  </button>`;
}

// ---------- ESCANEAR ----------
function vistaEscanear() {
  const b = estado.borrador;
  if (b) return vistaBorrador(b);
  const motivo = !N.configurado() ? 'Modo demo: IA no configurada' : !navigator.onLine ? 'Sin internet: la clasificas tú' : estado.acceso.modo !== 'ok' ? 'Requiere acceso activo' : '';
  return `
  <h1>Escanear prenda</h1>
  <section class="panel pila">
    <p class="ayuda">Extiende la prenda sobre un fondo liso (cama, piso o pared) y toma la foto desde arriba, sin personas en la imagen.</p>
    <label class="boton primario grande">📷 Tomar foto<input type="file" accept="image/*" capture="environment" data-entrada="foto" hidden></label>
    <label class="boton grande">🖼️ Elegir de la galería<input type="file" accept="image/*" data-entrada="foto" hidden></label>
    <label class="interruptor"><input type="checkbox" id="op-fondo" checked><span>Quitar fondo y recortar solo<small>Se hace en tu teléfono, sin internet.</small></span></label>
    <label class="interruptor"><input type="checkbox" id="op-ia" ${estado.ajustes.usarIA && !motivo ? 'checked' : ''} ${motivo ? 'disabled' : ''}>
      <span>Clasificar con IA<small>${motivo || 'Tipo, color, estaciones, peso y talla visible. Se envía solo esta foto.'}</small></span></label>
  </section>
  <p class="privacidad">🔒 La foto original no se guarda: solo la prenda recortada, en este teléfono.</p>`;
}

function vistaBorrador(b) {
  const u = b.uso;
  return `
  <h1>Nueva prenda</h1>
  <div class="foto grande"><img src="${b.previewUrl}" alt="Prenda recortada"></div>
  ${!b.mascaraOk && b.conFondo === false ? '<p class="aviso-sup">No pude separar el fondo. Con un fondo liso sale mucho mejor. Guardé la foto completa.</p>' : ''}
  ${b.errorIA ? `<p class="aviso-sup">La IA no respondió (${esc(b.errorIA)}). Completa los datos a mano.</p>` : ''}
  ${b.noEsPrenda ? '<p class="aviso-sup">La IA no ve una prenda clara en la foto. Revisa los datos.</p>' : ''}
  ${u ? `<p class="ayuda">🤖 ${esc(u.modelo)} · ${u.input_tokens + u.output_tokens} tokens · <b>${usd(u.costo_usd)}</b> este escaneo${u.cuota ? ` · ${u.cuota.usados}/${u.cuota.limite} escaneos este mes` : ''}</p>` : ''}
  ${formPrenda(b.datos, 'guardar-nueva')}
  <button class="boton" data-accion="descartar" style="width:100%;margin-top:8px">Descartar</button>`;
}

function formPrenda(p, accion) {
  const est = p.estaciones || [];
  return `
  <form data-form="${accion}" class="panel pila">
    <label class="campo">Nombre<input name="nombre" maxlength="60" value="${esc(p.nombre)}" placeholder="Ej. Camisa Oxford azul"></label>
    <div class="dos">
      <label class="campo">Tipo<select name="categoria">${C.CATEGORIAS.map(c => `<option value="${c.id}" ${p.categoria === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select></label>
      <label class="campo">Formalidad<select name="formalidad">${[['casual', 'Casual'], ['smart_casual', 'Smart casual'], ['formal', 'Formal'], ['deportivo', 'Deportivo']].map(([v, t]) => `<option value="${v}" ${p.formalidad === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="dos">
      <label class="campo">Color<input name="color" maxlength="30" value="${esc(p.color)}"></label>
      <label class="campo">Tono<input name="colorHex" type="color" value="${esc(p.colorHex || '#888888')}"></label>
    </div>
    <div><span class="campo">Estaciones</span>
      <div class="chips" style="margin-top:4px">${C.ESTACIONES.map(e => `<label class="chip"><input type="checkbox" name="estaciones" value="${e.id}" ${est.includes(e.id) ? 'checked' : ''}>${e.icono} ${e.nombre}</label>`).join('')}</div>
      <small>Sin ninguna marcada = todo el año.</small></div>
    <div class="dos">
      <label class="campo">Talla<input name="talla" maxlength="10" value="${esc(p.talla)}" placeholder="M, 32, 27…"></label>
      <label class="campo">Sistema<select name="sistemaTalla">${['MX', 'US', 'EU', 'BR'].map(s => `<option ${(p.sistemaTalla || C.PAISES[estado.ajustes.pais]?.tallas) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    </div>
    <div class="dos">
      <label class="campo">Peso (g)<input name="pesoG" type="number" min="1" max="5000" inputmode="numeric" value="${esc(p.pesoG || C.pesoEstimado(p.categoria))}" ${p.pesoG ? '' : 'data-auto="1"'}></label>
      <label class="campo">Precio pagado<input name="precio" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(p.precio ?? '')}"></label>
    </div>
    <div class="dos">
      <label class="campo">Marca<input name="marca" maxlength="40" value="${esc(p.marca)}"></label>
      <label class="campo">Patrón<select name="patron">${['liso', 'rayas', 'cuadros', 'estampado', 'otro'].map(v => `<option ${p.patron === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <label class="campo">Notas<textarea name="notas" maxlength="300">${esc(p.notas)}</textarea></label>
    <button class="boton primario grande">Guardar</button>
  </form>`;
}

function leerForm(form) {
  const fd = new FormData(form);
  const num = k => (fd.get(k) === '' || fd.get(k) === null ? null : Number(fd.get(k)));
  return {
    nombre: fd.get('nombre').trim(),
    categoria: fd.get('categoria'),
    formalidad: fd.get('formalidad'),
    color: fd.get('color').trim(),
    colorHex: fd.get('colorHex'),
    estaciones: fd.getAll('estaciones'),
    talla: fd.get('talla').trim().toUpperCase(),
    sistemaTalla: fd.get('sistemaTalla'),
    pesoG: num('pesoG'),
    precio: num('precio'),
    marca: fd.get('marca').trim(),
    patron: fd.get('patron'),
    notas: fd.get('notas').trim(),
  };
}

async function alElegirFoto(file) {
  const conFondo = !$('#op-fondo').checked;
  const opIA = $('#op-ia');
  const usarIA = opIA && opIA.checked && !opIA.disabled;
  vista.innerHTML = `<p class="vacio"><span class="cargando"></span><br>${usarIA ? 'Recortando y clasificando…' : 'Recortando…'}</p>`;
  try {
    const r = await IMG.procesarFoto(file, { conFondo });
    let clasif = null, uso = null, errorIA = null;
    if (usarIA) {
      try {
        const res = await N.escanear(r.paraIA, estado.ajustes.pais, estacionHoy());
        clasif = C.normalizarClasificacion(res.clasificacion);
        uso = { ...res.uso, cuota: res.cuota };
        const log = await db.leer('ia_log', []);
        log.push({ fecha: new Date().toISOString(), usd: res.uso.costo_usd, tokens: res.uso.input_tokens + res.uso.output_tokens, modelo: res.uso.modelo });
        await db.escribir('ia_log', log.slice(-500));
        await db.escribir('ia_cuota', res.cuota);
      } catch (e) {
        errorIA = e.message;
      }
    }
    let final = r.final;
    if (!r.mascaraOk && clasif?.bbox) final = IMG.recortar(r.base, IMG.bboxDesdeNormalizado(r.base, clasif.bbox), 0.02);
    const datos = clasif ? { ...clasif } : { categoria: 'otro', nombre: '', estaciones: [], formalidad: 'casual', patron: 'liso', talla: '', marca: '', color: '' };
    if (!datos.colorHex) datos.colorHex = r.colorHex;
    estado.borrador = {
      id: crypto.randomUUID(), canvas: final, previewUrl: final.toDataURL('image/png'), datos, uso, errorIA,
      mascaraOk: r.mascaraOk, conFondo, noEsPrenda: clasif && !clasif.esPrenda, fuente: clasif ? 'ia' : 'manual',
    };
  } catch (e) {
    console.error(e);
    aviso('No pude leer esa imagen: ' + e.message, 'error');
  }
  render();
}

async function guardarNueva(form) {
  const b = estado.borrador;
  const datos = leerForm(form);
  const prenda = { id: b.id, ...datos, usos: 0, ultimoUso: null, creadaEn: new Date().toISOString(), fuente: b.fuente, fotoCambiada: true };
  const foto = await IMG.aBlob(b.canvas, 'image/webp', 0.85);
  const mini = await IMG.aBlob(IMG.redimensionar(b.canvas, 320), 'image/webp', 0.8);
  await db.guardarFoto(prenda.id, { foto, mini });
  await db.guardarPrenda(prenda);
  estado.borrador = null;
  await recargarPrendas();
  aviso('Prenda guardada ✓');
  respaldoSilencioso();
  location.hash = '#armario';
}

// ---------- DETALLE ----------
async function vistaPrenda(id) {
  const p = await db.prenda(id);
  if (!p) return '<p class="vacio">Esa prenda ya no existe.</p>';
  const f = await db.foto(id);
  const url = f?.foto ? URL.createObjectURL(f.foto) : null;
  if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
  const aj = C.evaluarAjuste(p, estado.medidas);
  const cpu = C.costoPorUso(p.precio, p.usos);
  return `
  <div class="entre"><a href="#armario" class="boton chico">← Armario</a>
    <button class="boton chico" data-accion="usar" data-id="${p.id}">👕 Me lo puse hoy</button></div>
  <div class="foto grande" style="margin-top:10px">${url ? `<img src="${url}" alt="">` : '<span>👕</span>'}</div>
  <section class="panel kpis">
    <div><small>Usos</small><b class="cifra">${p.usos || 0}</b></div>
    <div><small>Costo por uso</small><b class="cifra">${cpu !== null ? dinero(cpu) : '—'}</b></div>
    <div><small>Ajuste</small><b>${aj ? { ok: '✓ Te queda', grande: 'Te queda grande', chica: 'Te queda chica' }[aj] : '—'}</b></div>
  </section>
  ${p.ultimoUso ? `<p class="ayuda">Último uso: ${new Date(p.ultimoUso).toLocaleDateString('es')}</p>` : ''}
  ${formPrenda(p, 'guardar-edicion:' + p.id)}
  <button class="boton peligro" data-accion="borrar-prenda" data-id="${p.id}" style="width:100%">Borrar prenda</button>`;
}

// ---------- MEDIDAS ----------
async function vistaMedidas() {
  const m = estado.medidas;
  const r = C.recomendarTallas(m);
  const err = C.validarMedidas(m);
  const fotoCuerpo = await db.leer('foto_cuerpo');
  const urlCuerpo = fotoCuerpo ? URL.createObjectURL(fotoCuerpo) : null;
  if (urlCuerpo) setTimeout(() => URL.revokeObjectURL(urlCuerpo), 60000);
  const campo = (k, t, ayuda) => `<label class="campo">${t}<input name="${k}" type="number" step="0.1" inputmode="decimal" value="${esc(m[k] ?? '')}" placeholder="${ayuda}">${err[k] ? `<span class="error-campo">${err[k]}</span>` : ''}</label>`;
  return `
  <h1>Mis medidas</h1>
  <section class="panel pila">
    <h3>Tus tallas recomendadas</h3>
    <ul class="lista">
      <li><span>Camisetas, suéteres, chaquetas</span><b>${r.superior || '—'}</b></li>
      <li><span>Camisa de vestir (cuello)</span><b>${r.cuello ? r.cuello + '"' : '—'}</b></li>
      <li><span>Pantalón</span><b>${r.pantalon ? `W${r.pantalon.cintura}${r.pantalon.largo ? ' L' + r.pantalon.largo : ''} · EU ${r.pantalon.eu}` : '—'}</b></li>
      <li><span>Traje / saco</span><b>${r.traje ? `US ${r.traje.us} · EU ${r.traje.eu}` : '—'}</b></li>
      <li><span>Calzado</span><b>${r.calzado ? `MX ${r.calzado.mx} · US ${r.calzado.us} · EU ${r.calzado.eu} · BR ${r.calzado.br}` : '—'}</b></li>
    </ul>
    <small>Son aproximadas: cada marca corta distinto. Mide sobre ropa ligera.</small>
  </section>
  <form data-form="medidas" class="panel pila">
    <h3>Medidas (cm / kg)</h3>
    <div class="dos">${campo('altura', 'Estatura (cm)', '175')}${campo('peso', 'Peso (kg)', '78')}</div>
    <div class="dos">${campo('pecho', 'Pecho (cm)', '100')}${campo('cintura', 'Cintura (cm)', '84')}</div>
    <div class="dos">${campo('cadera', 'Cadera (cm)', '98')}${campo('cuello', 'Cuello (cm)', '39')}</div>
    <div class="dos">${campo('manga', 'Largo de manga (cm)', '64')}${campo('entrepierna', 'Entrepierna (cm)', '80')}</div>
    <div class="dos">${campo('pie', 'Largo del pie (cm)', '26.5')}<span></span></div>
    <details><summary>¿Cómo medir?</summary><p class="ayuda">Pecho: por la parte más ancha, bajo las axilas. Cintura: donde usas el cinturón. Cuello: bajo la nuez, con un dedo de holgura. Entrepierna: de la entrepierna al tobillo. Pie: talón contra la pared, mide hasta el dedo más largo.</p></details>
    <button class="boton primario grande">Guardar medidas</button>
  </form>
  <section class="panel pila">
    <h3>Foto de referencia (cámara frontal)</h3>
    ${urlCuerpo ? `<div class="foto grande"><img src="${urlCuerpo}" alt="Tu foto de referencia"></div>` : '<p class="ayuda">Opcional. Te ayuda a ver si tus medidas cambian con el tiempo.</p>'}
    <label class="boton">🤳 ${urlCuerpo ? 'Cambiar foto' : 'Tomar foto'}<input type="file" accept="image/*" capture="user" data-entrada="cuerpo" hidden></label>
    ${urlCuerpo ? '<button class="boton peligro" data-accion="borrar-cuerpo">Borrar foto</button>' : ''}
    <p class="privacidad">🔒 Tus medidas, tu peso y esta foto nunca salen del teléfono: no se envían a la IA ni al respaldo.</p>
  </section>`;
}

// ---------- COSTES ----------
async function vistaCostes() {
  const conPrecio = estado.prendas.filter(p => p.precio > 0);
  const invertido = conPrecio.reduce((s, p) => s + p.precio, 0);
  const ranking = conPrecio.map(p => ({ p, cpu: C.costoPorUso(p.precio, p.usos) })).sort((a, b) => a.cpu - b.cpu);
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const log = (await db.leer('ia_log', [])).filter(l => new Date(l.fecha) >= inicioMes);
  const local = log.reduce((a, l) => ({ n: a.n + 1, usd: a.usd + l.usd, tokens: a.tokens + l.tokens }), { n: 0, usd: 0, tokens: 0 });
  const cuota = await db.leer('ia_cuota');
  const fila = ({ p, cpu }) => `<li><a href="#prenda/${p.id}">${esc(p.nombre || C.CATEGORIA[p.categoria]?.nombre)}</a><span>${dinero(cpu)} · ${p.usos || 0} usos</span></li>`;
  return `
  <h1>Costes</h1>
  <section class="panel pila">
    <h3>Tu ropa</h3>
    <div class="kpis">
      <div><small>Invertido</small><b class="cifra">${dinero(invertido)}</b></div>
      <div><small>Con precio</small><b class="cifra">${conPrecio.length}</b></div>
      <div><small>Usos totales</small><b class="cifra">${estado.prendas.reduce((s, p) => s + (p.usos || 0), 0)}</b></div>
    </div>
    ${ranking.length ? `<p><b>Mejor inversión</b> (menor costo por uso)</p><ul class="lista">${ranking.slice(0, 5).map(fila).join('')}</ul>
      ${ranking.length > 5 ? `<p><b>Casi sin usar</b></p><ul class="lista">${ranking.slice(-3).reverse().map(fila).join('')}</ul>` : ''}`
    : '<p class="ayuda">Agrega el precio a tus prendas y marca "Me lo puse hoy" para ver cuánto te cuesta cada uso.</p>'}
  </section>
  <section class="panel pila">
    <h3>IA este mes</h3>
    ${N.configurado() ? `
    <div class="kpis" id="kpis-ia">
      <div><small>Escaneos</small><b class="cifra">${local.n}</b></div>
      <div><small>Tokens</small><b class="cifra">${local.tokens.toLocaleString('es')}</b></div>
      <div><small>Coste</small><b class="cifra">${usd(local.usd)}</b></div>
    </div>
    ${cuota ? `<p class="ayuda">Límite de uso justo: ${cuota.usados}/${cuota.limite} escaneos · ${usd(cuota.costo_mes_usd)} de ${usd(cuota.tope_usd)}.</p>` : ''}
    <p class="ayuda" id="ia-fuente">Datos de este teléfono.${navigator.onLine && estado.acceso.modo === 'ok' ? ' <span class="cargando"></span> Consultando el servidor…' : ''}</p>`
    : '<p class="ayuda">Modo demo: la IA no está configurada, así que el coste es $0.</p>'}
  </section>`;
}

async function completarCostesServidor() {
  if (!N.configurado() || !navigator.onLine || estado.acceso.modo !== 'ok') return;
  try {
    const c = await N.consumoMes();
    const k = $('#kpis-ia');
    if (!k) return;
    k.innerHTML = `<div><small>Escaneos</small><b class="cifra">${c.escaneos}</b></div><div><small>Tokens</small><b class="cifra">${c.tokens.toLocaleString('es')}</b></div><div><small>Coste</small><b class="cifra">${usd(c.usd)}</b></div>`;
    $('#ia-fuente').textContent = 'Datos del servidor (todos tus dispositivos).';
  } catch (e) {
    const f = $('#ia-fuente');
    if (f) f.textContent = 'Datos de este teléfono (el servidor no respondió).';
  }
}

// ---------- AJUSTES ----------
function vistaAjustes() {
  const a = estado.ajustes;
  const p = C.PAISES[a.pais];
  const ac = estado.acceso;
  const nube = N.configurado() && ac.modo === 'ok';
  return `
  <h1>Ajustes</h1>
  <section class="panel pila">
    <h3>País y estaciones</h3>
    <label class="campo">País<select data-ajuste="pais">${opcionesPais(a.pais)}</select></label>
    <p class="ayuda">Hemisferio ${p.hemisferio === 'S' ? 'sur: las estaciones van al revés que en México' : 'norte'} · tallas ${p.tallas} · precio ${C.precioLocal(a.pais)}</p>
  </section>
  <section class="panel pila">
    <h3>Privacidad</h3>
    <label class="interruptor"><input type="checkbox" data-ajuste="usarIA" ${a.usarIA ? 'checked' : ''}><span>Clasificar con IA<small>Envía solo la foto de la prenda a la API de Anthropic. No se guarda en nuestros servidores.</small></span></label>
    <label class="interruptor"><input type="checkbox" data-ajuste="respaldo" ${a.respaldo ? 'checked' : ''} ${nube ? '' : 'disabled'}><span>Respaldo en la nube<small>${nube ? 'Copia privada de tus prendas (sin medidas ni foto de cuerpo). Solo tú puedes verla.' : 'Disponible con acceso activo.'}</small></span></label>
    ${a.respaldo && nube ? `<div class="fila"><button class="boton chico" data-accion="respaldar">Respaldar ahora</button><button class="boton chico" data-accion="restaurar">Restaurar</button></div>` : ''}
    <div class="fila"><button class="boton chico" data-accion="exportar">Exportar mis datos</button>
      <label class="boton chico">Importar<input type="file" accept="application/json" data-entrada="importar" hidden></label></div>
    <button class="boton peligro" data-accion="borrar-local">Borrar todo de este teléfono</button>
    ${N.configurado() && ac.email ? '<button class="boton peligro" data-accion="borrar-cuenta">Borrar mi cuenta y mi respaldo en la nube</button>' : ''}
  </section>
  <section class="panel pila">
    <h3>Cajas de temporada (QR)</h3>
    <p class="ayuda">Guarda tu ropa fuera de temporada en cajas con un QR impreso. Cualquier cámara lo lee, sin internet.</p>
    <a class="boton" href="#cajas">Ver mis cajas (${estado.cajas.length})</a>
  </section>
  <section class="panel pila">
    <h3>Cuenta</h3>
    <p class="ayuda">${ac.modo === 'demo' ? 'Modo demo local (sin Supabase configurado).' : `${esc(ac.email || '')} · ${ac.offline ? 'licencia validada (sin conexión)' : 'licencia activa'}`}</p>
    ${ac.email ? '<button class="boton" data-accion="salir">Cerrar sesión</button>' : ''}
    <small>Armario Virtual Hombres · v1.0.0</small>
  </section>`;
}

// ---------- CAJAS QR ----------
function vistaCajas() {
  return `
  <div class="entre"><h1>Cajas</h1><a class="boton chico" href="#armario">+ Desde el armario</a></div>
  <p class="ayuda">En el armario toca "Seleccionar", elige las prendas y luego "Caja QR".</p>
  ${estado.cajas.length ? `<ul class="lista panel">${estado.cajas.map(c => `<li><a href="#caja/${c.id}">${esc(c.nombre)}</a><span>${c.prendas.length} prendas</span></li>`).join('')}</ul>`
    : '<div class="vacio"><span>📦</span><p>Aún no tienes cajas.</p></div>'}`;
}

async function vistaCaja(id) {
  const caja = estado.cajas.find(c => c.id === id);
  if (!caja) return '<p class="vacio">Esa caja no existe.</p>';
  const prendas = caja.prendas.map(i => estado.prendas.find(p => p.id === i)).filter(Boolean);
  const texto = C.textoQRCaja(caja, prendas);
  let svg = '<p class="ayuda">Conéctate una vez para descargar el generador QR (después funciona offline).</p>';
  try {
    if (!window.qrcode) await cargarScript(QR_JS);
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { console.warn(e); }
  estado.qrActual = { caja, prendas, svg };
  return `
  <div class="entre"><a href="#cajas" class="boton chico">← Cajas</a><button class="boton chico primario" data-accion="imprimir">🖨️ Imprimir</button></div>
  <section class="panel pila" style="margin-top:10px">
    <h2>${esc(caja.nombre)}</h2>
    <div class="qr">${svg}</div>
    <p class="ayuda">${prendas.length} prendas · ${kg(C.pesoTotal(prendas))}</p>
    <ul class="lista">${prendas.map(p => `<li><span>${esc(p.nombre || C.CATEGORIA[p.categoria]?.nombre)}</span><span>${esc(p.talla || '')}</span></li>`).join('')}</ul>
  </section>
  <button class="boton peligro" data-accion="borrar-caja" data-id="${caja.id}" style="width:100%">Borrar caja</button>`;
}

// ---------- render y rutas ----------
let renderActual = 0;
async function render() {
  const turno = ++renderActual; // si otro render empieza mientras este espera, gana el más reciente
  const [ruta, arg] = (location.hash.slice(1) || 'armario').split('/');
  const enApp = estado.acceso.modo === 'ok' || estado.acceso.modo === 'demo';
  document.querySelectorAll('#nav a').forEach(a => (a.dataset.ruta === ruta ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#nav').hidden = !enApp || !estado.ajustes.onboarding;
  pintarRed();
  let html;
  if (!estado.ajustes.onboarding) html = vistaBienvenida();
  else if (estado.acceso.modo === 'login') html = vistaLogin();
  else if (estado.acceso.modo === 'pago') html = vistaPago();
  else if (estado.acceso.modo === 'sin_red') html = '<section class="panel"><h2>Sin conexión</h2><p>Conéctate una vez para validar tu acceso. Después la app funciona sin internet.</p></section>';
  else if (ruta === 'escanear') html = vistaEscanear();
  else if (ruta === 'prenda') html = await vistaPrenda(arg);
  else if (ruta === 'medidas') html = await vistaMedidas();
  else if (ruta === 'costes') html = await vistaCostes();
  else if (ruta === 'ajustes') html = vistaAjustes();
  else if (ruta === 'cajas') html = vistaCajas();
  else if (ruta === 'caja') html = await vistaCaja(arg);
  else html = vistaArmario();
  if (turno !== renderActual) return;
  vista.innerHTML = html;
  hidratarFotos();
  if (ruta === 'costes' && enApp) completarCostesServidor();
}

function pintarRed() {
  const el = $('#estado-red');
  const demo = estado.acceso.modo === 'demo';
  el.textContent = navigator.onLine ? (demo ? 'Demo local' : 'En línea') : 'Sin internet';
  el.classList.toggle('offline', !navigator.onLine);
}

async function recargarPrendas() {
  estado.prendas = await db.todas();
}

async function respaldoSilencioso() {
  if (!estado.ajustes.respaldo || !iaDisponible()) return;
  try {
    const pendientes = estado.prendas.filter(p => p.fotoCambiada || !p.fotoPath || p.pendienteNube);
    if (!pendientes.length) return;
    await N.respaldar(pendientes, id => db.foto(id));
    for (const p of pendientes) await db.guardarPrenda({ ...p, pendienteNube: false });
    await recargarPrendas();
  } catch (e) { console.warn('Respaldo pendiente', e); }
}

// ---------- acciones ----------
const acciones = {
  'estacion': el => { estado.filtro.estacion = el.dataset.v || null; render(); },
  'modo-seleccion': () => { estado.modoSeleccion = !estado.modoSeleccion; estado.seleccion.clear(); render(); },
  'abrir': el => { location.hash = '#prenda/' + el.dataset.id; },
  'elegir': el => { const s = estado.seleccion; s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); render(); },
  'crear-caja': async () => {
    const est = estado.filtro.estacion;
    const nombre = prompt('Nombre de la caja', `${est ? nombreEstacion(est) : 'Temporada'} · Caja ${estado.cajas.length + 1}`);
    if (!nombre) return;
    const caja = { id: crypto.randomUUID(), nombre: nombre.slice(0, 40), estacion: est ? nombreEstacion(est) : '', prendas: [...estado.seleccion], creadaEn: new Date().toISOString() };
    estado.cajas.push(caja);
    await db.escribir('cajas', estado.cajas);
    estado.modoSeleccion = false; estado.seleccion.clear();
    location.hash = '#caja/' + caja.id;
  },
  'borrar-caja': async el => {
    if (!confirm('¿Borrar esta caja? Las prendas no se borran.')) return;
    estado.cajas = estado.cajas.filter(c => c.id !== el.dataset.id);
    await db.escribir('cajas', estado.cajas);
    location.hash = '#cajas';
  },
  'imprimir': () => {
    const { caja, prendas, svg } = estado.qrActual;
    $('#imprimir').innerHTML = `<h1>${esc(caja.nombre)}</h1>${svg}<ol>${prendas.map(p => `<li>${esc(p.nombre || C.CATEGORIA[p.categoria]?.nombre)} ${esc(p.talla || '')}</li>`).join('')}</ol>`;
    window.print();
  },
  'descartar': () => { estado.borrador = null; render(); },
  'usar': async el => {
    const p = await db.prenda(el.dataset.id);
    await db.guardarPrenda({ ...p, usos: (p.usos || 0) + 1, ultimoUso: new Date().toISOString(), pendienteNube: true });
    await recargarPrendas();
    aviso('Anotado: +1 uso');
    render();
  },
  'borrar-prenda': async el => {
    if (!confirm('¿Borrar esta prenda?')) return;
    const p = await db.prenda(el.dataset.id);
    await db.borrarPrenda(p.id); await db.borrarFoto(p.id); olvidarUrl(p.id);
    estado.cajas.forEach(c => (c.prendas = c.prendas.filter(i => i !== p.id)));
    await db.escribir('cajas', estado.cajas);
    if (p.fotoPath && iaDisponible()) N.borrarRespaldoPrenda(p.id, p.fotoPath).catch(console.warn);
    await recargarPrendas();
    location.hash = '#armario';
  },
  'borrar-cuerpo': async () => { await db.escribir('foto_cuerpo', null); render(); },
  'exportar': async () => {
    const prendas = await db.todas();
    const fotos = {};
    for (const p of prendas) { const f = await db.foto(p.id); if (f?.mini) fotos[p.id] = await blobADataURL(f.mini); }
    const datos = { app: 'armario-virtual-hombres', version: 1, exportado: new Date().toISOString(), prendas, fotos, medidas: estado.medidas, cajas: estado.cajas };
    descargar(`armario-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(datos));
  },
  'borrar-local': async () => {
    if (!confirm('Esto borra todas tus prendas, fotos y medidas de este teléfono. ¿Seguro?')) return;
    await db.borrarTodo();
    estado.urls.forEach(u => URL.revokeObjectURL(u)); estado.urls.clear();
    location.reload();
  },
  'borrar-cuenta': async () => {
    if (!confirm('Se borrará tu cuenta y tu respaldo en la nube. Tus datos en este teléfono se quedan. ¿Continuar?')) return;
    try { await N.borrarCuenta(); await N.salir(); aviso('Cuenta borrada'); setTimeout(() => location.reload(), 1200); }
    catch (e) { aviso('No se pudo borrar: ' + e.message, 'error'); }
  },
  'respaldar': async () => {
    try { const n = await N.respaldar(estado.prendas, id => db.foto(id)); for (const p of estado.prendas) await db.guardarPrenda(p); aviso(`Respaldadas ${n} prendas ✓`); }
    catch (e) { aviso('Respaldo falló: ' + e.message, 'error'); }
  },
  'restaurar': async () => {
    try {
      const items = await N.descargarRespaldo();
      for (const { prenda, foto } of items) {
        await db.guardarPrenda(prenda);
        if (foto) {
          const bmp = await IMG.cargarImagen(foto);
          const mini = await IMG.aBlob(IMG.redimensionar(bmp, 320), 'image/webp', 0.8);
          await db.guardarFoto(prenda.id, { foto, mini });
        }
      }
      await recargarPrendas(); aviso(`Restauradas ${items.length} prendas ✓`); render();
    } catch (e) { aviso('No se pudo restaurar: ' + e.message, 'error'); }
  },
  'revisar-licencia': async () => { estado.acceso = await verificarAcceso(); render(); },
  'salir': async () => { try { await N.salir(); } catch { /* sin red */ } await db.escribir('licencia', null); estado.acceso = await verificarAcceso(); render(); },
  'otro-email': () => { estado.login = { email: '', enviado: false }; render(); },
};

const formularios = {
  'bienvenida': async f => {
    const fd = new FormData(f);
    Object.assign(estado.ajustes, { pais: fd.get('pais'), usarIA: fd.get('usarIA') === 'on', onboarding: true });
    await db.escribir('ajustes', estado.ajustes);
    render();
  },
  'login': async f => {
    const fd = new FormData(f);
    const boton = f.querySelector('button');
    boton.disabled = true;
    try {
      if (!estado.login.enviado) {
        estado.login.email = fd.get('email').trim().toLowerCase();
        await N.enviarCodigo(estado.login.email);
        estado.login.enviado = true;
        aviso('Te enviamos el código por email');
      } else {
        await N.verificarCodigo(estado.login.email, fd.get('codigo').trim());
        estado.acceso = await verificarAcceso();
      }
    } catch (e) { aviso(e.message, 'error'); }
    render();
  },
  'guardar-nueva': guardarNueva,
  'medidas': async f => {
    const fd = new FormData(f);
    const m = {};
    for (const [k, v] of fd.entries()) if (v !== '') m[k] = Number(v);
    const err = C.validarMedidas(m);
    estado.medidas = m;
    await db.escribir('medidas', m);
    aviso(Object.keys(err).length ? 'Guardado, pero revisa los campos marcados' : 'Medidas guardadas ✓', Object.keys(err).length ? 'error' : '');
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (el && acciones[el.dataset.accion]) { e.preventDefault(); acciones[el.dataset.accion](el, e); }
});

document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const [nombre, id] = f.dataset.form.split(':');
  if (nombre === 'guardar-edicion') {
    const p = await db.prenda(id);
    await db.guardarPrenda({ ...p, ...leerForm(f), pendienteNube: true });
    await recargarPrendas();
    aviso('Cambios guardados ✓');
    respaldoSilencioso();
    return render();
  }
  formularios[nombre]?.(f);
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.entrada === 'foto' && t.files[0]) return alElegirFoto(t.files[0]);
  if (t.dataset.entrada === 'cuerpo' && t.files[0]) {
    const bmp = await IMG.cargarImagen(t.files[0]);
    await db.escribir('foto_cuerpo', await IMG.aBlob(IMG.redimensionar(bmp, 900), 'image/jpeg', 0.85));
    return render();
  }
  if (t.dataset.entrada === 'importar' && t.files[0]) return importar(t.files[0]);
  if (t.dataset.filtro === 'categoria') { estado.filtro.categoria = t.value; return render(); }
  if (t.name === 'categoria' && t.form?.pesoG?.dataset.auto) { t.form.pesoG.value = C.pesoEstimado(t.value); return; }
  if (t.name === 'pesoG') delete t.dataset.auto; // el usuario puso su propio peso
  if (t.dataset.ajuste) {
    estado.ajustes[t.dataset.ajuste] = t.type === 'checkbox' ? t.checked : t.value;
    await db.escribir('ajustes', estado.ajustes);
    if (t.dataset.ajuste === 'respaldo' && t.checked) respaldoSilencioso();
    render();
  }
});

let tecleo;
document.addEventListener('input', e => {
  if (e.target.dataset.filtro !== 'texto') return;
  estado.filtro.texto = e.target.value;
  clearTimeout(tecleo);
  tecleo = setTimeout(async () => {
    const pos = e.target.selectionStart;
    await render();
    const i = $('[data-filtro="texto"]');
    if (i) { i.focus(); i.setSelectionRange(pos, pos); }
  }, 250);
});

async function importar(file) {
  try {
    const datos = JSON.parse(await file.text());
    if (datos.app !== 'armario-virtual-hombres' || !Array.isArray(datos.prendas)) throw new Error('Archivo no válido');
    for (const p of datos.prendas) {
      if (!p.id || typeof p.id !== 'string') continue;
      await db.guardarPrenda({ ...p, fotoCambiada: true });
      const url = datos.fotos?.[p.id];
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        const blob = await (await fetch(url)).blob();
        await db.guardarFoto(p.id, { foto: blob, mini: blob });
      }
    }
    if (datos.medidas) { estado.medidas = datos.medidas; await db.escribir('medidas', datos.medidas); }
    if (Array.isArray(datos.cajas)) { estado.cajas = datos.cajas; await db.escribir('cajas', datos.cajas); }
    await recargarPrendas();
    aviso(`Importadas ${datos.prendas.length} prendas ✓`);
    render();
  } catch (e) { aviso('No se pudo importar: ' + e.message, 'error'); }
}

// ---------- arranque ----------
async function iniciar() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  estado.ajustes = await db.leer('ajustes') || { pais: C.detectarPais({ timeZone: tz, language: navigator.language }), usarIA: true, respaldo: false, onboarding: false };
  estado.medidas = await db.leer('medidas', {});
  estado.cajas = await db.leer('cajas', []);
  await recargarPrendas();
  estado.acceso = await verificarAcceso();
  window.addEventListener('hashchange', render);
  window.addEventListener('online', async () => { estado.acceso = await verificarAcceso(); render(); respaldoSilencioso(); });
  window.addEventListener('offline', pintarRed);
  await render();
  respaldoSilencioso();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__avh = { estado, db, IMG, C, render, alElegirFoto, guardarNueva, verificarAcceso };
}

iniciar();
