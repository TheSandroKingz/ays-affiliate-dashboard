// Traduce los mensajes de error de Supabase Auth (que vienen en inglés)
// a español, para no mostrar textos en inglés al usuario.
export function traducirError(mensaje: string | undefined | null): string {
  if (!mensaje) return "Ha ocurrido un error. Inténtalo de nuevo.";
  const m = mensaje.toLowerCase();

  if (m.includes("invalid login credentials"))
    return "Usuario o contraseña incorrectos.";
  if (m.includes("email not confirmed"))
    return "Debes confirmar tu correo antes de entrar.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese correo ya está registrado. Inicia sesión.";
  if (m.includes("password should be at least") || m.includes("at least 6"))
    return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid format"))
    return "El correo no tiene un formato válido.";
  if (m.includes("should be different") || m.includes("same"))
    return "La nueva contraseña debe ser distinta a la anterior.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (m.includes("network") || m.includes("fetch"))
    return "Error de conexión. Comprueba tu internet.";

  return "Ha ocurrido un error. Inténtalo de nuevo.";
}
