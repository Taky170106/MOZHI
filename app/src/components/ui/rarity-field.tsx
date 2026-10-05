import { useEffect, useRef } from 'react'

/* ============================================================
   rarity-field — sixty thousand people, one interpreter.

   "One certified interpreter for every 60,000 deaf people" is a number
   nobody feels. Sixty thousand dots on one screen, with a single lit one
   among them, is the same fact arriving through the eyes first — so the
   picture carries the statistic and the type only has to name it.

   Three things make it a composition rather than a texture:

     · the crowd has no edge. It is drawn to a soft radial falloff, so it
       dissolves into the page's own dot grid instead of ending in a
       rectangle with corners.
     · the one is lit, haloed, and ringed. A single brighter pixel is not a
       focal point; a pulse travelling out through the crowd around it is.
     · the crowd is dimmed where the words sit, so the type reads without a
       panel behind it.

   The section HOLDS while it plays. Sixty thousand things arriving, one of
   them catching light, and the rest of the room going quiet around it is
   five beats of choreography, and five beats do not fit in the second and
   a half a section takes to cross the screen. Held still, the scroll
   becomes the transport for the animation instead of a deadline for it.

   The hold is `position: sticky` on a tall track, NOT a GSAP pin. A pin
   rewrites the layout — it wraps the element in a spacer, freezes its
   width, and parks it at the end of the spacer on release, which put this
   section's type on top of the one after it. Sticky costs the browser
   nothing, changes no boxes, and cannot reorder the page: the track is a
   plain tall div and the stage never leaves it.

   Cost: the sixty thousand are painted once into an offscreen canvas, a
   batch per frame as the scroll reveals them, and blitted with one
   drawImage. Everything that moves — the push in, the dimming, the halo,
   the rings — is that one blit plus a handful of gradients over the top.
   ============================================================ */

const TOTAL = 60_000

/* The lattice has to hold exactly sixty thousand — the number is the point,
   so a ragged last row is not an option — and it has to be SQUARE, or the
   crowd reads as horizontal banding instead of people. These are the factor
   pairs of 60,000 in the plausible range; the one whose cell is closest to
   square at the current aspect wins. */
const COLUMN_CHOICES = [200, 240, 250, 300, 375, 400, 480, 500, 600]

function latticeFor(w: number, h: number) {
  let best = COLUMN_CHOICES[0]
  let bestErr = Infinity
  for (const cols of COLUMN_CHOICES) {
    const rows = TOTAL / cols
    /* How far this grid's cell is from square, measured symmetrically so a
       cell twice as wide is penalised exactly as much as one twice as tall. */
    const ratio = (w / (cols + 1)) / (h / (rows + 1))
    const err = Math.abs(Math.log(ratio))
    if (err < bestErr) {
      bestErr = err
      best = cols
    }
  }
  return { cols: best, rows: TOTAL / best }
}

/* Off-centre and high: a dot in the middle of the frame reads as a target
   rather than as one of a crowd, and this leaves the lower half for type. */
const MARK_X = 0.34
const MARK_Y = 0.33

/* Sanket's cool end, from tokens.css. The crowd is white; the one is not. */
const GLOW = '199, 192, 255'
const CORE = '236, 233, 255'

export function RarityField({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = host.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!el || !canvas || !stage) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    let field: HTMLCanvasElement | null = null
    let paint: CanvasRenderingContext2D | null = null
    let order: Float32Array = new Float32Array(0)
    let drawn = 0
    let dotR = 1
    let ink = 1
    let markX = 0
    let markY = 0
    let w = 0
    let h = 0

    /* The height comes from the width and the viewport, never from the host:
       the host is sized BY this canvas, and measuring it here puts the two in
       a feedback loop that grows the page without bound. */
    const build = () => {
      const dpr = Math.min(2, devicePixelRatio)
      const next = stage.clientWidth
      if (next < 2) return
      w = next
      /* Held still, the field can afford the height — nothing is waiting
         below it for the scroll to arrive. The floor matters: on a narrow
         window the width alone would leave the crowd as a letterbox strip
         in the middle of an empty screen. */
      h = Math.round(
        Math.max(innerHeight * 0.46, Math.min(innerHeight * 0.74, w * 0.54)),
      )

      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const { cols, rows } = latticeFor(w, h)
      const gapX = w / (cols + 1)
      const gapY = h / (rows + 1)
      const cell = Math.min(gapX, gapY)
      dotR = Math.max(0.5, cell * 0.34)

      /* Sixty thousand dots in a phone's width cannot be sixty thousand
         separate marks; at that density a normal alpha fuses them into a grey
         slab. Fading the crowd as the cell tightens keeps it grain — still
         uncountable, no longer a rectangle of paint. */
      ink = Math.min(1, Math.max(0.5, cell / 3))

      field = document.createElement('canvas')
      field.width = canvas.width
      field.height = canvas.height
      paint = field.getContext('2d')!
      paint.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawn = 0

      const markCol = Math.round(cols * MARK_X)
      const markRow = Math.round(rows * MARK_Y)
      markX = gapX * (markCol + 1)
      markY = gapY * (markRow + 1)

      /* Positions, shuffled once. A crowd fills in; it does not sweep. */
      order = new Float32Array(TOTAL * 2)
      let n = 0
      for (let row = 0; row < rows; row++) {
        const y = gapY * (row + 1)
        for (let col = 0; col < cols; col++) {
          if (row === markRow && col === markCol) continue
          order[n++] = gapX * (col + 1)
          order[n++] = y
        }
      }
      for (let i = n / 2 - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0
        const xi = order[i * 2]
        const yi = order[i * 2 + 1]
        order[i * 2] = order[j * 2]
        order[i * 2 + 1] = order[j * 2 + 1]
        order[j * 2] = xi
        order[j * 2 + 1] = yi
      }
    }

    /* Two ranges, one clock, both read straight off the track's own box —
       no scroll library involved, so nothing here can disagree with what
       the browser is actually doing with the sticky stage.

         approach — the track rising into view, before the stage sticks.
         hold     — the stage stuck to the top, the track sliding past it.

       The approach is the smaller share: it exists so the crowd is already
       arriving when the section settles, not so it can carry the piece. */
    const PRE_ROLL = 0.18
    const progress = () => {
      const box = el.getBoundingClientRect()
      const run = el.offsetHeight - stage.offsetHeight
      if (run <= 0) return 1
      if (box.top > 0) {
        /* Approaching: how far the track's top has climbed the viewport. */
        const climbed = (innerHeight - box.top) / innerHeight
        return Math.min(1, Math.max(0, climbed)) * PRE_ROLL
      }
      const held = Math.min(1, Math.max(0, -box.top / run))
      return PRE_ROLL + held * (1 - PRE_ROLL)
    }

    const ease = (x: number) => 1 - Math.pow(1 - x, 3)
    const span = (x: number, a: number, b: number) =>
      Math.min(1, Math.max(0, (x - a) / (b - a)))

    let raf = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (!field || !paint) return

      const p = reduced ? 1 : progress()

      /* The five beats. They overlap on purpose: each one starts while the
         one before it is still finishing, so the section reads as a single
         move rather than a queue of separate tricks. */
      const fill = ease(span(p, 0, 0.34))     // sixty thousand arrive
      const lit = span(p, 0.28, 0.42)         // one of them catches light
      const iso = ease(span(p, 0.38, 0.58))   // the room goes quiet
      const push = ease(span(p, 0.36, 0.80))  // and the frame moves in
      const said = span(p, 0.48, 0.64)        // the words land
      const told = span(p, 0.66, 0.80)        // the last one gets the room

      /* Everything is finished by 0.80. The remaining fifth of the hold is
         the point of holding: the composition stands still and is read,
         instead of being taken away the moment it completes. */

      /* Bring the persistent field up to where the scroll says it is.
         Forwards is append-only; scrolling back is the one case that
         repaints, and it is rare enough to pay for. */
      const want = Math.round((order.length / 2) * fill)
      if (want < drawn) {
        paint.clearRect(0, 0, w, h)
        drawn = 0
      }
      if (want > drawn) {
        const d = dotR * 2
        /* Dots nearer the lit one are brighter — the crowd is not evenly
           interesting, it is a gradient of attention towards the one. */
        for (let i = drawn; i < want; i++) {
          const x = order[i * 2]
          const y = order[i * 2 + 1]
          const near = Math.max(0, 1 - Math.hypot(x - markX, y - markY) / (w * 0.42))
          paint.fillStyle = `rgba(255,255,255,${((0.13 + near * 0.4) * ink).toFixed(3)})`
          paint.fillRect(x - dotR, y - dotR, d, d)
        }
        drawn = want
      }

      ctx.clearRect(0, 0, w, h)

      /* A slow push towards the one, anchored ON it so the lit dot is the
         single fixed point in the frame and the crowd drifts outwards past
         the edges. Eight percent over the whole hold — felt, not watched. */
      const s = 1 + push * 0.08
      if (drawn > 0) {
        ctx.drawImage(field, markX - markX * s, markY - markY * s, w * s, h * s)
      }

      /* A cool wash over the crowd nearest the one, added rather than
         painted, so the dots brighten instead of being covered. */
      if (lit > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const wash = ctx.createRadialGradient(markX, markY, 0, markX, markY, w * 0.3)
        wash.addColorStop(0, `rgba(${GLOW}, ${0.2 * lit})`)
        wash.addColorStop(0.5, `rgba(${GLOW}, ${0.06 * lit})`)
        wash.addColorStop(1, `rgba(${GLOW}, 0)`)
        ctx.fillStyle = wash
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }

      /* Everything far from the one sinks. This is the beat the section is
         built around: the crowd does not leave, it stops competing. */
      if (iso > 0) {
        const quiet = ctx.createRadialGradient(markX, markY, 0, markX, markY, w * 0.34)
        /* Capped well short of black. The crowd has to still BE there at
           the end — a field of sixty thousand that dims to nothing has
           thrown away the only thing it was drawn to say. */
        quiet.addColorStop(0, 'rgba(0,0,0,0)')
        quiet.addColorStop(0.45, `rgba(0,0,0,${0.18 * iso})`)
        quiet.addColorStop(1, `rgba(0,0,0,${0.5 * iso})`)
        ctx.fillStyle = quiet
        ctx.fillRect(0, 0, w, h)
      }

      /* The crowd steps back where the words are. */
      /* Low and tight: it only has to clear the words. Wider than that and
         it takes the crowd out of the middle of the frame with them. */
      const shadeY = h * 0.86
      const shade = ctx.createRadialGradient(w / 2, shadeY, 0, w / 2, shadeY, w * 0.40)
      shade.addColorStop(0, 'rgba(0,0,0,0.92)')
      shade.addColorStop(0.5, 'rgba(0,0,0,0.55)')
      shade.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, w, h)

      if (lit > 0) {
        const beat = reduced ? 0.5 : (t % 2600) / 2600

        /* Three rings leaving the one, staggered — a pulse going out through
           sixty thousand people. */
        if (!reduced) {
          for (let i = 0; i < 3; i++) {
            const k = (beat + i / 3) % 1
            const r = (12 + k * w * 0.2) * s
            ctx.beginPath()
            ctx.arc(markX, markY, r, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${GLOW}, ${(1 - k) * 0.34 * lit})`
            ctx.lineWidth = 1.1
            ctx.stroke()
          }
        }

        const pulse = reduced ? 1 : 0.78 + Math.sin(t / 700) * 0.22
        const halo = (26 + pulse * 16) * s
        const g = ctx.createRadialGradient(markX, markY, 0, markX, markY, halo)
        g.addColorStop(0, `rgba(${CORE}, ${0.95 * lit})`)
        g.addColorStop(0.28, `rgba(${GLOW}, ${0.5 * lit})`)
        g.addColorStop(1, `rgba(${GLOW}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(markX, markY, halo, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(255,255,255,${lit})`
        ctx.beginPath()
        ctx.arc(markX, markY, (2.4 + pulse * 1.1) * s, 0, Math.PI * 2)
        ctx.fill()
      }

      /* The tally counts the crowd in as it arrives, so the number is
         watched rather than read. */
      if (countRef.current) {
        const n = Math.round(fill * TOTAL)
        countRef.current.textContent = n.toLocaleString('en-IN')
      }
      if (copyRef.current) {
        copyRef.current.style.setProperty('--said', String(said))
        copyRef.current.style.setProperty('--told', String(told))
      }
    }

    build()
    raf = requestAnimationFrame(draw)

    /* Width only. Mobile browsers change innerHeight on every toolbar
       slide, and rebuilding sixty thousand positions for that would stutter
       the page for no visible gain. */
    let lastW = stage.clientWidth
    const onResize = () => {
      if (stage.clientWidth === lastW) return
      lastW = stage.clientWidth
      build()
    }
    addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
    }
  }, [])

  return (
    /* .rarity is the track — tall, plain, and the only thing that takes up
       room in the page. .rarity-stage is what the reader sees, stuck to the
       top of the viewport while the track slides past underneath. */
    <div ref={host} className={`rarity ${className}`}>
      <div ref={stageRef} className="rarity-stage">
        <div className="rarity-frame">
          <canvas ref={canvasRef} aria-hidden="true" className="rarity-canvas" />

          <div ref={copyRef} className="rarity-copy">
            <p className="rarity-eyebrow">
              <span ref={countRef}>0</span> deaf people in India
            </p>

            {/* The fact is spread across the three lines rather than repeated
                in each of them: the eyebrow counts the people, the figure is
                the interpreter, and the last line says what that leaves. */}
            <p className="rarity-stat">
              <span className="rarity-one">1</span>
              <span className="rarity-per">certified interpreter</span>
            </p>

            <p className="rarity-line">
              That is the ratio.
              <span>Mozhi is what the other 59,999 conversations get.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RarityField
