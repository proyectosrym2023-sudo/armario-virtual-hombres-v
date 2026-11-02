// Privacidad: borra la cuenta del usuario, sus fotos del bucket y (por cascada) sus prendas y su consumo de IA.
// La fila de `licencias` se conserva porque es el registro de la compra en Hotmart (solo contiene el email y el estado).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGINS")?.split(",")[0]?.trim() || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "content-type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response('{"error":"Solo POST"}', { status: 405, headers: CORS });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return new Response('{"error":"Inicia sesión"}', { status: 401, headers: CORS });

  // Fotos: prendas/<uid>/*
  for (;;) {
    const { data: archivos, error } = await sb.storage.from("prendas").list(user.id, { limit: 100 });
    if (error || !archivos?.length) break;
    const { error: errBorrar } = await sb.storage.from("prendas").remove(archivos.map((a) => `${user.id}/${a.name}`));
    if (errBorrar) return new Response(JSON.stringify({ error: errBorrar.message }), { status: 500, headers: CORS });
    if (archivos.length < 100) break;
  }

  const { error } = await sb.auth.admin.deleteUser(user.id); // prendas y ai_usage caen por ON DELETE CASCADE
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  return new Response('{"ok":true}', { status: 200, headers: CORS });
});
