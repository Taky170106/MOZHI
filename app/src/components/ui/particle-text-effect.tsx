import { useEffect, useRef } from 'react'

/* ============================================================
   Particle text — the hero.

   Adapted from the 21st.dev "particle text effect". The physics
   (seek-with-arrival steering, colour blending, fling-out kill) is the
   original. Everything around it was rebuilt for this page:

     · the demo is a fixed 1000x500 bordered box; this fills the hero and
       tracks resize and device pixel ratio
     · the demo draws one short word at a hardcoded `bold 100px Arial`;
       these are sentences, so they wrap and auto-fit
     · the demo picks a random RGB per word. Here colour carries the
       product's own meaning — see the note on Word.color below
     · particles are budgeted, so a 4K display does not quietly allocate
       80,000 of them

   The particle pool is REUSED between words rather than rebuilt: the same
   particles that spelled one line fly into place to spell the next. That is
   the whole point of putting this on this page — the loop never breaks, it
   just changes direction.
   ============================================================ */

interface Vector2D {
  x: number
  y: number
}

interface RGB {
  r: number
  g: number
  b: number
}

export interface Word {
  text: string
  /* A design token name (`--cool-lit`), any literal CSS colour, or a PAIR of
     either, which is mixed down the middle.

     Direction, not decoration. The tokens map COOL/violet to inbound
     (visitor → staff) and WARM/magenta to outbound (staff → visitor), so the
     beat about sign becoming word is violet and the one about word becoming
     sign is magenta. The pair exists for the beat where that distinction is
     the thing being dissolved: mixing the two channels is the barrier going
     away, said in colour instead of in words. */
  color: string | [string, string]
}

/* Roughly the largest pool that still holds 60fps on integrated graphics,
   since every particle is stepped and painted individually each frame. Above
   this the coordinate list is strided rather than the text made coarser, so
   the letterforms stay legible instead of dissolving into gravel. */
const MAX_PARTICLES = 14000

/* Sampling stride through the rasterised text, in CSS pixels, and the size of
   the dot each sample is painted as. The demo's 6px stride with a 2px dot
   covers about a ninth of the glyph, which at its 100px type reads as dense
   and at this page's 200px+ display type reads as a dotted outline. Tightened
   until the words read as type first and grain second. */
const PIXEL_STEP = 4
const DOT_SIZE = 2.4

const MAX_LINES = 3
const LINE_HEIGHT = 1.1

/* Clash Display's space is narrow, and at display sizes that reads as
   "NEEDSTO". Widening it is a canvas-only concern — `wordSpacing` is not in
   every engine, and where it is missing this silently falls back to the
   font's own space, so it degrades to merely tight rather than broken. */
const WORD_SPACING = '0.14em'

function applyTypography(ctx: CanvasRenderingContext2D) {
  ;(ctx as CanvasRenderingContext2D & { wordSpacing?: string }).wordSpacing = WORD_SPACING
}

/* ============================================================
   Flight tuning — how fast the flock crosses the canvas.

   All four are in one place because they trade against each other, and
   because this is the block to reach for when the sequence feels wrong.
   Values are per frame at 60fps; the step scales them by elapsed time, so
   changing a number here changes the speed, never the smoothness.

     SPEED       how fast a particle may travel, once up to speed
     FORCE_RATIO how hard it may accelerate, as a fraction of its own top
                 speed. This is the one that reads as "sluggish" when it is
                 low: at 0.05 a particle spent twenty frames just winding up
     ARRIVAL     distance at which it starts easing in so it settles into the
                 glyph rather than oscillating around it. Too wide and the
                 last stretch crawls
     BLEND       how quickly it takes on the new word's colour
   ============================================================ */
const SPEED_MIN = 9
const SPEED_SPREAD = 10
const FORCE_RATIO = 0.16
const ARRIVAL_RADIUS = 55
const BLEND_MIN = 0.012
const BLEND_SPREAD = 0.05

/* How long a fully formed word rests before the next one pulls it apart. */
const HOLD_MS = 2200

/* Ceiling on waiting for the flock to land, so a few stragglers — or a tab
   that was throttled mid-flight — cannot stall the sequence for good. */
const SETTLE_TIMEOUT_MS = 9000

/* Token names are resolved against the document so the hero follows
   tokens.css rather than carrying its own copy of the palette. Canvas needs a
   concrete colour, so this happens once per word rather than per particle. */
function resolveColor(color: string): string {
  if (!color.startsWith('--')) return color
  const value = getComputedStyle(document.documentElement).getPropertyValue(color).trim()
  return value || '#ffffff'
}

function resolveRgb(color: Word['color']): RGB {
  if (Array.isArray(color)) {
    const [a, b] = [resolveRgb(color[0]), resolveRgb(color[1])]
    return {
      r: Math.round((a.r + b.r) / 2),
      g: Math.round((a.g + b.g) / 2),
      b: Math.round((a.b + b.b) / 2),
    }
  }
  return hexToRgb(resolveColor(color))
}

const cssRgb = ({ r, g, b }: RGB) => `rgb(${r}, ${g}, ${b})`

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

class Particle {
  pos: Vector2D = { x: 0, y: 0 }
  vel: Vector2D = { x: 0, y: 0 }
  target: Vector2D = { x: 0, y: 0 }

  closeEnoughTarget = 100
  maxSpeed = 1.0
  maxForce = 0.1
  particleSize = 10
  isKilled = false

  startColor: RGB = { r: 0, g: 0, b: 0 }
  targetColor: RGB = { r: 0, g: 0, b: 0 }
  colorWeight = 0
  colorBlendRate = 0.01

  /* The colour this particle currently paints, kept as the packed integer it
     was last built from plus the string handed to the context. Rebuilding the
     `rgb(…)` template every frame was the single most expensive thing in the
     loop: fourteen thousand string allocations, each of which the canvas then
     re-parsed. Both only change when the blend actually moves a channel. */
  private packed = -1
  private css = ''

  /**
   * Steps the particle by `dt`, measured in 60ths of a second — 1 is one
   * frame at 60fps, 0.5 on a 120Hz panel, 2 when the browser is only
   * managing 30.
   *
   * Without that factor the flock advances a fixed distance per *frame*
   * instead of per unit of time, so the sequence ran at whatever rate the
   * machine happened to be painting: brisk on a fast display, and visibly
   * slower the moment anything else competed for the frame. The hold
   * between words was already measured in milliseconds; only the physics
   * was still reading the framerate as if it were a clock.
   */
  move(dt: number) {
    /* Ease off near the target, so particles settle into the glyph instead
       of overshooting and jittering around it forever. */
    /* Scalars, not {x, y} literals. This runs fourteen thousand times a
       frame, and the two vectors it used to build were forty-two thousand
       short-lived objects a second for the collector to sweep.
       `Math.hypot` is gone for the same reason it is always gone from a hot
       loop: it rescales its arguments to survive overflow, which costs
       several times a plain square root and buys nothing at screen
       coordinates. The arithmetic below is otherwise unchanged. */
    let proximityMult = 1
    const dx = this.pos.x - this.target.x
    const dy = this.pos.y - this.target.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < this.closeEnoughTarget) {
      proximityMult = distance / this.closeEnoughTarget
    }

    let tx = this.target.x - this.pos.x
    let ty = this.target.y - this.pos.y

    const magnitude = Math.sqrt(tx * tx + ty * ty)
    if (magnitude > 0) {
      const k = (this.maxSpeed * proximityMult) / magnitude
      tx *= k
      ty *= k
    }

    let sx = tx - this.vel.x
    let sy = ty - this.vel.y

    const steerMagnitude = Math.sqrt(sx * sx + sy * sy)
    if (steerMagnitude > 0) {
      const k = this.maxForce / steerMagnitude
      sx *= k
      sy *= k
    }

    this.vel.x += sx * dt
    this.vel.y += sy * dt

    /* The per-frame form was self-limiting: steering is capped at maxForce
       and always points back toward a target capped at maxSpeed. Scaling by
       dt breaks that guarantee on a long frame, so the speed limit is now
       explicit — otherwise one stalled frame launches the flock past the
       glyph and it spends the next second walking back. */
    const speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y)
    if (speed > this.maxSpeed) {
      const k = this.maxSpeed / speed
      this.vel.x *= k
      this.vel.y *= k
    }

    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
  }

  private currentColor(): RGB {
    return {
      r: Math.round(this.startColor.r + (this.targetColor.r - this.startColor.r) * this.colorWeight),
      g: Math.round(this.startColor.g + (this.targetColor.g - this.startColor.g) * this.colorWeight),
      b: Math.round(this.startColor.b + (this.targetColor.b - this.startColor.b) * this.colorWeight),
    }
  }

  /**
   * Paints one dot, and returns the colour string it used so the caller can
   * skip the `fillStyle` setter when the next particle wants the same one.
   *
   * Once a word has formed every particle has reached its target colour, so
   * that is fourteen thousand identical assignments collapsing to one.
   */
  draw(ctx: CanvasRenderingContext2D, dotSize: number, lastCss: string, dt: number): string {
    if (this.colorWeight < 1.0) {
      // Time-scaled for the same reason the movement is.
      this.colorWeight = Math.min(this.colorWeight + this.colorBlendRate * dt, 1.0)
    }

    const w = this.colorWeight
    const r = (this.startColor.r + (this.targetColor.r - this.startColor.r) * w) | 0
    const g = (this.startColor.g + (this.targetColor.g - this.startColor.g) * w) | 0
    const b = (this.startColor.b + (this.targetColor.b - this.startColor.b) * w) | 0

    const packed = (r << 16) | (g << 8) | b
    if (packed !== this.packed) {
      this.packed = packed
      this.css = `rgb(${r}, ${g}, ${b})`
    }

    if (this.css !== lastCss) ctx.fillStyle = this.css
    ctx.fillRect(this.pos.x, this.pos.y, dotSize, dotSize)
    return this.css
  }

  /* Retarget the colour ramp without a jump: freeze the blend at whatever
     it currently reads, then ramp from there. */
  retint(color: RGB) {
    this.startColor = this.currentColor()
    this.targetColor = color
    this.colorWeight = 0
  }

  kill(width: number, height: number) {
    if (this.isKilled) return

    const away = randomEdgePos(width / 2, height / 2, (width + height) / 2)
    this.target.x = away.x
    this.target.y = away.y

    this.retint({ r: 0, g: 0, b: 0 }) // fade to the page ground on the way out
    this.isKilled = true
  }
}

/* A point `mag` away from centre in a random direction — where particles are
   born and where they are flung when a word drops them. */
function randomEdgePos(cx: number, cy: number, mag: number): Vector2D {
  const angle = Math.random() * Math.PI * 2
  return { x: cx + Math.cos(angle) * mag, y: cy + Math.sin(angle) * mag }
}

interface Layout {
  fontSize: number
  lines: string[]
}

/* Split `words` into exactly `k` contiguous lines, minimising the widest one.
   Greedy wrapping gives "SOMEONE / NEEDS TO HEAR / IT." — technically fitting,
   but it strands a two-character line under a full one. Balancing instead
   gives "SOMEONE NEEDS / TO HEAR IT.", which is what a typesetter would do.
   The sentences here are a handful of words, so trying every split point is
   cheaper than being clever about it. */
function balance(words: string[], widths: number[], spaceW: number, k: number) {
  const lineWidth = (a: number, b: number) => {
    let w = 0
    for (let i = a; i < b; i++) w += widths[i] + (i > a ? spaceW : 0)
    return w
  }

  let best: { cuts: number[]; widest: number } | null = null

  const walk = (start: number, remaining: number, cuts: number[]) => {
    if (remaining === 1) {
      const all = [...cuts, words.length]
      let widest = 0
      let from = 0
      for (const to of all) {
        widest = Math.max(widest, lineWidth(from, to))
        from = to
      }
      if (!best || widest < best.widest) best = { cuts: all, widest }
      return
    }
    // leave at least one word for each remaining line
    for (let cut = start + 1; cut <= words.length - (remaining - 1); cut++) {
      walk(cut, remaining - 1, [...cuts, cut])
    }
  }
  walk(0, k, [])

  if (!best) return null
  const { cuts, widest } = best as { cuts: number[]; widest: number }
  const lines: string[] = []
  let from = 0
  for (const to of cuts) {
    lines.push(words.slice(from, to).join(' '))
    from = to
  }
  return { lines, widest }
}

/* Fit a sentence into the frame: pick the line count that lets the type be
   biggest, then set the size from whichever of width or height binds first.
   The demo never needed any of this — it only ever drew one short word at a
   hardcoded 100px. */
function layoutText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontOf: (size: number) => string,
  maxW: number,
  maxH: number,
): Layout {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return { fontSize: 10, lines: [] }

  /* Glyph widths scale linearly with font size, so measure once at a
     reference size and do the rest with arithmetic. */
  const REF = 100
  ctx.font = fontOf(REF)
  applyTypography(ctx)
  const spaceW = ctx.measureText(' ').width
  const widths = words.map((w) => ctx.measureText(w).width)

  let best: Layout = { fontSize: 0, lines: [text] }

  for (let k = 1; k <= Math.min(MAX_LINES, words.length); k++) {
    const packed = balance(words, widths, spaceW, k)
    if (!packed) continue
    const byWidth = (maxW / packed.widest) * REF
    const byHeight = maxH / (k * LINE_HEIGHT)
    const size = Math.min(byWidth, byHeight)
    if (size > best.fontSize) best = { fontSize: size, lines: packed.lines }
  }

  // A short line like "SANKET." would otherwise scale to absurd display sizes.
  return { ...best, fontSize: Math.min(best.fontSize, maxH * 0.42) }
}

export interface ParticleTextEffectProps {
  words: Word[]
  className?: string
}

export function ParticleTextEffect({ words, className }: ParticleTextEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* `words` is read through a ref inside the rAF loop. Closing over the prop
     directly would pin the loop to the first render's array — the classic
     stale-closure bug in the original, which only escapes notice there
     because the demo's word list never changes. */
  const wordsRef = useRef(words)
  wordsRef.current = words

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const particles: Particle[] = []
    let raf = 0
    let wordIndex = 0
    let dpr = 1
    let settledAt = 0
    let wordStartedAt = 0
    let running = true

    /* Clash Display is the display face; without waiting for it the first
       word rasterises in the fallback and every particle target is wrong. */
    const fontOf = (size: number) =>
      `600 ${size}px "Clash Display", "Switzer", system-ui, sans-serif`

    const resize = () => {
      /* Capped at 1.5 rather than 2. The particles are 2.4px squares with a
         translucent wipe over the whole canvas every frame, so on a Retina
         panel the difference between 1.5 and 2 is invisible while the fill
         cost — which scales with the square — is nearly halved. */
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
    }

    /* Rasterise the word offscreen, read back its opaque pixels, and hand
       each one to a particle as a target. */
    const nextWord = (word: Word) => {
      const w = canvas.width
      const h = canvas.height

      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (!octx) return

      const { fontSize, lines } = layoutText(octx, word.text, fontOf, w * 0.86, h * 0.62)

      octx.fillStyle = '#fff'
      octx.font = fontOf(fontSize)
      applyTypography(octx)
      octx.textAlign = 'center'
      octx.textBaseline = 'middle'

      const lineH = fontSize * LINE_HEIGHT
      const top = h / 2 - ((lines.length - 1) * lineH) / 2
      lines.forEach((line, i) => octx.fillText(line, w / 2, top + i * lineH))

      const pixels = octx.getImageData(0, 0, w, h).data
      const color = resolveRgb(word.color)

      const step = Math.max(2, Math.round(PIXEL_STEP * dpr))
      const coords: number[] = []
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (pixels[(y * w + x) * 4 + 3] > 0) coords.push(y * w + x)
        }
      }

      /* Budget by striding the list, not by coarsening the raster — dropping
         every n-th sample thins the fill evenly and keeps the edges intact. */
      const stride = Math.max(1, Math.ceil(coords.length / MAX_PARTICLES))
      const picked = stride === 1 ? coords : coords.filter((_, i) => i % stride === 0)

      /* Shuffle so particles do not sweep in as a readable raster scan. */
      for (let i = picked.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[picked[i], picked[j]] = [picked[j], picked[i]]
      }

      let n = 0
      for (const index of picked) {
        let particle: Particle

        if (n < particles.length) {
          particle = particles[n]
          particle.isKilled = false
        } else {
          particle = new Particle()
          const born = randomEdgePos(w / 2, h / 2, (w + h) / 2)
          particle.pos.x = born.x
          particle.pos.y = born.y
          particle.maxSpeed = (Math.random() * SPEED_SPREAD + SPEED_MIN) * dpr
          particle.maxForce = particle.maxSpeed * FORCE_RATIO
          particle.closeEnoughTarget = ARRIVAL_RADIUS * dpr
          particle.colorBlendRate = Math.random() * BLEND_SPREAD + BLEND_MIN
          particles.push(particle)
        }
        n++

        particle.retint(color)
        particle.target.x = index % w
        particle.target.y = Math.floor(index / w)
      }

      // Whatever the new word does not need is flung offscreen and reclaimed.
      for (let i = n; i < particles.length; i++) particles[i].kill(w, h)
    }

    const advance = (now = performance.now()) => {
      wordIndex = (wordIndex + 1) % wordsRef.current.length
      nextWord(wordsRef.current[wordIndex])
      settledAt = 0
      wordStartedAt = now
    }

    /* Timestamp of the previous painted frame, so the step below is measured
       against the clock rather than against however many frames the browser
       managed to fit into the last second. */
    let lastT = 0

    const frame = (now: number) => {
      if (!running) return

      /* Clamped at both ends. The floor keeps a 240Hz panel from stepping in
         slivers small enough to stall the steering; the ceiling means a
         dropped frame or a tab coming back from the background replays as one
         slow step instead of teleporting the flock across the canvas. */
      const dt = lastT ? Math.min(Math.max((now - lastT) / 16.6667, 0.25), 2.5) : 1
      lastT = now

      /* Translucent wipe rather than a clear — the residue is the motion
         blur, and it is why the particles read as streaks in flight and as
         solid type at rest. */
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const dot = Math.max(1, Math.round(DOT_SIZE * dpr))
      let lastCss = ''
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.move(dt)
        lastCss = p.draw(ctx, dot, lastCss, dt)

        if (
          p.isKilled &&
          (p.pos.x < 0 || p.pos.x > canvas.width || p.pos.y < 0 || p.pos.y > canvas.height)
        ) {
          particles.splice(i, 1)
        }
      }

      /* Hold once the word has actually FORMED, not once it has started
         forming. The original counts 240 frames from the changeover, which is
         both framerate-dependent (2s on a 120Hz panel) and blind to how far
         the particles have to fly — on a wide display they are still crossing
         the screen when it moves on, so no word is ever fully legible.

         Sampling every 11th particle is enough to know when the flock has
         landed, and costs nothing next to the move-and-draw above. */
      if (!settledAt) {
        let near = 0
        let checked = 0
        /* Compared squared, so the sample costs no square roots at all. */
        const tolerance = 26 * dpr
        const tol2 = tolerance * tolerance
        for (let i = 0; i < particles.length; i += 11) {
          const p = particles[i]
          if (p.isKilled) continue
          checked++
          const ddx = p.pos.x - p.target.x
          const ddy = p.pos.y - p.target.y
          if (ddx * ddx + ddy * ddy < tol2) near++
        }
        // …or give up waiting, so a stray particle cannot stall the sequence.
        if ((checked > 0 && near / checked > 0.9) || now - wordStartedAt > SETTLE_TIMEOUT_MS) {
          settledAt = now
        }
      } else if (now - settledAt > HOLD_MS) {
        advance(now)
      }

      raf = requestAnimationFrame(frame)
    }

    /* Reduced motion: the words still cycle, because the sequence is the
       copy and losing it would lose the sentence — but they cross-fade in
       place instead of being thrown across the screen. */
    const staticFrame = () => {
      const w = canvas.width
      const h = canvas.height
      const word = wordsRef.current[wordIndex]
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      const { fontSize, lines } = layoutText(ctx, word.text, fontOf, w * 0.86, h * 0.62)
      ctx.fillStyle = cssRgb(resolveRgb(word.color))
      ctx.font = fontOf(fontSize)
      applyTypography(ctx)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lineH = fontSize * LINE_HEIGHT
      const top = h / 2 - ((lines.length - 1) * lineH) / 2
      lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineH))
    }

    let staticTimer: number | undefined
    let started = false
    let fontsReady = false
    let cancelled = false

    /* Two things must be true before the first word can be rasterised, and
       neither is true when the effect first runs:

         · the font must be loaded, or every particle target is measured
           against the fallback face and the letterforms are wrong
         · the canvas must have a layout size — in dev, Vite injects the
           stylesheet asynchronously, so on the first pass this element is
           genuinely 0x0 and the whole word collapses to a single particle

       So start is gated on both and driven by whichever arrives last. */
    const tryStart = () => {
      if (started || cancelled || !fontsReady) return

      const { width, height } = canvas.getBoundingClientRect()
      if (width < 2 || height < 2) return

      started = true
      resize()

      if (reduced) {
        staticFrame()
        staticTimer = window.setInterval(() => {
          wordIndex = (wordIndex + 1) % wordsRef.current.length
          staticFrame()
        }, HOLD_MS + 1200)
        return
      }

      nextWord(wordsRef.current[0])
      wordStartedAt = performance.now()
      raf = requestAnimationFrame(frame)
    }

    document.fonts.ready.then(() => {
      fontsReady = true
      tryStart()
    })

    const onResize = () => {
      resize()
      if (reduced) {
        staticFrame()
        return
      }
      /* Targets are in canvas pixels, so a resize invalidates every one of
         them; re-rasterise the current word rather than let the flock hold a
         shape that no longer matches the frame. */
      nextWord(wordsRef.current[wordIndex])
      settledAt = 0
      wordStartedAt = performance.now()
    }

    let resizeTimer: number | undefined
    const debouncedResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(onResize, 150)
    }

    /* Observing the element rather than the window catches the late
       stylesheet, and any layout change that is not a window resize. */
    const observer = new ResizeObserver(() => {
      if (!started) tryStart()
      else debouncedResize()
    })
    observer.observe(canvas)

    /* A backgrounded tab throttles rAF to ~1fps; without this the loop
       returns to a wall of stale particles and one enormous timestep. */
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduced && started) {
        running = true
        settledAt = 0
        /* Drop the stale timestamp: the gap across a backgrounded tab is not
           elapsed animation time, and feeding it to the step would spend a
           frame's budget undoing one enormous jump. */
        lastT = 0
        /* Belt and braces — never leave a second loop running on this canvas
           if a visibility event ever arrives without its pair. */
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(frame)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      running = false
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.clearInterval(staticTimer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  )
}
