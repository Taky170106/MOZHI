import Lenis from 'lenis'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ============================================================
   Lenis smooth scroll.

   Off entirely under reduced motion, and off on coarse pointers —
   hijacking momentum scroll on a phone makes it worse, not better.
   ============================================================ */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (matchMedia('(pointer: coarse)').matches) return

    const lenis = new Lenis({
      duration: 1.05,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    })
    /* Lenis and ScrollTrigger both want to own the scroll position.
       Drive Lenis from GSAP's ticker and tell ScrollTrigger to
       recompute on every Lenis frame, or pinned sections drift. */
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    // in-page anchors must go through Lenis or they fight it
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!a) return
      const id = a.getAttribute('href')!.slice(1)
      if (!id || id.startsWith('/')) return
      const el = document.getElementById(id)
      if (!el) return
      e.preventDefault()
      lenis.scrollTo(el, { offset: -80 })
    }
    document.addEventListener('click', onClick)

    return () => {
      gsap.ticker.remove(tick)
      lenis.off('scroll', ScrollTrigger.update)
      document.removeEventListener('click', onClick)
      lenis.destroy()
    }
  }, [enabled])
}
