// Webhook Hotmart v2.0.0 → licencias. Desplegar con verify_jwt = false (Hotmart no manda JWT).
// Configura en Hotmart: Herramientas → Webhook → URL https://<proyecto>.supabase.co/functions/v1/hotmart-webhook
// Versión 2.0.0, eventos: compra aprobada/completa/reembolsada/contracargo/cancelada/protesto + cancelación de suscripción.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { compararHottok, interpretarEvento, payloadMinimo } from "../_shared/hotmart.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Solo POST" }, 405);

  const secreto = Deno.env.get("HOTMART_HOTTOK") ?? "";
  if (!secreto) return json({ ok: false, error: "HOTMART_HOTTOK no configurado" }, 500);
  if (!compararHottok(req.headers.get("x-hotmart-hottok"), secreto)) {
    return json({ ok: false, error: "Hottok inválido" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const ev = interpretarEvento(body, { productoId: Deno.env.get("HOTMART_PRODUCT_ID") || undefined });

  // Idempotencia: el mismo id de evento solo se procesa una vez.
  const { error: errIns } = await sb.from("hotmart_eventos").insert({
    id: ev.eventId,
    evento: ev.evento || "desconocido",
    email: ev.email || null,
    transaccion: ev.transaccion,
    hottok_evento: ev.ignorar ? null : ev.hottokEvento,
    resultado: ev.ignorar ? `ignorado: ${ev.motivo}` : "recibido",
    payload: payloadMinimo(body),
  });
  if (errIns?.code === "23505") return json({ ok: true, resultado: "duplicado" });
  if (errIns) {
    console.error("hotmart_eventos", errIns);
    return json({ ok: false, error: "No se pudo registrar el evento" }, 500); // Hotmart reintentará
  }

  if (ev.ignorar) return json({ ok: true, resultado: "ignorado", motivo: ev.motivo });

  const { data: resultado, error } = await sb.rpc("aplicar_evento_hotmart", {
    p_email: ev.email,
    p_estado: ev.estado,
    p_hottok: ev.hottokEvento,
    p_transaccion: ev.transaccion,
    p_producto: ev.productoId,
    p_acceso_hasta: ev.accesoHasta,
    p_evento: ev.evento,
    p_evento_en: ev.fechaEvento,
  });
  if (error) {
    console.error("aplicar_evento_hotmart", error);
    await sb.from("hotmart_eventos").delete().eq("id", ev.eventId); // permite el reintento de Hotmart
    return json({ ok: false, error: "No se pudo aplicar" }, 500);
  }
  await sb.from("hotmart_eventos").update({ resultado }).eq("id", ev.eventId);

  console.log(JSON.stringify({ evento: ev.evento, hottok: ev.hottokEvento, estado: ev.estado, resultado }));
  return json({ ok: true, resultado, estado: ev.estado, hottok_evento: ev.hottokEvento });
});
