# Armario Virtual Hombres · PWA B2C (Fábrica V7)

Escanea tu ropa, la app la recorta sola, la clasifica con IA y la ordena por **estación** (según tu hemisferio), **talla**, **peso** y **costo por uso**. Funciona sin internet. Precio: **$397 MXN / $21 USD** en Hotmart.

Construido con el Skill `sistema-mini-apps-2027-v7-definitiva-latam-mexico-harvey-6skills` (sin modificarlo).
Evaluación de los 10 puntos verdes: [docs/PUNTOS_VERDES.md](docs/PUNTOS_VERDES.md).

```
public/                     ← lo que publica Vercel
  index.html  styles.css  config.js  manifest.json  sw.js  icons/
  js/app.js (pantallas)  core.js (tallas, estaciones, peso, costes)  imagen.js (recorte local)
     db.js (IndexedDB)  nube.js (Supabase)
supabase/
  supabase_hotmart_setup.sql          ← tablas, RLS, bucket privado, funciones
  functions/hotmart-webhook/index.ts  ← Webhook Hotmart v2.0.0 + Hottok
  functions/escanear-prenda/index.ts  ← Escáner IA (Claude) + cuota + registro de coste
  functions/borrar-cuenta/index.ts    ← Privacidad: borrar cuenta y fotos
  functions/_shared/                  ← lógica pura probada (hotmart.js, costes.js)
tests/index.html                      ← 46 pruebas en el navegador
vercel.json                           ← sin source maps, CSP, cabeceras
```

## Despliegue en 5 minutos

1. **Supabase** → crea el proyecto → *SQL Editor* → pega y corre `supabase/supabase_hotmart_setup.sql`. La última consulta debe mostrar `rls = true` en las 4 tablas.
2. **Auth** → *Email* activado. En *Email Templates → Magic Link* agrega `{{ .Token }}` para que llegue el código de 6 dígitos. En *URL Configuration* pon tu dominio de Vercel.
3. **Edge Functions** (con la [CLI de Supabase](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase link --project-ref TU_REF
   ```
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... HOTMART_HOTTOK=... HOTMART_PRODUCT_ID=... ALLOWED_ORIGINS=https://tu-app.vercel.app
   ```
   ```bash
   supabase functions deploy hotmart-webhook --no-verify-jwt
   ```
   ```bash
   supabase functions deploy escanear-prenda
   ```
   ```bash
   supabase functions deploy borrar-cuenta
   ```
4. **Hotmart** → *Herramientas → Webhook (API y notificaciones)* → URL `https://TU_REF.supabase.co/functions/v1/hotmart-webhook`, **versión 2.0.0**, eventos de compra (aprobada, completa, reembolsada, contracargo, cancelada, protesto) y cancelación de suscripción. Copia el **Hottok** al secreto `HOTMART_HOTTOK`.
5. **`public/config.js`** → pon `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `HOTMART_CHECKOUT_URL`.
6. **Vercel** → importa la carpeta (o `vercel --prod`). No hay build: `vercel.json` publica `public/`.

Si `config.js` queda vacío, la app corre en **modo demo local**: todo funciona menos la IA, la nube y la licencia.

## Verificación antes de vender (verificador-datos V7)
- [ ] `tests/index.html` en verde (46/46). Local: `powershell -File scripts/serve.ps1` → http://localhost:5173/tests/
- [ ] SQL: `select * from licencias;` vacío, y la consulta de RLS en `true`.
- [ ] Hotmart → botón **Enviar prueba** del webhook → respuesta 200 y fila en `hotmart_eventos`.
- [ ] Compra de prueba con tu email → `licencias.estado = 'activa'` → entra a la app con el código.
- [ ] Escanea una prenda → aparece el coste en pantalla y una fila en `ai_usage`.
- [ ] Reembolso de prueba → `estado = 'reembolsada'`, `hottok_evento = 'bloqueo_sesion'` → la app cierra la sesión.
- [ ] Modo avión: la app abre, muestra el armario y genera QR.
- [ ] `https://tu-app.vercel.app/js/app.js.map` → 404.

## Costes de IA (medición)
| Modelo (`CLAUDE_MODEL`) | Entrada / salida por MTok | Escaneo típico* | 120 escaneos/mes |
|---|---|---|---|
| `claude-opus-5-5` (predeterminado) | $4 / $20 | ≈ $0.010–0.02 | ≈ $1.2–2.4 |
| `claude-haiku-5-5` | $0.10 / $0.50 | ≈ $0.0003–0.0005 | ≈ $0.05 |

\*Foto de 768 px ≈ 790 tokens + ~400 de instrucciones; la salida JSON es de ~300–600 tokens con esfuerzo `low`. Son estimaciones: **el coste real de cada escaneo queda en `ai_usage`**, y el resumen está en la vista `costes_ia_mensual` (SQL Editor). Cada usuario tiene un tope de `AI_CUOTA_MENSUAL` escaneos y `AI_TOPE_USD_MES` dólares al mes. Revisa los precios vigentes en anthropic.com/pricing.

## Privacidad
- Fotos, medidas, peso corporal y foto de cuerpo: **solo en el teléfono** (IndexedDB).
- IA: opt-in. Solo se envía la foto de la prenda (768 px) a la API de Anthropic. No se guarda en nuestro servidor.
- Respaldo en la nube: opt-in, en un bucket privado por usuario con RLS. No incluye medidas.
- Exportar a JSON, borrar todo del teléfono y borrar la cuenta y el respaldo desde Ajustes.
- `hotmart_eventos` guarda un payload mínimo, sin documento, teléfono ni dirección del comprador.

## Al publicar una versión nueva
Cambia `VERSION` en `public/sw.js`. Así los teléfonos descargan los archivos nuevos.
