'use client'

import { useEffect } from 'react'

// Hace que los elementos con la clase "reveal" aparezcan suavemente al asomar en
// pantalla al hacer scroll (estilo web moderna). Re-escanea cuando el dashboard
// carga contenido de forma asíncrona. Respeta "reducir movimiento". No pinta nada.
export default function RevealObserver() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Si no hay soporte o se pide reducir movimiento: mostramos TODO sin animar
    // (nunca dejamos contenido invisible por un fallo del efecto).
    if (reduce || typeof IntersectionObserver === 'undefined') {
      const mostrar = () =>
        document
          .querySelectorAll('.reveal')
          .forEach((el) => el.classList.add('reveal-visible'))
      mostrar()
      const mo0 = new MutationObserver(mostrar)
      mo0.observe(document.body, { childList: true, subtree: true })
      return () => mo0.disconnect()
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('reveal-visible')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }
    )

    const scan = () =>
      document
        .querySelectorAll('.reveal:not(.reveal-visible)')
        .forEach((el) => io.observe(el))

    scan()
    // El dashboard carga datos después: re-escaneamos cuando cambie el DOM,
    // con un pequeño retardo para no sobrecargar en cada mutación.
    let t: ReturnType<typeof setTimeout>
    const mo = new MutationObserver(() => {
      clearTimeout(t)
      t = setTimeout(scan, 120)
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
      clearTimeout(t)
    }
  }, [])

  return null
}
