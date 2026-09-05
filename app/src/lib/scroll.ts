import { useEffect } from 'react'
import Lenis from 'lenis'

/* ============================================================
   Smooth scroll.

   Produx runs Lenis at lerp 0.05 — a long, gliding settle, and
   most of the perceived quality difference between a normal site
   and an award site. We sit a shade above it at 0.065: nearly
   that weight, without fighting a reader trying to get somewhere.

   It is disabled outright under reduced motion. Hijacking scroll
   from someone who asked for less movement would be indefensible
   in an accessibility product.
   ============================================================ */

export function useSmoothScroll() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      lerp: 0.065,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      // never steal touch scrolling — it feels broken on a phone
      syncTouch: false,
    })

    let raf = 0
    const step = (t: number) => {
      lenis.raf(t)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])
}
