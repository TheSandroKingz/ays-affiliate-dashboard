'use client'

import { useEffect, useRef } from 'react'

// Fondo animado premium: base oscura + "aurora" de manchas verdes que se mueven
// lento + una red de partículas que flotan y se conectan. Va detrás de todo
// (fixed) y respeta "reducir movimiento". Para que se vea, la página NO debe
// tener un fondo opaco por encima (usa bg transparente en el <main>).
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

    const count = () => (window.innerWidth < 640 ? 34 : 70)

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
      parts = Array.from({ length: count() }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
      }))
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h)
      const DIST = w < 640 ? 120 : 155
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const dx = parts[i].x - parts[j].x
          const dy = parts[i].y - parts[j].y
          const d = Math.hypot(dx, dy)
          if (d < DIST) {
            const a = (1 - d / DIST) * 0.4
            ctx!.strokeStyle = `rgba(52,211,153,${a})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(parts[i].x, parts[i].y)
            ctx!.lineTo(parts[j].x, parts[j].y)
            ctx!.stroke()
          }
        }
      }
      ctx!.fillStyle = 'rgba(52,211,153,0.85)'
      for (const p of parts) {
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, 1.9, 0, Math.PI * 2)
        ctx!.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    seed()
    draw()
    if (reduce) cancelAnimationFrame(raf) // un frame estático, sin bucle

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
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        transform: 'translateZ(0)',
        background:
          'radial-gradient(120% 80% at 50% -10%, #0b1a17 0%, transparent 55%), #05080b',
      }}
    >
      {/* Aurora: manchas verdes grandes que se mueven lento (CSS). */}
      <div className="ab-blob ab-blob-1" />
      <div className="ab-blob ab-blob-2" />
      <div className="ab-blob ab-blob-3" />
      {/* Red de partículas. */}
      <canvas ref={ref} className="absolute inset-0" />
      {/* Viñeta suave para dar profundidad. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 32%, transparent 42%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  )
}
