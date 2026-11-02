// Configuración pública (la anon key de Supabase es pública por diseño; la seguridad la dan las políticas RLS).
// Si SUPABASE_URL queda vacío, la app corre en MODO DEMO LOCAL: todo funciona sin IA, sin nube y sin licencia.
window.AVH_CONFIG = {
  SUPABASE_URL: '',            // https://<proyecto>.supabase.co
  SUPABASE_ANON_KEY: '',       // anon public key
  HOTMART_CHECKOUT_URL: '',    // https://pay.hotmart.com/XXXXXXXX
  DIAS_GRACIA_OFFLINE: 30,     // días que una licencia validada sigue abierta sin internet
};
