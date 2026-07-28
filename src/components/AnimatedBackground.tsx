'use client'

import { useEffect, useRef } from 'react'

// Fondo animado sutil: una red de partículas verdes que flotan y se conectan
// (estilo "flock"). Ligero, optimizado para móvil y respeta "reducir movimiento".
// Va detrás de todo (fixed, -z-10, sin capturar clics). Reutilizable en varias
// páginas (login, registro, etc.).
export default function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let raf = 0

    type P = { x: number; y: number; vx: number; vy: number }
    let parts: P[] = []

    function count() {
      const mobile = window.innerWidth < 640
      return mobile ? 22 : 46
    }

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = w * DPR
      canvas!.height = h * DPR
      canvas!.style.width = w + 'px'
      canvas!.style.height = h + 'px'
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
    }

    function seed() {
      const n = count()
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
      }))
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h)
      const DIST = w < 640 ? 110 : 140
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
      }
      // Líneas entre partículas cercanas.
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const dx = parts[i].x - parts[j].x
          const dy = parts[i].y - parts[j].y
          const d = Math.hypot(dx, dy)
          if (d < DIST) {
            const a = (1 - d / DIST) * 0.22
            ctx!.strokeStyle = `rgba(16,185,129,${a})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(parts[i].x, parts[i].y)
            ctx!.lineTo(parts[j].x, parts[j].y)
            ctx!.stroke()
          }
        }
      }
      // Puntos.
      ctx!.fillStyle = 'rgba(16,185,129,0.55)'
      for (const p of parts) {
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, 1.6, 0, Math.PI * 2)
        ctx!.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    seed()
    if (reduce) {
      draw()
      cancelAnimationFrame(raf) // dibuja un frame estático, sin bucle
    } else {
      draw()
    }

    let t: ReturnType<typeof setTimeout>
    function onResize() {
      clearTimeout(t)
      t = setTimeout(() => {
        resize()
        seed()
      }, 200)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      clearTimeout(t)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Resplandor verde suave detrás de las partículas, da profundidad. */}
      <div
        className="absolute left-1/2 top-1/3 h-[60vmax] w-[60vmax] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.35) 0%, rgba(16,185,129,0) 70%)',
        }}
      />
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  )
}
