// Clasificación de UNA foto con Claude (visión + JSON estructurado). Solo servidor.
import Anthropic from '@anthropic-ai/sdk';
import { ESTACIONES, TIPOS, categoriaDeTipo, colorMasCercano, esEstacion, type Estacion } from './catalogo';
import { costoUSD, PRECIOS_MTOK } from './costes';

export const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const SISTEMA = `Clasificas fotos para "Armario Virtual Hombres", un armario digital de ropa y accesorios de hombre.
Recibes una foto (prenda extendida o colgada, o un accesorio sobre una superficie).
Responde SOLO con el JSON del esquema, en español.
- item_type: el tipo más cercano de la lista. Si no hay ropa ni accesorio claro, es_articulo=false.
- color_hex: color dominante DEL ARTÍCULO (no del fondo), formato #rrggbb.
- estacion_principal y estaciones_adicionales: solo una sugerencia según la tela y el abrigo. Si sirve todo el año, pon las demás como adicionales.
- talla_visible / marca_visible: solo si se leen en una etiqueta visible; si no, cadena vacía. Nunca adivines.
- Si aparece una persona, ignórala: no describas su cara, cuerpo, peso ni talla.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_articulo', 'item_type', 'nombre', 'color_hex', 'estacion_principal', 'estaciones_adicionales', 'talla_visible', 'marca_visible', 'confianza'],
  properties: {
    es_articulo: { type: 'boolean' },
    item_type: { type: 'string', enum: TIPOS.map(t => t.id) },
    nombre: { type: 'string' },
    color_hex: { type: 'string' },
    estacion_principal: { type: 'string', enum: ESTACIONES.map(e => e.id) },
    estaciones_adicionales: { type: 'array', items: { type: 'string', enum: ESTACIONES.map(e => e.id) } },
    talla_visible: { type: 'string' },
    marca_visible: { type: 'string' },
    confianza: { type: 'number' },
  },
} as const;

export interface Sugerencia {
  esArticulo: boolean;
  itemType: string;
  categoria: string;
  nombre: string;
  colorHex: string | null;
  color: string;
  estacionPrincipal: Estacion;
  estacionesAdicionales: Estacion[];
  talla: string;
  marca: string;
  confianza: number;
}

export function normalizar(raw: Record<string, unknown>): Sugerencia {
  const tipo = TIPOS.some(t => t.id === raw.item_type) ? String(raw.item_type) : 'ropa_casual';
  const principal = esEstacion(raw.estacion_principal) ? raw.estacion_principal : 'primavera';
  const adicionales = Array.isArray(raw.estaciones_adicionales)
    ? [...new Set(raw.estaciones_adicionales.filter(esEstacion))].filter(e => e !== principal) : [];
  const hex = typeof raw.color_hex === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color_hex) ? raw.color_hex.toLowerCase() : null;
  const categoria = categoriaDeTipo(tipo)!;
  return {
    esArticulo: raw.es_articulo !== false,
    itemType: tipo,
    categoria,
    nombre: String(raw.nombre ?? '').slice(0, 80),
    colorHex: hex,
    color: hex ? colorMasCercano(hex) : 'gris',
    estacionPrincipal: principal,
    estacionesAdicionales: adicionales,
    talla: categoria === 'ropa' ? String(raw.talla_visible ?? '').slice(0, 12) : '',
    marca: String(raw.marca_visible ?? '').slice(0, 60),
    confianza: Math.min(1, Math.max(0, Number(raw.confianza) || 0)),
  };
}

export interface ResultadoClasificacion {
  sugerencia: Sugerencia | null;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  costo: number;
  ms: number;
  error: string | null;
}

let cliente: Anthropic | null = null;

export async function clasificar(imagenBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ResultadoClasificacion> {
  cliente ??= new Anthropic();
  const inicio = Date.now();
  const params = {
    model: MODELO,
    max_tokens: 4000,
    system: SISTEMA,
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: ESQUEMA as unknown as Record<string, unknown> } },
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: imagenBase64 } },
        { type: 'text' as const, text: 'Clasifica este artículo.' },
      ],
    }],
  };
  // Opus 5.5: si un clasificador de seguridad rechaza por error, el servidor de Anthropic reintenta con otro modelo.
  const resp = MODELO === 'claude-opus-5-5'
    ? await cliente.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await cliente.messages.create(params);
  const ms = Date.now() - inicio;
  const modelo = resp.model in PRECIOS_MTOK ? resp.model : MODELO;
  const uso = resp.usage;
  const base = { modelo, inputTokens: uso.input_tokens ?? 0, outputTokens: uso.output_tokens ?? 0, costo: costoUSD(modelo, uso), ms };

  if (resp.stop_reason === 'refusal') return { ...base, sugerencia: null, error: 'refusal' };
  if (resp.stop_reason === 'max_tokens') return { ...base, sugerencia: null, error: 'max_tokens' };
  const bloque = resp.content.find(b => b.type === 'text');
  try {
    return { ...base, sugerencia: normalizar(JSON.parse(bloque && 'text' in bloque ? bloque.text : '')), error: null };
  } catch {
    return { ...base, sugerencia: null, error: 'json_invalido' };
  }
}
