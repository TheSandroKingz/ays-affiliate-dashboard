import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AnimatedBackground from "@/components/AnimatedBackground";

const geistSans = Poppins({
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "A&S Afiliados",
  description: "Panel de estadísticas para afiliados",
  // Instalable en el móvil (PWA): icono en la pantalla de inicio y modo app.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black" (no translucent): el contenido empieza DEBAJO de la barra de
    // estado, así el header nunca queda tapado por la hora/notch en la app.
    statusBarStyle: "black",
    title: "A&S Afiliados",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supaOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <html
      lang="es"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <head>
        {/* Preparar la conexión con Supabase antes de pedir datos: la primera
            consulta (y el refresco de sesión) salen más rápidas en móvil. */}
        {supaOrigin && (
          <>
            <link rel="preconnect" href={supaOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supaOrigin} />
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col"><AnimatedBackground />{children}<SpeedInsights /></body>
    </html>
  );
}

