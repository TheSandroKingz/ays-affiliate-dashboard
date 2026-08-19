import { YAIZA_START } from "@/lib/adminId";

// Sueldo mensual de Yaiza por revisar los chats.
export const YAIZA_IMPORTE = 500; // €/mes

// Próximo pago a Yaiza: empezó el día YAIZA_START y cobra el MISMO día de cada
// mes; el primer pago es un mes después de empezar. Devuelve la fecha del próximo
// pago (el primer "día de cobro" que aún no ha pasado), los días que faltan y el
// importe. Todo en zona Madrid para que "hoy" cuadre con el server.
export function proximoPagoYaiza(): { fecha: string; dias: number; importe: number } {
  const hoyStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const [hy, hm, hd] = hoyStr.split("-").map(Number);
  const hoy = new Date(hy, hm - 1, hd);
  const [iy, im, id] = YAIZA_START.split("-").map(Number);
  let pago = new Date(iy, im - 1 + 1, id); // primer pago: 1 mes después de empezar
  while (pago < hoy) pago = new Date(pago.getFullYear(), pago.getMonth() + 1, id);
  const dias = Math.round((pago.getTime() - hoy.getTime()) / 86400000);
  return {
    fecha: pago.toLocaleDateString("es-ES", { day: "numeric", month: "long" }),
    dias,
    importe: YAIZA_IMPORTE,
  };
}
