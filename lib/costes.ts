// Medición y proyección de costes de IA. Precios API Anthropic en USD por millón de tokens.
// Fuente: tabla de modelos del skill claude-api (cacheada 2026-10-06). Verificar en anthropic.com/pricing.
export const PRECIOS_MTOK: Record<string, { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }> = {
  'claude-opus-5-5': { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cacheLectura: 0.01, cacheEscritura: 0.125 },
};

export interface Uso { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costoUSD(modelo: string, u: Uso): number {
  const p = PRECIOS_MTOK[modelo];
  if (!p) throw new Error(`Modelo sin precio configurado: ${modelo}`);
  const t = (u.input_tokens ?? 0) * p.entrada + (u.output_tokens ?? 0) * p.salida
    + (u.cache_read_input_tokens ?? 0) * p.cacheLectura + (u.cache_creation_input_tokens ?? 0) * p.cacheEscritura;
  return Math.round(t) / 1e6; // 6 decimales en USD
}

export const tokensImagen = (w: number, h: number) => Math.ceil((w * h) / 750);

export function percentil(valores: number[], p: number): number | null {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = (v.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return Math.round(v[lo] + (v[hi] - v[lo]) * (idx - lo));
}

/** Proyección: coste por intento medido × volumen + infraestructura fija (referencia). */
export function proyectar(costePorIntento: number, tasaExito: number, volumenes = [100, 500, 1000], fijoMensualUSD = 45) {
  return volumenes.map(n => {
    const intentos = tasaExito > 0 ? Math.ceil(n / tasaExito) : n;
    const ia = Math.round(intentos * costePorIntento * 100) / 100;
    return { escaneos: n, intentos, iaUSD: ia, fijoUSD: fijoMensualUSD, totalUSD: Math.round((ia + fijoMensualUSD) * 100) / 100 };
  });
}

export function inicioMesUTC(f = new Date()) {
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1)).toISOString();
}
