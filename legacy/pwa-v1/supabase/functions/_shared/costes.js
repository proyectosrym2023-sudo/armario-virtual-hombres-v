// Medición de costes de IA. Precios de la API de Anthropic en USD por millón de tokens (MTok).
// Fuente: tabla de modelos de Anthropic (cacheada 2026-10-06). Revísalos en https://www.anthropic.com/pricing antes de lanzar.
export const PRECIOS_MTOK = {
  'claude-opus-5-5': { entrada: 4.0, salida: 20.0, cacheLectura: 0.2, cacheEscritura: 5.0 },
  'claude-sonnet-5-5': { entrada: 2.0, salida: 10.0, cacheLectura: 0.2, cacheEscritura: 2.5 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
};

// usage = response.usage de la API (input_tokens, output_tokens, cache_*). output_tokens ya incluye el pensamiento.
export function costoUSD(modelo, usage = {}) {
  const p = PRECIOS_MTOK[modelo];
  if (!p) throw new Error(`Modelo sin precio configurado: ${modelo}`);
  const n = k => Number(usage[k]) || 0;
  const total =
    n('input_tokens') * p.entrada +
    n('output_tokens') * p.salida +
    n('cache_read_input_tokens') * p.cacheLectura +
    n('cache_creation_input_tokens') * p.cacheEscritura;
  return Math.round((total / 1e6) * 1e6) / 1e6; // 6 decimales
}

// Estimación previa: una imagen cuesta ~ (ancho × alto) / 750 tokens.
export function tokensImagen(ancho, alto) {
  return Math.ceil((ancho * alto) / 750);
}

export function inicioMesUTC(fecha = new Date()) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1)).toISOString();
}

// ¿Puede escanear? Corta por número de escaneos o por gasto del mes, lo que llegue antes.
export function revisarCuota({ usados, costoMes }, { limite, topeUSD }) {
  if (usados >= limite) return { ok: false, motivo: `Llegaste al límite de ${limite} escaneos este mes.` };
  if (costoMes >= topeUSD) return { ok: false, motivo: 'Llegaste al tope de uso de IA de este mes.' };
  return { ok: true };
}
