import { NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/userAuth";
import { depositoMedio } from "@/lib/postback";

// Calidad de tráfico del propio afiliado: su depósito medio. Solo su propio dato
// (el user sale del token). Sirve para que sea consciente de su nivel/CPA.
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const deposito = await depositoMedio(user.id);
  return NextResponse.json({ deposito });
}
