"use client";

import { useEffect } from "react";
import { reactivarSiConcedido } from "@/lib/pushClient";

// Silencioso: al abrir la app, si el usuario ya concedió permiso de
// notificaciones, se asegura de que su suscripción sigue guardada en el
// servidor (por si cambió de sesión). No pide permiso ni muestra nada.
export default function PushAutoSubscribe() {
  useEffect(() => {
    reactivarSiConcedido();
  }, []);
  return null;
}
