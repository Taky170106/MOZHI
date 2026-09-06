import { useEffect, useRef } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/* ============================================================
   rarity-field — sixty thousand dots, one of them lit.

   The sentence "one certified interpreter for every 60,000 deaf people" is a
   number nobody feels. Sixty thousand dots drawn at once, with a single one
   glowing in the middle of them, is the same fact arriving through the eyes
   before it arrives through the words — so the type can shrink and the
   picture can carry it.

   They arrive in a random order, not as a growing circle: sixty thousand
   people are not a wave rolling out from one of them, they are a crowd
   filling in. The order is shuffled once and the field is painted onto a
   persistent canvas a batch at a time, so an ordinary frame draws only the
   dots that just appeared — the whole field is one drawImage.
   ============================================================ */

const TOTAL = 60_000
const COLS = 300
const ROWS = TOTAL / COLS

/* Roughly a third of the way in, and off-centre: a dot in the exact middle
   reads as a target rather than as one of the crowd. */
const MARK_COL = Math.round(COLS * 0.37)
const MARK_ROW = Math.round(ROWS * 0.44)

export function RarityField({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)
  const noteRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = host.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    let field: HTMLCanvasElement | null = null
    let paint: CanvasRenderingContext2D | null = null
    /* Every dot's position, in the order they will appear. */
    let order: Float32Array = new Float32Array(0)
    let drawn = 0
    let dotR = 1
    let markX = 0
    let markY = 0
    let w = 0
    let h = 0

    /* The whole field, drawn once. Nothing here changes again.

       The height is computed from the width and the viewport, never from the
       host: the host is sized BY this canvas, so measuring it here put the
       two in a feedback loop that grew the page to two million pixels. */
    const build = () => {
      const dpr = Math.min(2, devicePixelRatio)
      const next = el.clientWidth
      if (next < 2) return
      w = next
      h = Math.round(Math.min(innerHeight * 0.58, w * 0.44))

      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const gapX = w / (COLS + 1)
      const gapY = h / (ROWS + 1)
      dotR = Math.max(0.55, Math.min(gapX, gapY) * 0.38)

      field = document.createElement('canvas')
      field.width = canvas.width
      field.height = canvas.height
      paint = field.getContext('2d')!
      paint.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint.fillStyle = 'rgba(255,255,255,0.5)'
      drawn = 0

      markX = gapX * (MARK_COL + 1)
      markY = gapY * (MARK_ROW + 1)

      /* Positions first, then a Fisher–Yates shuffle of the pairs. Shuffling
         the coordinates themselves rather than an index array keeps the hot
         loop to two reads and one fillRect. */
      order = new Float32Array(TOTAL * 2)
      let n = 0
      for (let row = 0; row < ROWS; row++) {
        const y = gapY * (row + 1)
        for (let col = 0; col < COLS; col++) {
          if (row === MARK_ROW && col === MARK_COL) continue
          order[n++] = gapX * (col + 1)
          order[n++] = y
        }
      }
      const pairs = n / 2
      for (let i = pairs - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        const xi = order[i * 2]
        const yi = order[i * 2 + 1]
        order[i * 2] = order[j * 2]
        order[i * 2 + 1] = order[j * 2 + 1]
        order[j * 2] = xi
        order[j * 2 + 1] = yi
      }
    }

    /* How far this section has travelled through the viewport, 0 to 1. */
    const progress = () => {
      const box = el.getBoundingClientRect()
      const span = box.height + innerHeight
      const travelled = innerHeight - box.top
      return Math.min(1, Math.max(0, travelled / span))
    }

    let raf = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (!field) return

      const p = reduced ? 1 : progress()
      /* The field fills through the first half of the pass, the one dot lights
         in the third quarter, and the sentence lands last. */
      const fill = Math.min(1, p / 0.52)
      const lit = Math.min(1, Math.max(0, (p - 0.5) / 0.22))
      const said = Math.min(1, Math.max(0, (p - 0.62) / 0.2))

      /* Bring the persistent field up to where the scroll says it should be.
         Forwards is append-only; scrolling back up is the one case that has
         to repaint, and it is rare enough to pay for. */
      const want = Math.round((order.length / 2) * fill)
      if (paint) {
        if (want < drawn) {
          paint.clearRect(0, 0, w, h)
          drawn = 0
        }
        const d = dotR * 2
        for (let i = drawn; i < want; i++) {
          paint.fillRect(order[i * 2] - dotR, order[i * 2 + 1] - dotR, d, d)
        }
        drawn = want
      }

      ctx.clearRect(0, 0, w, h)
      if (drawn > 0) ctx.drawImage(field!, 0, 0, w, h)

      if (lit > 0) {
        const pulse = reduced ? 1 : 0.72 + Math.sin(t / 620) * 0.28
        const glow = 15 + pulse * 13
        ctx.save()
        ctx.globalAlpha = lit
        const halo = ctx.createRadialGradient(markX, markY, 0, markX, markY, glow)
        halo.addColorStop(0, 'rgba(167,155,255,0.85)')
        halo.addColorStop(0.45, 'rgba(120,105,240,0.28)')
        halo.addColorStop(1, 'rgba(120,105,240,0)')
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(markX, markY, glow, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(markX, markY, 1.9 + pulse * 0.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      if (lineRef.current) lineRef.current.style.opacity = String(said)
      if (noteRef.current) noteRef.current.style.opacity = String(lit * 0.75)
    }

    build()
    /* The canvas has no height until this runs, so everything pinned below it
       has to be told the page grew. */
    ScrollTrigger.refresh()
    raf = requestAnimationFrame(draw)

    /* Width only. Anything that watches the host's height reintroduces the
       loop the height rule above exists to break. */
    let lastW = el.clientWidth
    const onResize = () => {
      if (el.clientWidth === lastW) return
      lastW = el.clientWidth
      build()
    }
    addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div
      ref={host}
      className={`relative flex w-full flex-col items-center justify-center ${className}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="rarity-canvas block w-full" />

      <p
        ref={noteRef}
        className="rarity-note pointer-events-none absolute top-0 right-0 opacity-0"
      >
        60,000 people · 1 interpreter
      </p>

      <p
        ref={lineRef}
        className="rarity-line mt-8 max-w-[36ch] text-center opacity-0"
      >
        One certified interpreter for every <b>60,000</b> deaf people in India.
      </p>
    </div>
  )
}

export default RarityField
