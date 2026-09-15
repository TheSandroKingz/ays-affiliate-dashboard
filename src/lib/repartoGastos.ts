// CONFIGURACIÓN DE GASTOS DE UN AFILIADO (15-sep). La primera vez que entra a
// Gastos elige cuántos socios son, sus nombres y sus conceptos con el % que pone
// cada socio en cada uno (como "Publicidad 65/35" en el Gastos del admin). Queda
// guardado y al apuntar un gasto solo elige concepto, quién pagó e importe.
// Solo cálculos, sin base de datos: lo usan la página del afiliado, la ficha del
// admin y la API.

export type Concepto = { nombre: string; pct: number[] }; // pct[i] = % del socio i
export type ConfigGastos = { socios: string[]; conceptos: Concepto[] }; // socios [] = trabaja solo

export const MAX_SOCIOS = 8;
export const MAX_CONCEPTOS = 30;

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const limpiar = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("es-ES");

// Cada nombre, siempre del mismo color (como Kingz verde y PRZ azul).
const PALETA = ["#10b981", "#38bdf8", "#f59e0b", "#a855f7", "#ef4444", "#eab308", "#22d3ee", "#f472b6"];
export const colorDe = (nombre: string) => {
  let h = 0;
  for (const c of norm(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

const numero = (v: unknown) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

// A partes iguales, cuadrando a 100 con el último: 3 → 33,33 / 33,33 / 33,34.
export function repartoIgual(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((100 / n) * 100) / 100;
  const out = Array<number>(n).fill(base);
  out[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;
  return out;
}

// Solo o de 2 a 8 socios con nombres distintos; de 1 a 30 conceptos con nombres
// distintos y, si hay socios, un % por socio (0 vale) que sume 100.
export function validarConfig(entrada: unknown): { config: ConfigGastos } | { error: string } {
  const e = entrada as { socios?: unknown; conceptos?: unknown } | null;
  if (!e || typeof e !== "object" || !Array.isArray(e.socios) || !Array.isArray(e.conceptos)) {
    return { error: "Configuración no válida." };
  }
  if (e.socios.length === 1) return { error: "Si trabajas solo, elige «Solo yo»." };
  if (e.socios.length > MAX_SOCIOS) return { error: `Como mucho ${MAX_SOCIOS} socios.` };
  const socios: string[] = [];
  const vistos = new Set<string>();
  for (const s of e.socios) {
    const nombre = limpiar(s);
    if (!nombre) return { error: "Falta el nombre de algún socio." };
    if (nombre.length > 30) return { error: "Algún nombre es demasiado largo (máximo 30)." };
    if (vistos.has(norm(nombre))) return { error: `"${nombre}" está repetido.` };
    vistos.add(norm(nombre));
    socios.push(nombre);
  }

  if (e.conceptos.length === 0) return { error: "Añade al menos un concepto." };
  if (e.conceptos.length > MAX_CONCEPTOS) return { error: `Como mucho ${MAX_CONCEPTOS} conceptos.` };
  const conceptos: Concepto[] = [];
  const vistosC = new Set<string>();
  for (const c of e.conceptos as Record<string, unknown>[]) {
    const nombre = limpiar(c?.nombre);
    if (!nombre) return { error: "Falta el nombre de algún concepto." };
    if (nombre.length > 40) return { error: "Algún concepto es demasiado largo (máximo 40)." };
    if (vistosC.has(norm(nombre))) return { error: `El concepto "${nombre}" está repetido.` };
    vistosC.add(norm(nombre));
    let pct: number[] = [];
    if (socios.length) {
      const bruto = Array.isArray(c?.pct) ? (c.pct as unknown[]) : [];
      if (bruto.length !== socios.length) return { error: `Faltan porcentajes en "${nombre}".` };
      pct = bruto.map((v) => Math.round(numero(v) * 100) / 100);
      if (pct.some((p) => !(p >= 0) || p > 100)) return { error: `Algún % de "${nombre}" no es válido.` };
      const suma = pct.reduce((a, b) => a + b, 0);
      if (Math.abs(suma - 100) > 0.05) return { error: `En "${nombre}" los % suman ${fmt(suma)} % y tienen que sumar 100 %.` };
    }
    conceptos.push({ nombre, pct });
  }
  return { config: { socios, conceptos } };
}

// % de cada socio para un gasto. Si el concepto ya no está en la configuración
// (lo borraron o es de antes de configurar), a partes iguales.
export function pctDeConcepto(concepto: string | null | undefined, config: ConfigGastos): { pct: number[]; conocido: boolean } {
  const c = config.conceptos.find((x) => norm(x.nombre) === norm(concepto));
  return c ? { pct: c.pct, conocido: true } : { pct: repartoIgual(config.socios.length), conocido: false };
}

export const socioDe = (nombre: string | null | undefined, config: ConfigGastos) =>
  config.socios.find((s) => norm(s) === norm(nombre)) ?? null;

// Transferencias mínimas para cuadrar: los que pusieron de menos pagan a los que
// pusieron de más.
export function liquidar(filas: { nombre: string; saldo: number }[]): { de: string; a: string; importe: number }[] {
  const deben = filas.filter((f) => f.saldo < -0.005).map((f) => ({ nombre: f.nombre, v: -f.saldo })).sort((a, b) => b.v - a.v);
  const cobran = filas.filter((f) => f.saldo > 0.005).map((f) => ({ nombre: f.nombre, v: f.saldo })).sort((a, b) => b.v - a.v);
  const out: { de: string; a: string; importe: number }[] = [];
  let i = 0, j = 0;
  while (i < deben.length && j < cobran.length) {
    const x = Math.min(deben[i].v, cobran[j].v);
    if (x >= 0.005) out.push({ de: deben[i].nombre, a: cobran[j].nombre, importe: Math.round(x * 100) / 100 });
    deben[i].v -= x;
    cobran[j].v -= x;
    if (deben[i].v < 0.005) i++;
    if (cobran[j].v < 0.005) j++;
  }
  return out.filter((t) => t.importe >= 0.01);
}

// Cuentas del periodo de un equipo: lo que puso cada socio, lo que le toca según
// el % de cada concepto, y quién debe a quién.
export function cuentasEquipo(gastos: { concepto: string; pagado_por: string | null; importe: number }[], config: ConfigGastos) {
  const n = config.socios.length;
  const toca = Array<number>(n).fill(0);
  const puso = Array<number>(n).fill(0);
  let total = 0;
  let sinPagador = false;
  for (const g of gastos) {
    const imp = Number(g.importe);
    total += imp;
    pctDeConcepto(g.concepto, config).pct.forEach((p, i) => (toca[i] += (imp * p) / 100));
    const i = config.socios.findIndex((s) => norm(s) === norm(g.pagado_por));
    if (i >= 0) puso[i] += imp;
    else sinPagador = true;
  }
  const filas = config.socios.map((nombre, i) => ({ nombre, puso: puso[i], toca: toca[i], saldo: puso[i] - toca[i] }));
  return { total, filas, sinPagador, transferencias: liquidar(filas) };
}
