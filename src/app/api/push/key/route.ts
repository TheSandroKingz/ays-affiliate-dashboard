import { NextResponse } from "next/server";

// La clave PÚBLICA de VAPID. No es un secreto: ya va en el JavaScript que se
// descarga cualquiera que abra la web. El service worker la necesita para poder
// volver a suscribirse solo cuando el móvil rota el endpoint, y ahí no tiene
// acceso a las variables de entorno.
export async function GET() {
  return NextResponse.json({
    key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  });
}
