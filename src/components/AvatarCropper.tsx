"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

// Recorta la imagen (data URL) al área elegida y devuelve un JPG cuadrado 400x400.
async function recortar(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new window.Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const size = 400;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no ctx");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise((res) =>
    canvas.toBlob((b) => res(b as Blob), "image/jpeg", 0.9)
  );
}

export default function AvatarCropper({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  async function confirmar() {
    if (!area) return;
    setSaving(true);
    try {
      const blob = await recortar(src, area);
      onConfirm(blob);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-black border border-white/15 rounded-2xl p-4 w-full max-w-sm flex flex-col gap-4">
        <p className="text-sm font-medium text-white">
          Ajusta tu foto — arrastra y haz zoom
        </p>
        <div className="relative w-full h-64 bg-black/60 rounded-lg overflow-hidden">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-emerald-500"
          aria-label="Zoom"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-sm font-medium text-slate-300 hover:text-white px-4 py-2 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {saving ? "Guardando..." : "Usar foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
