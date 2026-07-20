// Copia de seguridad de los datos críticos (afiliados, estadísticas diarias,
// pagos y la caja negra de eventos). Vuelca cada tabla a un JSON con fecha en
// la carpeta backups/ (que NO se sube a git). Ejecuta:  node scripts/backup.mjs
//
// Es una foto puntual: guárdala en sitio seguro cada cierto tiempo. No sustituye
// a los backups automáticos de Supabase, pero te da una copia tuya, portable.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY") || get("SUPABASE_SERVICE_ROLE");
if (!url || !key) {
  console.error("Faltan credenciales en .env.local");
  process.exit(1);
}
const H = { apikey: key, Authorization: "Bearer " + key };

// Tablas a respaldar. Traemos todo (paginando por si crecen).
const TABLAS = ["affiliates", "affiliate_daily_stats", "payments", "postback_events"];

async function volcar(tabla) {
  const filas = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${url}/rest/v1/${tabla}?select=*&order=id.asc`, {
      headers: { ...H, Range: `${desde}-${desde + paso - 1}`, Prefer: "count=exact" },
    }).catch(() => null);
    // order=id.asc puede fallar si la tabla no tiene "id": reintenta sin orden.
    let res = r;
    if (!res || res.status >= 400) {
      res = await fetch(`${url}/rest/v1/${tabla}?select=*`, {
        headers: { ...H, Range: `${desde}-${desde + paso - 1}` },
      });
    }
    if (res.status >= 400) {
      console.warn(`  ! ${tabla}: no se pudo leer (${res.status})`);
      break;
    }
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < paso) break;
  }
  return filas;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = { generado: new Date().toISOString(), tablas: {} };
for (const t of TABLAS) {
  const filas = await volcar(t);
  backup.tablas[t] = filas;
  console.log(`  ${t}: ${filas.length} filas`);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const destino = new URL(`../backups/backup-${stamp}.json`, import.meta.url);
writeFileSync(destino, JSON.stringify(backup, null, 2));
console.log(`\nCopia guardada en backups/backup-${stamp}.json`);
