// ID del usuario administrador. Fuente única de verdad.
// Importable tanto en cliente como en servidor (no arrastra dependencias).
export const ADMIN_USER_ID = "a38a91c3-1f25-42df-ad5b-fbef6c09fee0";

// "Cuentas propias" del admin: cuentas de afiliado que en realidad son suyas
// (p. ej. Mongolitos, desde donde trabaja él). Se muestran su CPA y su actividad,
// pero NO se les paga (le pago = 0) porque el dinero es del propio admin: se
// queda como margen entero. En el postback no se les acredita comisión, así el
// margen del admin sale completo sin tocar el cálculo del panel.
export const CUENTAS_PROPIAS = new Set<string>([
  "435e4069-36c9-46f8-8c4c-8222e6c983d7", // Mongolitos
]);
export const esCuentaPropia = (userId: string | null | undefined) =>
  !!userId && CUENTAS_PROPIAS.has(userId);
