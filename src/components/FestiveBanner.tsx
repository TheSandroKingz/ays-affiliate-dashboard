"use client";

// Banner festivo sutil en fechas especiales (Navidad, Año Nuevo, Reyes...).
// No molesta: solo aparece esos días. Sin estado, se calcula por la fecha.
const FESTIVOS: Record<string, { emoji: string; texto: string; grad: string }> = {
  "12-24": { emoji: "🎄", texto: "¡Feliz Nochebuena!", grad: "from-red-500/20 to-emerald-500/20" },
  "12-25": { emoji: "🎄", texto: "¡Feliz Navidad!", grad: "from-red-500/20 to-emerald-500/20" },
  "12-31": { emoji: "🎆", texto: "¡Feliz Nochevieja!", grad: "from-amber-500/20 to-purple-500/20" },
  "01-01": { emoji: "🎉", texto: "¡Feliz Año Nuevo!", grad: "from-amber-500/20 to-purple-500/20" },
  "01-06": { emoji: "👑", texto: "¡Feliz día de Reyes!", grad: "from-amber-500/20 to-sky-500/20" },
  "10-31": { emoji: "🎃", texto: "¡Feliz Halloween!", grad: "from-orange-500/20 to-purple-600/20" },
  "02-14": { emoji: "❤️", texto: "¡Feliz San Valentín!", grad: "from-pink-500/20 to-red-500/20" },
};

export default function FestiveBanner() {
  const d = new Date();
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const f = FESTIVOS[md];
  if (!f) return null;
  return (
    <div
      className={`animate-in flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-gradient-to-r ${f.grad} px-4 py-2 text-sm font-medium text-white`}
    >
      <span className="text-lg">{f.emoji}</span> {f.texto}
    </div>
  );
}
