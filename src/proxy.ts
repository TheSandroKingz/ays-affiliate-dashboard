import { NextRequest, NextResponse } from "next/server";

// 🧱 CORTAFUEGOS EN EL BORDE (antes "middleware"; en esta versión de Next es
// "proxy"). Primera barrera BARATA y uniforme, ANTES de que se ejecute ningún
// endpoint. NO sustituye a los controles de cada ruta (auth, secretos,
// rate-limit por cuenta): es defensa en profundidad.
//
// ⚠️ MUY IMPORTANTE: NO rate-limitamos los webhooks de Telegram ni el postback de
// dinero de Blue. Esos reciben tráfico de máquina (Telegram/Blue) y ya están
// protegidos por SECRETO; frenarlos podría PERDER mensajes o QFTDs. Solo:
//   1) Límite de TAMAÑO de body en /api (rechaza payloads gigantes = DoS barato).
//   2) Rate-limit por IP en el redirect PÚBLICO /go (evita inundación/enumeración).
// Blindado: ante cualquier fallo del propio proxy, deja pasar (nunca corta
// tráfico legítimo por un error nuestro).

export const config = {
  matcher: ["/api/:path*", "/go/:path*"],
};

const MAX_BODY = 256 * 1024; // 256 KB — de sobra para el JSON de la app y los updates de Telegram

// Rate-limit en memoria SOLO para /go (por isolate de Edge; speed-bump, no WAF).
const goStore = new Map<string, { count: number; reset: number }>();
const GO_LIMITE = 120; // peticiones por IP
const GO_VENTANA = 60_000; // 1 min

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown"
  ).trim();
}

export function proxy(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl;

    // 1) Body demasiado grande en /api → 413 sin procesarlo.
    if (pathname.startsWith("/api/")) {
      const len = Number(req.headers.get("content-length") || 0);
      if (len > MAX_BODY) {
        return new NextResponse("Payload too large", { status: 413 });
      }
      return NextResponse.next();
    }

    // 2) /go: rate-limit por IP (el redirect es público y sin secreto).
    if (pathname.startsWith("/go/")) {
      const now = Date.now();
      if (goStore.size > 20000) {
        for (const [k, v] of goStore) if (now > v.reset) goStore.delete(k);
      }
      const key = clientIp(req);
      const e = goStore.get(key);
      if (!e || now > e.reset) {
        goStore.set(key, { count: 1, reset: now + GO_VENTANA });
      } else if (e.count >= GO_LIMITE) {
        // A la home en vez de 429: un humano real nunca llega a 120/min.
        return NextResponse.redirect(new URL("/", req.url));
      } else {
        e.count++;
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next(); // nunca romper el tráfico por un fallo del proxy
  }
}
