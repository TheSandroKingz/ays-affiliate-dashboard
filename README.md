# A & S Afiliados — Panel de Afiliados

Panel de control para el programa de afiliados de **A & S Afiliados** (iGaming, mercado español). Los afiliados consultan sus estadísticas, obtienen sus enlaces de promoción, reclutan subafiliados y gestionan su cuenta. Incluye un panel de administración para ver estadísticas globales y ajustar comisiones.

## Tecnologías

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** y **Tailwind CSS v4**
- **Supabase** — autenticación, base de datos (Postgres) y almacenamiento
- **Recharts** — gráficos del panel
- Desplegado en **Vercel**

## Puesta en marcha

```bash
npm install
npm run dev      # arranca en http://localhost:3000
```

Scripts disponibles:

| Script          | Descripción                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Servidor de desarrollo               |
| `npm run build` | Compilación de producción            |
| `npm run start` | Sirve la compilación de producción   |
| `npm run lint`  | Linter (ESLint)                      |

## Variables de entorno

Crea un archivo `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
POSTBACK_SECRET=...
CRON_SECRET=...
```

> `SUPABASE_SERVICE_ROLE_KEY`, `POSTBACK_SECRET` y `CRON_SECRET` son secretos de servidor: no los expongas nunca en el cliente.

## Estructura

- `src/app/login`, `registro`, `recuperar`, `reset-password` — autenticación
- `src/app/dashboard` — panel del afiliado (estadísticas, informes, pagos, subafiliados, plan de comisión, cuenta)
- `src/app/admin` — panel de administración (estadísticas globales, comisiones por afiliado)
- `src/app/api` — API interna: login, registro, pagos, subafiliados, postbacks (S2S), cron y panel de admin
- `src/app/go/[code]` — redirección con seguimiento de clics hacia el enlace de promoción del afiliado

## Cómo funciona el seguimiento

Cada afiliado tiene un enlace de promoción (`promo_link`). El enlace público `/go/{código}` cuenta el clic y redirige a ese destino. La red de afiliación envía **postbacks** (servidor a servidor) a `/api/postback/*` para registrar altas, primeros depósitos (FTD) y comisiones, protegidos con `POSTBACK_SECRET`.

## Notas

Este proyecto usa una versión de Next.js con cambios respecto a lo habitual. Consulta la documentación incluida en `node_modules/next/dist/docs/` antes de tocar convenciones del framework (ver `AGENTS.md`).
