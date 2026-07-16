import type { NextConfig } from "next";

// Política de Seguridad de Contenido (CSP): restringe de dónde puede la
// web cargar scripts, estilos e imágenes y a dónde puede conectarse.
// Frena la carga de scripts externos maliciosos y la exfiltración de datos.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Cabeceras de seguridad aplicadas a todas las respuestas.
const securityHeaders = [
  // Fuerza HTTPS durante 2 años (evita ataques de degradación a HTTP).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Impide que tu web se cargue dentro de un iframe ajeno (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: csp },
  // Evita que el navegador "adivine" tipos de archivo (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtrar la URL completa a sitios externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva APIs del navegador que la web no usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Aísla el contexto de navegación (mitiga ataques tipo Spectre/XS-Leaks).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Oculta la cabecera "X-Powered-By: Next.js" (menos información al atacante).
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fenimssybwqchhgvavoj.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
