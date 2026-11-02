import { compararHottok } from './hotmart';

// Rutas /api/admin/*: requieren `Authorization: Bearer <ADMIN_SECRET>` (mínimo 32 caracteres).
export function esAdmin(req: Request): boolean {
  const secreto = process.env.ADMIN_SECRET ?? '';
  if (secreto.length < 32) return false;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return compararHottok(token, secreto);
}
