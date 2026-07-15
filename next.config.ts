import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las respuestas.
const securityHeaders = [
  // Fuerza HTTPS durante 2 años (evita ataques de degradación a HTTP).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Impide que tu web se cargue dentro de un iframe ajeno (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // Evita que el navegador "adivine" tipos de archivo (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtrar la URL completa a sitios externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva APIs del navegador que la web no usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
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
