# Armario Virtual Hombres · v2

App web (Next.js + Supabase + Vercel) para que un hombre escanee, organice y encuentre su ropa y sus accesorios. Se vende por **suscripción mensual o anual en Hotmart**, sin tiendas de aplicaciones.

## Empezar
```bash
npm install
```
```bash
cp .env.example .env.local
```
Completa `.env.local` con un proyecto de Supabase **de pruebas**.
```bash
npm run db:migrar
```
```bash
npm run dev
```
Abre http://localhost:3000

## Comandos
| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias (sin red) |
| `npm run test:integracion` | Pruebas reales de Hotmart, RLS, privacidad y perfil contra el Supabase de pruebas |
| `npm run medir` | Mide el escáner con fotos reales en `fotos-prueba/` (gasta créditos de la API) |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript estricto |

## Documentación
- [Arquitectura](docs/ARQUITECTURA.md)
- [Despliegue y variables de entorno](docs/DESPLIEGUE.md)
- [Administración](docs/ADMINISTRACION.md)
- [Costes y precios](docs/COSTES_Y_PRECIOS.md)
- [Informe de QA](docs/QA.md)
- Reportes por fase: [Fase 1](docs/fases/FASE-01.md) y [Fases 2-10](docs/fases/FASES-02-10.md)

La versión anterior (PWA sin build, pago único) está en `legacy/pwa-v1/`, sin cambios.
