// Cálculo del panel de admin (lo que te llevas limpio) a partir de las filas
// diarias. Extraído aquí para reutilizarlo desde /api/admin/stats (con filtro
// de fechas) y /api/admin/overview (varios periodos con UNA sola consulta),
// sin duplicar la lógica de dinero (menos riesgo de descuadre).

import { CUENTAS_PROPIAS } from "./adminId";

export type DailyRow = {
  user_id: string;
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

export type StructRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  referred_by: string | null;
  subaffiliate_percent: number | null;
};

function empty() {
  return { commission: 0, clicks: 0, registrations: 0, ftd: 0 };
}

export function computeAdminStats(
  daily: DailyRow[],
  adminUserId: string,
  adminId: string | undefined,
  adminCpa: number,
  structure: StructRow[]
) {
  const percentById = new Map<string, number>();
  for (const a of structure) {
    percentById.set(a.id, Number(a.subaffiliate_percent ?? 0));
  }

  // ---- 1) Link propio del admin ----
  const own = empty();
  for (const d of daily) {
    if (d.user_id !== adminUserId) continue;
    own.commission += Number(d.commission ?? 0);
    own.clicks += Number(d.clicks ?? 0);
    own.registrations += Number(d.registrations ?? 0);
    own.ftd += Number(d.ftd ?? 0);
  }

  // ---- 2) Estructura (por afiliado) ----
  const byUser = new Map<string, ReturnType<typeof empty>>();
  for (const d of daily) {
    if (d.user_id === adminUserId) continue;
    const acc = byUser.get(d.user_id) ?? empty();
    acc.commission += Number(d.commission ?? 0);
    acc.clicks += Number(d.clicks ?? 0);
    acc.registrations += Number(d.registrations ?? 0);
    acc.ftd += Number(d.ftd ?? 0);
    byUser.set(d.user_id, acc);
  }

  const overrideEarnedById = new Map<string, number>();
  for (const child of structure) {
    if (!child.referred_by || child.referred_by === adminId) continue;
    const parent = structure.find((p) => p.id === child.referred_by);
    if (!parent) continue;
    const parentPct = percentById.get(child.referred_by) ?? 0;
    const childCommission = byUser.get(child.user_id)?.commission ?? 0;
    overrideEarnedById.set(
      parent.user_id,
      (overrideEarnedById.get(parent.user_id) ?? 0) +
        (parentPct / 100) * childCommission
    );
  }

  const stats = structure
    .map((a) => {
      const s = byUser.get(a.user_id) ?? empty();
      const overrideEarned = overrideEarnedById.get(a.user_id) ?? 0;
      // Cuenta propia del admin (p. ej. Mongolitos): NO se le paga (le pago = 0)
      // porque el dinero es del propio admin. Su margen es su DINERO REAL (la
      // comisión guardada en affiliate_daily_stats, que puede ser una tarifa
      // mezclada 75+revshare→85, NO 85×FTD) y suma entero a tu balance.
      if (CUENTAS_PROPIAS.has(a.user_id)) {
        return {
          user_id: a.user_id,
          display_name: a.display_name,
          commission: 0, // no se cuenta como pagado
          overrideEarned: 0,
          owed: 0, // le pago 0
          clicks: s.clicks,
          registrations: s.registrations,
          ftd: s.ftd,
          margin: s.commission, // dinero real (no 85×FTD)
        };
      }
      const owed = s.commission + overrideEarned;
      const margin = adminCpa * s.ftd - s.commission;
      return {
        user_id: a.user_id,
        display_name: a.display_name,
        commission: s.commission,
        overrideEarned,
        owed,
        clicks: s.clicks,
        registrations: s.registrations,
        ftd: s.ftd,
        margin,
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const structure_t = stats.reduce(
    (acc, r) => ({
      commission: acc.commission + r.commission,
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
      margin: acc.margin + r.margin,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0, margin: 0 }
  );

  let overridesPaid = 0;
  for (const a of structure) {
    if (!a.referred_by || a.referred_by === adminId) continue;
    const parentPct = percentById.get(a.referred_by) ?? 0;
    const childCommission = byUser.get(a.user_id)?.commission ?? 0;
    overridesPaid += (parentPct / 100) * childCommission;
  }

  const totals = {
    ownEarnings: own.commission,
    structureMargin: structure_t.margin,
    structureMarginNet: structure_t.margin - overridesPaid,
    structurePaid: structure_t.commission,
    overridesPaid,
    structureOwed: structure_t.commission + overridesPaid,
    totalClean: own.commission + structure_t.margin - overridesPaid,
    clicks: own.clicks + structure_t.clicks,
    registrations: own.registrations + structure_t.registrations,
    ftd: own.ftd + structure_t.ftd,
  };

  // Serie diaria (actividad de la estructura + earnings del admin por día).
  // % de override que se paga al padre POR CADA afiliado hijo (por su comisión).
  // Se usa para restar el override día a día y que la suma de la serie cuadre
  // EXACTA con totalClean (que también resta overridesPaid).
  const overridePctByChild = new Map<string, number>();
  for (const child of structure) {
    if (!child.referred_by || child.referred_by === adminId) continue;
    overridePctByChild.set(
      child.user_id,
      (percentById.get(child.referred_by) ?? 0) / 100
    );
  }

  const byDate = new Map<
    string,
    {
      ownCom: number;
      structCom: number;
      structClicks: number;
      structReg: number;
      structFtd: number;
      propiaCom: number;
      propiaClicks: number;
      propiaReg: number;
      propiaFtd: number;
      overridesDay: number;
    }
  >();
  for (const d of daily) {
    const key = String(d.date).slice(0, 10);
    const acc =
      byDate.get(key) ?? {
        ownCom: 0,
        structCom: 0,
        structClicks: 0,
        structReg: 0,
        structFtd: 0,
        propiaCom: 0,
        propiaClicks: 0,
        propiaReg: 0,
        propiaFtd: 0,
        overridesDay: 0,
      };
    // Override que el admin paga al padre por la comisión de este hijo hoy.
    acc.overridesDay +=
      (overridePctByChild.get(d.user_id) ?? 0) * Number(d.commission ?? 0);
    if (d.user_id === adminUserId) {
      acc.ownCom += Number(d.commission ?? 0);
    } else if (CUENTAS_PROPIAS.has(d.user_id)) {
      // Cuenta propia: su DINERO REAL (comisión guardada) es tu ganancia; su
      // actividad se muestra pero no entra en el término adminCpa × FTD.
      acc.propiaCom += Number(d.commission ?? 0);
      acc.propiaClicks += Number(d.clicks ?? 0);
      acc.propiaReg += Number(d.registrations ?? 0);
      acc.propiaFtd += Number(d.ftd ?? 0);
    } else {
      acc.structCom += Number(d.commission ?? 0);
      acc.structClicks += Number(d.clicks ?? 0);
      acc.structReg += Number(d.registrations ?? 0);
      acc.structFtd += Number(d.ftd ?? 0);
    }
    byDate.set(key, acc);
  }
  const dailySeries = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      commission: v.structCom,
      clicks: v.structClicks + v.propiaClicks,
      registrations: v.structReg + v.propiaReg,
      ftd: v.structFtd + v.propiaFtd,
      earnings:
        v.ownCom +
        (adminCpa * v.structFtd - v.structCom) +
        v.propiaCom -
        v.overridesDay,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { stats, totals, own, daily: dailySeries };
}
