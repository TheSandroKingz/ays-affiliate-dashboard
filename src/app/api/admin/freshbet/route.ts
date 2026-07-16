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

  // Localizamos las columnas por su nombre en la cabecera (por si cambia el orden).
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
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

  const num = (cols: string[], i: number) =>
    i === -1 ? 0 : Number((cols[i] ?? "0").trim()) || 0;

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const rawDay = (cols[iDay] ?? "").trim();
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

  return NextResponse.json({ ok: true, imported: rows.length, totals: totalsOf(rows) });
}
