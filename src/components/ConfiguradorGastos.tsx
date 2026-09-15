"use client";

import { useState } from "react";
import { validarConfig, repartoIgual, colorDe, MAX_CONCEPTOS, MAX_SOCIOS, type ConfigGastos } from "@/lib/repartoGastos";

// Configuración de Gastos de un afiliado: cuántos socios son (se pueden añadir o
// quitar después), sus nombres y sus conceptos con el % que pone cada uno por
// defecto. La usan la página de Gastos del afiliado (la primera vez sale sola) y
// su ficha en el panel del admin.

type ConceptoEd = { nombre: string; pct: string[] };

const campo =
  "rounded-md bg-white/10 border border-white/15 text-white text-base sm:text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const aTexto = (n: number) => String(n).replace(".", ",");
const sumar = (xs: string[]) => xs.reduce((s, x) => s + (Number(x.replace(",", ".")) || 0), 0);
const OPCIONES = [1, 2, 3, 4, 5, 6];

export default function ConfiguradorGastos({
  inicial,
  titulo,
  onGuardar,
  onCancelar,
}: {
  inicial: ConfigGastos | null;
  titulo?: string;
  onGuardar: (config: ConfigGastos) => Promise<string | null>;
  onCancelar?: () => void;
}) {
  const [elegido, setElegido] = useState(!!inicial);
  const [socios, setSocios] = useState<string[]>(inicial?.socios ?? []);
  const [conceptos, setConceptos] = useState<ConceptoEd[]>(
    inicial?.conceptos.length ? inicial.conceptos.map((c) => ({ nombre: c.nombre, pct: c.pct.map(aTexto) })) : [{ nombre: "", pct: [] }]
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const n = elegido ? socios.length || 1 : 0; // 1 = solo; 0 = aún sin elegir

  // Elegir el número de golpe: los % de cada concepto vuelven a partes iguales.
  function elegir(k: number) {
    const ahora = k <= 1 ? 0 : k;
    setElegido(true);
    setError(null);
    if (ahora === socios.length) return;
    setSocios((s) => Array.from({ length: ahora }, (_, i) => s[i] ?? ""));
    setConceptos((cs) => cs.map((c) => ({ ...c, pct: repartoIgual(ahora).map(aTexto) })));
  }

  // Añadir un socio a los que ya hay: los % de antes se quedan y el nuevo sale
  // vacío en cada concepto, para que le pongan lo que le toca.
  function añadirSocio() {
    if (socios.length === 0) return elegir(2);
    if (socios.length >= MAX_SOCIOS) return;
    setSocios((s) => [...s, ""]);
    setConceptos((cs) => cs.map((c) => ({ ...c, pct: [...c.pct, ""] })));
  }

  function quitarSocio(i: number) {
    if (socios.length <= 2) return elegir(1);
    setSocios((s) => s.filter((_, j) => j !== i));
    setConceptos((cs) => cs.map((c) => ({ ...c, pct: c.pct.filter((_, j) => j !== i) })));
  }

  const cambiarConcepto = (i: number, cambio: Partial<ConceptoEd>) =>
    setConceptos((cs) => cs.map((c, j) => (j === i ? { ...c, ...cambio } : c)));

  async function guardar() {
    setError(null);
    const v = validarConfig({
      socios,
      conceptos: conceptos.filter((c) => c.nombre.trim()).map((c) => ({ nombre: c.nombre, pct: c.pct })),
    });
    if ("error" in v) { setError(v.error); return; }
    setGuardando(true);
    try {
      const e = await onGuardar(v.config);
      if (e) setError(e);
    } catch {
      setError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-5">
      {titulo && (
        <div>
          <h2 className="text-lg font-semibold text-white">{titulo}</h2>
          <p className="text-sm text-slate-400 mt-1">Solo hay que hacerlo una vez. Luego, al apuntar un gasto, solo eliges el concepto.</p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-200">¿Cuántos sois?</p>
        <div className="flex flex-wrap gap-2">
          {OPCIONES.map((k) => (
            <button
              key={k}
              onClick={() => elegir(k)}
              className={`rounded-lg border px-4 min-h-[44px] text-sm font-medium transition ${
                k === n ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white/10 border-white/15 text-slate-200 hover:bg-white/15"
              }`}
            >
              {k === 1 ? "Solo yo" : k}
            </button>
          ))}
        </div>
      </section>

      {n >= 2 && (
        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-200">Socios</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {socios.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.trim() ? colorDe(s) : "#475569" }} />
                <input
                  value={s}
                  maxLength={30}
                  placeholder={`Socio ${i + 1}`}
                  onChange={(e) => setSocios((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                  className={`${campo} w-full`}
                />
                <button onClick={() => quitarSocio(i)} className="text-slate-500 hover:text-red-400 text-lg px-3 min-h-[44px]" title="Quitar socio">
                  ×
                </button>
              </div>
            ))}
          </div>
          {socios.length < MAX_SOCIOS && (
            <button onClick={añadirSocio} className="self-start text-sm text-emerald-400 hover:text-emerald-300 min-h-[44px]">
              + Añadir socio
            </button>
          )}
        </section>
      )}

      {n >= 1 && (
        <section className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium text-slate-200">
              {socios.length ? "Conceptos y qué % pone cada uno" : "Conceptos"}
            </p>
            {socios.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">Estos % salen por defecto; en cada gasto se pueden cambiar.</p>
            )}
          </div>
          {conceptos.map((c, i) => {
            const suma = sumar(c.pct);
            const cuadra = !socios.length || (Math.abs(suma - 100) <= 0.05 && c.pct.every((p) => p.trim()));
            return (
              <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    value={c.nombre}
                    maxLength={40}
                    placeholder={`Concepto ${i + 1}`}
                    onChange={(e) => cambiarConcepto(i, { nombre: e.target.value })}
                    className={`${campo} flex-1 min-w-0`}
                  />
                  {conceptos.length > 1 && (
                    <button
                      onClick={() => setConceptos((cs) => cs.filter((_, j) => j !== i))}
                      className="text-slate-500 hover:text-red-400 text-lg px-3 min-h-[44px]"
                      title="Quitar concepto"
                    >
                      ×
                    </button>
                  )}
                </div>
                {socios.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {socios.map((nombre, j) => (
                      <label key={j} className="flex items-center gap-1.5 text-sm">
                        <span className="truncate max-w-[7rem]" style={{ color: nombre.trim() ? colorDe(nombre) : "#94a3b8" }}>
                          {nombre.trim() || `Socio ${j + 1}`}
                        </span>
                        <input
                          value={c.pct[j] ?? ""}
                          inputMode="decimal"
                          onChange={(e) => cambiarConcepto(i, { pct: socios.map((_, k) => (k === j ? e.target.value : c.pct[k] ?? "")) })}
                          className={`${campo} w-16 text-right ${!(c.pct[j] ?? "").trim() ? "border-amber-400/60" : ""}`}
                        />
                        <span className="text-slate-500">%</span>
                      </label>
                    ))}
                    <span className="ml-auto flex items-center gap-3 text-xs">
                      <button onClick={() => cambiarConcepto(i, { pct: repartoIgual(socios.length).map(aTexto) })} className="text-emerald-400 hover:text-emerald-300">
                        A partes iguales
                      </button>
                      <span className={`tabular-nums ${cuadra ? "text-slate-500" : "text-amber-300"}`}>Suma {aTexto(Math.round(suma * 100) / 100)} %</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {conceptos.length < MAX_CONCEPTOS && (
            <button
              onClick={() => setConceptos((cs) => [...cs, { nombre: "", pct: repartoIgual(socios.length).map(aTexto) }])}
              className="self-start text-sm text-emerald-400 hover:text-emerald-300 min-h-[44px]"
            >
              + Añadir concepto
            </button>
          )}
        </section>
      )}

      {error && <p className="text-sm text-amber-300">{error}</p>}

      {(n >= 1 || onCancelar) && (
        <div className="flex flex-wrap items-center gap-2">
          {n >= 1 && (
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 min-h-[44px]"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
          {onCancelar && (
            <button onClick={onCancelar} className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm px-4 py-2 min-h-[44px]">
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
