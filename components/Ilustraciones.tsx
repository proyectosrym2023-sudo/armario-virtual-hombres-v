// Ilustraciones vectoriales propias (no son fotos de clientes ni de productos reales).
const P = { fill: 'currentColor' } as const;
export const ILUSTRACIONES: Record<string, { nombre: string; color: string; svg: React.ReactNode }> = {
  camisa: { nombre: 'Camisa Oxford', color: '#9cc3e6', svg: <path {...P} d="M38 18l12-6h20l12 6 18 14-10 14-8-5v59H38V41l-8 5-10-14zM60 12v94" /> },
  polo: { nombre: 'Polo piqué', color: '#14284b', svg: <path {...P} d="M40 18l12-6 8 8 8-8 12 6 18 14-10 12-8-4v60H40V40l-8 4-10-12z" /> },
  jeans: { nombre: 'Jeans slim', color: '#3a5a8c', svg: <path {...P} d="M38 12h44l6 96H66l-6-62-6 62H32z" /> },
  chaqueta: { nombre: 'Chaqueta', color: '#6b4a2f', svg: <path {...P} d="M36 16l14-6h20l14 6 16 14-6 74H86V46l-2 60H36l-2-60v58H26l-6-74z" /> },
  reloj: { nombre: 'Reloj', color: '#c0c4c8', svg: <g {...P}><rect x="48" y="8" width="24" height="26" rx="6" /><rect x="48" y="86" width="24" height="26" rx="6" /><circle cx="60" cy="60" r="28" /></g> },
  lentes: { nombre: 'Lentes', color: '#1a1a1a', svg: <g {...P}><circle cx="36" cy="62" r="20" /><circle cx="84" cy="62" r="20" /><rect x="52" y="56" width="16" height="6" /></g> },
};

export function Ilustracion({ id, size = 120 }: { id: string; size?: number }) {
  const i = ILUSTRACIONES[id];
  return <svg viewBox="0 0 120 120" width={size} height={size} style={{ color: i.color }} role="img" aria-label={i.nombre}>{i.svg}</svg>;
}
