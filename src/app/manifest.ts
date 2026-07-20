import type { MetadataRoute } from "next";

// Manifest de la PWA: permite "Añadir a pantalla de inicio" en el móvil, con
// icono propio y apertura a pantalla completa como una app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A&S Afiliados",
    short_name: "A&S",
    description: "Panel de estadísticas para afiliados",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
