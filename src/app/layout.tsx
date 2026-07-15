import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Poppins({
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard de Afiliados",
  description: "Panel de estadísticas para afiliados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<SpeedInsights /></body>
    </html>
  );
}

