// CONFIGURACIÓN DE GASTOS DE UN AFILIADO (15-sep). La primera vez que entra a
// Gastos elige cuántos socios son, sus nombres y sus conceptos con el % que pone
// cada socio en cada uno (como "Publicidad 65/35" en el Gastos del admin). Queda
// guardado; al apuntar un gasto elige concepto, quién pagó e importe, y los % del
// concepto salen por defecto pero se pueden cambiar EN ESE GASTO (se guardan con
// él, así que si entra un socio nuevo los gastos de antes no cambian).
// Solo cálculos, sin base de datos: lo usan la página del afiliado, la ficha del
// admin y la API.

export type Concepto = { nombre: string; pct: number[] }; // pct[i] = % del socio i
export type ConfigGastos = { socios: string[]; conceptos: Concepto[] }; // socios [] = trabaja solo
export type Parte = { nombre: string; pct: number }; // % de una persona en un gasto
export type GastoCuentas = { concepto: string; pagado_por: string | null; importe: number; reparto?: Parte[] | null };

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
      if (pct.some((p) => !(p >= 0) || p > 100)) return { error: `En "${nombre}" falta algún % o no es válido.` };
      const suma = pct.reduce((a, b) => a + b, 0);
      if (Math.abs(suma - 100) > 0.05) return { error: `En "${nombre}" los % suman ${fmt(suma)} % y tienen que sumar 100 %.` };
    }
    conceptos.push({ nombre, pct });
  }
  return { config: { socios, conceptos } };
}

// % de cada persona en UN gasto: hasta 8 nombres distintos, 0-100, suma 100.
// Vacío o null = sin reparto propio (trabaja solo).
export function validarReparto(entrada: unknown): { reparto: Parte[] | null } | { error: string } {
  if (entrada == null || (Array.isArray(entrada) && entrada.length === 0)) return { reparto: null };
  if (!Array.isArray(entrada) || entrada.length > MAX_SOCIOS) return { error: "Los % del gasto no son válidos." };
  const reparto: Parte[] = [];
  const vistos = new Set<string>();
  for (const x of entrada as Record<string, unknown>[]) {
    const nombre = limpiar(x?.nombre);
    const pct = Math.round(numero(x?.pct) * 100) / 100;
    if (!nombre || nombre.length > 30 || vistos.has(norm(nombre))) return { error: "Los % del gasto no son válidos." };
    if (!(pct >= 0) || pct > 100) return { error: `Falta el % de ${nombre} o no es válido.` };
    vistos.add(norm(nombre));
    reparto.push({ nombre, pct });
  }
  const suma = reparto.reduce((s, p) => s + p.pct, 0);
  if (Math.abs(suma - 100) > 0.05) return { error: `Los % de este gasto suman ${fmt(suma)} % y tienen que sumar 100 %.` };
  return { reparto };
}

// % de cada socio para un concepto. Si el concepto ya no está en la configuración
// (lo borraron o es de antes de configurar), a partes iguales.
export function pctDeConcepto(concepto: string | null | undefined, config: ConfigGastos): { pct: number[]; conocido: boolean } {
  const c = config.conceptos.find((x) => norm(x.nombre) === norm(concepto));
  return c ? { pct: c.pct, conocido: true } : { pct: repartoIgual(config.socios.length), conocido: false };
}

// Reparto de un gasto: el suyo propio si lo tiene; si no (gastos de antes), el
// del concepto con los socios de ahora.
export function repartoDeGasto(g: { concepto: string; reparto?: Parte[] | null }, config: ConfigGastos): Parte[] {
  if (g.reparto?.length) return g.reparto;
  const { pct } = pctDeConcepto(g.concepto, config);
  return config.socios.map((nombre, i) => ({ nombre, pct: pct[i] ?? 0 }));
}

// % de una persona dentro de un reparto (0 si no está: p. ej. un socio que entró
// después de ese gasto).
export const pctDe = (reparto: Parte[], nombre: string) => reparto.find((p) => norm(p.nombre) === norm(nombre))?.pct ?? 0;

// ¿El gasto tiene % distintos de los de su concepto?
export function repartoAMedida(g: { concepto: string; reparto?: Parte[] | null }, config: ConfigGastos): boolean {
  if (!g.reparto?.length) return false;
  const base = repartoDeGasto({ concepto: g.concepto }, config);
  const nombres = new Set([...base, ...g.reparto].map((p) => norm(p.nombre)));
  return [...nombres].some((n) => Math.abs(pctDe(g.reparto!, n) - pctDe(base, n)) > 0.005);
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

// Cuentas del periodo de un equipo: lo que puso cada uno, lo que le toca según el
// % de CADA gasto, y quién debe a quién. Salen los socios de ahora y, además,
// cualquiera que aparezca en gastos de antes (alguien que ya no está o al que le
// cambiaron el nombre), para que su dinero no desaparezca de las cuentas.
export function cuentasEquipo(gastos: GastoCuentas[], config: ConfigGastos) {
  const nombres: string[] = [...config.socios];
  const apuntar = (n: string | null | undefined) => {
    const l = limpiar(n);
    if (l && !nombres.some((x) => norm(x) === norm(l))) nombres.push(l);
  };
  const toca = new Map<string, number>();
  const puso = new Map<string, number>();
  let total = 0;
  let sinPagador = false;
  for (const g of gastos) {
    const imp = Number(g.importe);
    total += imp;
    for (const p of repartoDeGasto(g, config)) {
      if (p.pct <= 0) continue;
      apuntar(p.nombre);
      toca.set(norm(p.nombre), (toca.get(norm(p.nombre)) ?? 0) + (imp * p.pct) / 100);
    }
    if (limpiar(g.pagado_por)) {
      apuntar(g.pagado_por);
      puso.set(norm(g.pagado_por), (puso.get(norm(g.pagado_por)) ?? 0) + imp);
    } else {
      sinPagador = true;
    }
  }
  const filas = nombres
    .map((nombre) => {
      const t = toca.get(norm(nombre)) ?? 0;
      const p = puso.get(norm(nombre)) ?? 0;
      return { nombre, puso: p, toca: t, saldo: p - t, esSocio: config.socios.some((s) => norm(s) === norm(nombre)) };
    })
    .filter((f) => f.esSocio || f.puso > 0.004 || f.toca > 0.004);
  return { total, filas, sinPagador, transferencias: liquidar(filas) };
}
