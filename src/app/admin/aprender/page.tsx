import { redirect } from "next/navigation";

// "Aprender" se movió dentro del apartado Telegram (todo en un solo sitio).
// Mantenemos la ruta redirigiendo, por si hay algún enlace guardado.
export default function AprenderRedirect() {
  redirect("/admin/telegram");
}
