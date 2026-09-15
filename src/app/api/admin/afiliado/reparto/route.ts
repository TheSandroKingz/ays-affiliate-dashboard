import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { guardarConfig } from "@/lib/repartoGastosServidor";

// El admin pone o cambia la configuración de gastos de un afiliado (socios y
// conceptos con el % de cada uno) desde su ficha.
export async function PUT(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body?.userId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: "Falta el afiliado." }, { status: 400 });
  const r = await guardarConfig(userId, body?.config);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, config: r.config });
}
