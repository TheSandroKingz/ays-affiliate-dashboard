// REPARTO DE GASTOS DE UN EQUIPO DE AFILIADOS (15-sep). Como Kingz/PRZ en el
// apartado de Gastos del admin, pero con los nombres y % que ponga cada equipo
// (p. ej. iAfrika: Alan y Afrika). Sin categorías: un solo % por persona.
// Solo cálculos, sin base de datos: lo usan la página del afiliado y la ficha.

export type Miembro = { nombre: string; pct: number };

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Cada nombre, siempre del mismo color (como Kingz verde y PRZ azul).
const PALETA = ["#10b981", "#38bdf8", "#f59e0b", "#a855f7", "#ef4444", "#eab308", "#22d3ee", "#f472b6"];
export const colorDe = (nombre: string) => {
  let h = 0;
  for (const c of norm(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

const numero = (v: unknown) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// De 2 a 8 personas, nombres distintos, % mayores que 0 que sumen 100.
export function validarMiembros(entrada: unknown): { miembros: Miembro[] } | { error: string } {
  if (!Array.isArray(entrada)) return { error: "Reparto no válido." };
  if (entrada.length === 0) return { miembros: [] };
  if (entrada.length < 2) return { error: "Un reparto necesita al menos 2 personas." };
  if (entrada.length > 8) return { error: "Como mucho 8 personas." };
  const miembros: Miembro[] = [];
  const vistos = new Set<string>();
  for (const x of entrada as Record<string, unknown>[]) {
    const nombre = String(x?.nombre ?? "").trim().replace(/\s+/g, " ");
    const pct = Math.round(numero(x?.pct) * 100) / 100;
    if (!nombre) return { error: "Falta el nombre de alguna persona." };
    if (nombre.length > 30) return { error: "Algún nombre es demasiado largo (máximo 30)." };
    if (vistos.has(norm(nombre))) return { error: `"${nombre}" está repetido.` };
    if (!(pct > 0) || pct > 100) return { error: `El % de ${nombre} no es válido.` };
    vistos.add(norm(nombre));
    miembros.push({ nombre, pct });
  }
  const suma = miembros.reduce((s, m) => s + m.pct, 0);
  if (Math.abs(suma - 100) > 0.05) return { error: `Los porcentajes suman ${suma.toLocaleString("es-ES")} % y tienen que sumar 100 %.` };
  return { miembros };
}

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

// Cuentas del periodo: lo que puso cada uno, lo que le toca, y quién debe a quién.
export function cuentasEquipo(gastos: { pagado_por: string | null; importe: number }[], miembros: Miembro[]) {
  const total = gastos.reduce((s, g) => s + Number(g.importe), 0);
  const filas = miembros.map((m) => {
    const puso = gastos.filter((g) => norm(g.pagado_por) === norm(m.nombre)).reduce((s, g) => s + Number(g.importe), 0);
    const toca = (total * m.pct) / 100;
    return { nombre: m.nombre, pct: m.pct, puso, toca, saldo: puso - toca };
  });
  const sinPagador = gastos.some((g) => !miembros.some((m) => norm(m.nombre) === norm(g.pagado_por)));
  return { total, filas, sinPagador, transferencias: liquidar(filas) };
}

export const esMiembro = (nombre: string | null | undefined, miembros: Miembro[]) =>
  miembros.some((m) => norm(m.nombre) === norm(nombre));
