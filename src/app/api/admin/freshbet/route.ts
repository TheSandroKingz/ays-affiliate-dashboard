import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

type Row = {
  day: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

function totalsOf(rows: Row[]) {
  return rows.reduce(
    (acc, r) => ({
      commission: acc.commission + Number(r.commission ?? 0),
      clicks: acc.clicks + Number(r.clicks ?? 0),
      registrations: acc.registrations + Number(r.registrations ?? 0),
      ftd: acc.ftd + Number(r.ftd ?? 0),
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );
}

// GET: histórico de freshbet ya importado (para pintarlo en el Admin).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("freshbet_daily")
    .select("day, commission, clicks, registrations, ftd")
    .order("day", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  return NextResponse.json({ rows, totals: totalsOf(rows) });
}

// POST: subir el CSV exportado de freshbet.
// Columnas esperadas (cabecera): Day, Commission, Impressions, Visitors,
// Registrations, FTD. Se hace upsert por día, así re-subir actualiza.
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const csv = await request.text();
  if (!csv.trim()) {
    return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  }

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json(
      { error: "El archivo no tiene datos." },
      { status: 400 }
    );
  }

  // Parseo de una línea CSV respetando comillas (por si algún valor lleva comas).
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  // Número tolerante: quita comillas/espacios/símbolos, entiende coma decimal
  // europea y separador de miles, y si no es válido devuelve 0.
  const num = (cols: string[], i: number): number => {
    if (i === -1) return 0;
    let s = (cols[i] ?? "").replace(/["'\s€$]/g, "");
    if (!s) return 0;
    if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, ""); // 1,234.56 -> 1234.56
    else if (s.includes(",")) s = s.replace(",", "."); // 233,64 -> 233.64
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // Localizamos las columnas por su nombre en la cabecera (por si cambia el orden).
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iDay = idx("day");
  const iCommission = idx("commission");
  const iVisitors = idx("visitors");
  const iRegs = idx("registrations");
  const iFtd = idx("ftd");

  if (iDay === -1) {
    return NextResponse.json(
      { error: "No encuentro la columna 'Day' en el archivo." },
      { status: 400 }
    );
  }

  // Avisar si faltan columnas esperadas (para no importar métricas a 0 en silencio).
  const faltan = [
    iCommission === -1 && "Commission",
    iVisitors === -1 && "Visitors",
    iRegs === -1 && "Registrations",
    iFtd === -1 && "FTD",
  ].filter(Boolean) as string[];

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseLine(line);
    const rawDay = (cols[iDay] ?? "").replace(/["']/g, "").trim();
    if (!rawDay) continue;
    // freshbet usa "2026/07/01"; lo pasamos a "2026-07-01".
    const day = rawDay.replace(/\//g, "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    rows.push({
      day,
      commission: num(cols, iCommission),
      clicks: num(cols, iVisitors),
      registrations: num(cols, iRegs),
      ftd: num(cols, iFtd),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No se pudo leer ninguna fila válida del archivo." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("freshbet_daily")
    .upsert(rows, { onConflict: "day" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imported: rows.length,
    totals: totalsOf(rows),
    aviso: faltan.length
      ? `No encontré estas columnas (se importaron como 0): ${faltan.join(", ")}`
      : undefined,
  });
}
