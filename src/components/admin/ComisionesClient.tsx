"use client";

import { useState } from "react";

type Affiliate = {
  id: string;
  display_name: string | null;
  cpa_spain: number | null;
  cpa_other: number | null;
  subaffiliate_percent: number | null;
};

export default function ComisionesClient({
  affiliates,
}: {
  affiliates: Affiliate[];
}) {
  const [rows, setRows] = useState(
    affiliates.map((a) => ({
      id: a.id,
      display_name: a.display_name ?? "Sin nombre",
      cpaSpain: a.cpa_spain ?? 85,cpaOther: a.cpa_other ?? 85,
      subaffiliatePercent: a.subaffiliate_percent ?? 9,
    }))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);

  function updateRow(id: string, field: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveRow(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    setSavingId(id);
    setMessageId(null);

    const res = await fetch("/api/admin/comisiones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliateId: row.id,
        cpaSpain: row.cpaSpain,
        cpaOther: row.cpaOther,
        subaffiliatePercent: row.subaffiliatePercent,
      }),});

    setSavingId(null);
    setMessageId(id);
    if (!res.ok) {
      console.error(await res.json());
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {rows.map((row) => (
        <div
          key={row.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            maxWidth: 600,
          }}
        >
          <h3 style={{ marginBottom: 12 }}>{row.display_name}</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>
              CPA España (€)
              <input
                type="number"
                value={row.cpaSpain}onChange={(e) =>
                  updateRow(row.id, "cpaSpain", Number(e.target.value))
                }
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            </label>

            <label>
              CPA Otros Países (€)
              <input
                type="number"
                value={row.cpaOther}
                onChange={(e) =>
                  updateRow(row.id, "cpaOther", Number(e.target.value))
                }
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            </label>

            <label>
              % Subafiliado
              <input
                type="number"
                value={row.subaffiliatePercent}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    "subaffiliatePercent",
                    Number(e.target.value)
                  )
                }
                style={{ display: "block", width: "100%", padding: 8 }}
              />
            </label>
          </div>

          <button
            onClick={() => saveRow(row.id)}
            disabled={savingId === row.id}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              background: "#2563eb",
              color: "white",
              border: "none",borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {savingId === row.id ? "Guardando..." : "Guardar"}
          </button>

          {messageId === row.id && savingId !== row.id && (
            <p style={{ color: "green", marginTop: 8 }}>Guardado ✓</p>
          )}
        </div>
      ))}
    </div>
  );
}