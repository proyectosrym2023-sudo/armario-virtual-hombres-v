// Escáner IA: clasifica UNA foto de prenda con Claude (visión + salida JSON estructurada),
// verifica licencia y cuota mensual, y registra tokens y coste en ai_usage. La imagen no se guarda.
import Anthropic from "npm:@anthropic-ai/sdk@^0.136.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { costoUSD, inicioMesUTC, PRECIOS_MTOK, revisarCuota } from "../_shared/costes.js";

// Modelo por defecto: Claude Opus 5.5. Para bajar el coste ~40x usa CLAUDE_MODEL=claude-haiku-5-5.
const MODELO = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";
const LIMITE = Number(Deno.env.get("AI_CUOTA_MENSUAL") ?? "120");
const TOPE_USD = Number(Deno.env.get("AI_TOPE_USD_MES") ?? "2");
const ORIGENES = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const MAX_BASE64 = 2_000_000; // ~1.5 MB de imagen

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY desde los secretos de la función
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const SISTEMA = `Eres el clasificador de prendas de "Armario Virtual Hombres", un armario digital para hombres en Latinoamérica.
Recibes la foto de una prenda (normalmente extendida sobre una cama, el piso o colgada).
Identifica la prenda principal y completa el esquema JSON en español neutro.
- categoria: la más cercana de la lista. Si no hay una prenda de ropa clara, es_prenda=false y categoria="otro".
- subtipo: nombre corto y útil, por ejemplo "Camisa Oxford", "Chamarra de mezclilla", "Tenis blancos".
- color_hex: el color dominante de la prenda (no del fondo) en formato #rrggbb.
- estaciones: en cuáles estaciones del hemisferio indicado conviene usarla por abrigo y tela. Si sirve todo el año, incluye las cuatro.
- peso_estimado_g: peso aproximado de la prenda en gramos (un par en calzado).
- talla_visible / marca_visible: solo si se leen en una etiqueta visible; si no, cadena vacía. No adivines.
- bbox: caja de la prenda en coordenadas normalizadas 0-1 respecto a la imagen (x, y = esquina superior izquierda).
- confianza: entre 0 y 1.
Si aparece una persona, ignórala: no describas su cara, cuerpo ni rasgos.`;

const CATEGORIAS = ["camiseta", "camisa", "polo", "sueter", "sudadera", "chaqueta", "abrigo", "traje", "pantalon", "jeans",
  "shorts", "deportiva", "ropa_interior", "calzado", "accesorio", "otro"];
const ESTACIONES = ["primavera", "verano", "otono", "invierno"];

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_prenda", "categoria", "subtipo", "color_principal", "color_hex", "patron", "material_probable",
    "formalidad", "estaciones", "peso_estimado_g", "talla_visible", "marca_visible", "bbox", "confianza"],
  properties: {
    es_prenda: { type: "boolean" },
    categoria: { type: "string", enum: CATEGORIAS },
    subtipo: { type: "string" },
    color_principal: { type: "string" },
    color_hex: { type: "string" },
    patron: { type: "string", enum: ["liso", "rayas", "cuadros", "estampado", "otro"] },
    material_probable: { type: "string" },
    formalidad: { type: "string", enum: ["casual", "smart_casual", "formal", "deportivo"] },
    estaciones: { type: "array", items: { type: "string", enum: ESTACIONES } },
    peso_estimado_g: { type: "integer" },
    talla_visible: { type: "string" },
    marca_visible: { type: "string" },
    bbox: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "w", "h"],
      properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
    },
    confianza: { type: "number" },
  },
};

function cors(req: Request) {
  const origen = req.headers.get("origin") ?? "";
  const permitido = ORIGENES.includes("*") ? "*" : ORIGENES.includes(origen) ? origen : ORIGENES[0];
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const h = { ...cors(req), "content-type": "application/json" };
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);

  // 1. Usuario
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user?.email) return json({ error: "Inicia sesión" }, 401);

  // 2. Licencia Hotmart
  const { data: lic } = await sb.from("licencias").select("estado, acceso_hasta").eq("email", user.email.toLowerCase()).maybeSingle();
  const activa = lic && ["activa", "prueba"].includes(lic.estado) && (!lic.acceso_hasta || new Date(lic.acceso_hasta) > new Date());
  if (!activa) return json({ error: "Tu acceso no está activo" }, 403);

  // 3. Cuota del mes (número de escaneos y gasto en USD)
  const { data: filas, error: errUso } = await sb.from("ai_usage").select("costo_usd, ok")
    .eq("user_id", user.id).gte("created_at", inicioMesUTC());
  if (errUso) return json({ error: "No se pudo revisar tu cuota" }, 500);
  const usados = filas.filter((f) => f.ok).length;
  const costoMes = filas.reduce((s, f) => s + Number(f.costo_usd), 0);
  const cuota = revisarCuota({ usados, costoMes }, { limite: LIMITE, topeUSD: TOPE_USD });
  if (!cuota.ok) return json({ error: cuota.motivo, cuota: { usados, limite: LIMITE, costo_mes_usd: costoMes, tope_usd: TOPE_USD } }, 429);

  // 4. Entrada
  let body: { imagen?: string; media_type?: string; pais?: string; estacion?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const mediaType = body.media_type ?? "image/jpeg";
  if (typeof body.imagen !== "string" || body.imagen.length < 100 || body.imagen.length > MAX_BASE64) {
    return json({ error: "Imagen ausente o demasiado grande" }, 400);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return json({ error: "Formato no soportado" }, 400);
  const contexto = `País: ${String(body.pais ?? "MX").slice(0, 2)}. Estación actual allí: ${String(body.estacion ?? "").slice(0, 12)}. Clasifica la prenda.`;

  // 5. Claude
  const inicio = Date.now();
  const registrar = (fila: Record<string, unknown>) =>
    sb.from("ai_usage").insert({ user_id: user.id, latencia_ms: Date.now() - inicio, ...fila });

  try {
    const params = {
      model: MODELO,
      max_tokens: 4000,
      system: SISTEMA,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: body.imagen } },
          { type: "text", text: contexto },
        ],
      }],
    } as const;

    // Opus 5.5: si un clasificador de seguridad rechaza (falso positivo), el servidor reintenta con otro modelo.
    const resp = MODELO === "claude-opus-5-5"
      ? await anthropic.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as never)
      : await anthropic.messages.create(params as never);

    // Se cobra con la tabla del modelo que respondió (un fallback puede usar otro).
    const modeloCobro = resp.model in PRECIOS_MTOK ? resp.model : MODELO;
    const uso = resp.usage as Record<string, number>;
    const costo = costoUSD(modeloCobro, uso);
    const filaUso = {
      modelo: modeloCobro,
      input_tokens: uso.input_tokens ?? 0,
      output_tokens: uso.output_tokens ?? 0,
      cache_read_tokens: uso.cache_read_input_tokens ?? 0,
      cache_write_tokens: uso.cache_creation_input_tokens ?? 0,
      costo_usd: costo,
    };

    if (resp.stop_reason === "refusal") {
      await registrar({ ...filaUso, ok: false, error: "refusal" });
      return json({ error: "La IA no pudo clasificar esta foto. Complétala a mano." }, 422);
    }
    if (resp.stop_reason === "max_tokens") {
      await registrar({ ...filaUso, ok: false, error: "max_tokens" });
      return json({ error: "Respuesta incompleta de la IA" }, 502);
    }
    const texto = (resp.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text")?.text ?? "";
    let clasificacion: unknown;
    try { clasificacion = JSON.parse(texto); } catch {
      await registrar({ ...filaUso, ok: false, error: "json_invalido" });
      return json({ error: "Respuesta inválida de la IA" }, 502);
    }

    await registrar({ ...filaUso, ok: true });
    return json({
      clasificacion,
      uso: { modelo: modeloCobro, input_tokens: filaUso.input_tokens, output_tokens: filaUso.output_tokens, costo_usd: costo },
      cuota: { usados: usados + 1, limite: LIMITE, costo_mes_usd: Math.round((costoMes + costo) * 1e6) / 1e6, tope_usd: TOPE_USD },
    });
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429
      : e instanceof Anthropic.APIConnectionError ? 503
      : e instanceof Anthropic.APIError ? 502 : 500;
    console.error("escanear-prenda", status, e instanceof Error ? e.message : e);
    await registrar({ modelo: MODELO, ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) });
    return json({ error: status === 429 ? "La IA está saturada, intenta en un minuto" : "La IA no respondió" }, status);
  }
});
