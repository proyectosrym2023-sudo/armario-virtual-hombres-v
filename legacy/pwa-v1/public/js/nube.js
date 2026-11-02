// Conexión opcional con Supabase: acceso con código por email, licencia Hotmart, escáner IA, consumo y respaldo.
const CFG = window.AVH_CONFIG || {};
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let cliente;

export const configurado = () => Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

function cargarScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

export async function sb() {
  if (!configurado()) throw new Error('Supabase no configurado');
  if (cliente) return cliente;
  if (!window.supabase) await cargarScript(SUPABASE_JS);
  cliente = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cliente;
}

export async function sesion() {
  const { data } = await (await sb()).auth.getSession();
  return data.session;
}

export async function enviarCodigo(email) {
  const { error } = await (await sb()).auth.signInWithOtp({
    email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function verificarCodigo(email, token) {
  const { data, error } = await (await sb()).auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.session;
}

export async function salir() {
  await (await sb()).auth.signOut();
}

// RLS: cada usuario solo puede leer la licencia de su propio email.
export async function licencia() {
  const { data, error } = await (await sb()).from('licencias').select('estado, acceso_hasta, hottok_evento').maybeSingle();
  if (error) throw error;
  const activa = Boolean(data && ['activa', 'prueba'].includes(data.estado) && (!data.acceso_hasta || new Date(data.acceso_hasta) > new Date()));
  return { activa, estado: data?.estado ?? 'sin_compra', accesoHasta: data?.acceso_hasta ?? null, hottok: data?.hottok_evento ?? null };
}

async function invocar(nombre, body) {
  const { data, error } = await (await sb()).functions.invoke(nombre, { body });
  if (error) {
    let detalle = error.message;
    try { detalle = (await error.context.json()).error || detalle; } catch { /* sin cuerpo JSON */ }
    const e = new Error(detalle);
    e.status = error.context?.status;
    throw e;
  }
  return data;
}

export const escanear = (imagenBase64, pais, estacion) =>
  invocar('escanear-prenda', { imagen: imagenBase64, media_type: 'image/jpeg', pais, estacion });

export const borrarCuenta = () => invocar('borrar-cuenta', {});

export async function consumoMes() {
  const inicio = new Date(); inicio.setUTCDate(1); inicio.setUTCHours(0, 0, 0, 0);
  const { data, error } = await (await sb()).from('ai_usage')
    .select('costo_usd, input_tokens, output_tokens, ok').gte('created_at', inicio.toISOString());
  if (error) throw error;
  return data.reduce((a, r) => ({
    escaneos: a.escaneos + (r.ok ? 1 : 0),
    tokens: a.tokens + r.input_tokens + r.output_tokens,
    usd: a.usd + Number(r.costo_usd),
  }), { escaneos: 0, tokens: 0, usd: 0 });
}

// Respaldo opt-in: metadatos en la tabla `prendas`, foto recortada en el bucket privado `prendas/<uid>/`.
export async function respaldar(prendas, obtenerFoto) {
  const c = await sb();
  const { data: { user } } = await c.auth.getUser();
  if (!user) throw new Error('Sin sesión');
  let subidas = 0;
  for (const p of prendas) {
    let fotoPath = p.fotoPath || null;
    if (!fotoPath || p.fotoCambiada) {
      const f = await obtenerFoto(p.id);
      if (f?.foto) {
        fotoPath = `${user.id}/${p.id}.${f.foto.type === 'image/png' ? 'png' : 'webp'}`;
        const { error } = await c.storage.from('prendas').upload(fotoPath, f.foto, { upsert: true, contentType: f.foto.type });
        if (error) throw error;
      }
    }
    const { error } = await c.from('prendas').upsert({ id: p.id, user_id: user.id, datos: { ...p, fotoCambiada: false, fotoPath }, foto_path: fotoPath, actualizado_en: p.actualizadoEn });
    if (error) throw error;
    p.fotoPath = fotoPath; p.fotoCambiada = false;
    subidas++;
  }
  return subidas;
}

export async function descargarRespaldo() {
  const c = await sb();
  const { data, error } = await c.from('prendas').select('datos, foto_path');
  if (error) throw error;
  const out = [];
  for (const r of data) {
    let foto = null;
    if (r.foto_path) {
      const d = await c.storage.from('prendas').download(r.foto_path);
      if (!d.error) foto = d.data;
    }
    out.push({ prenda: r.datos, foto });
  }
  return out;
}

export async function borrarRespaldoPrenda(id, fotoPath) {
  const c = await sb();
  if (fotoPath) await c.storage.from('prendas').remove([fotoPath]);
  await c.from('prendas').delete().eq('id', id);
}
