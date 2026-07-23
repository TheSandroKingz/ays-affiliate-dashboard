// Detecta si un texto contiene emojis / pictogramas. Se usa para NO permitir
// emojis en el nombre de usuario (afea la web y rompe iniciales/avatares).
// \p{Extended_Pictographic} cubre la práctica totalidad de emojis.
export const contieneEmoji = (s: string): boolean =>
  /\p{Extended_Pictographic}/u.test(s ?? "");
