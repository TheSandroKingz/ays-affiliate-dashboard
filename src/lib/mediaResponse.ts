import { NextResponse } from "next/server";

// Construye la respuesta de un archivo de media soportando peticiones Range
// (HTTP 206 Partial Content). Esto es lo que necesita el navegador para poder
// AVANZAR/REBOBINAR (hacer seek) en un vídeo: sin Accept-Ranges/206 el
// reproductor solo puede darle play desde el principio. Para imágenes no molesta
// (un <img> nunca manda Range, se sirve entero con 200).
export function respuestaMedia(
  bytes: Buffer,
  mediaType: string,
  rangeHeader: string | null
): NextResponse {
  const total = bytes.length;
  const comunes: Record<string, string> = {
    "content-type": mediaType,
    // Evita que el navegador reinterprete (MIME sniffing) los bytes del jugador.
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    // Cache privada corta: el navegador la reusa mientras ves el chat.
    "cache-control": "private, max-age=3600",
  };

  // "bytes=start-end" (cualquiera de los dos extremos puede faltar).
  const m = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] !== "" || m[2] !== "")) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end) {
      // Rango no satisfacible.
      return new NextResponse(null, {
        status: 416,
        headers: { ...comunes, "content-range": `bytes */${total}` },
      });
    }
    const slice = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...comunes,
        "content-range": `bytes ${start}-${end}/${total}`,
        "content-length": String(slice.length),
      },
    });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { ...comunes, "content-length": String(total) },
  });
}
