import { useEffect, useRef } from 'react'

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

  color: string | [string, string]
}

const MAX_PARTICLES = 14000
const PIXEL_STEP = 4
const DOT_SIZE = 2.4
const MAX_LINES = 3
const LINE_HEIGHT = 1.1
const WORD_SPACING = '0.14em'

function applyTypography(ctx: CanvasRenderingContext2D) {
  ;(ctx as CanvasRenderingContext2D & { wordSpacing?: string }).wordSpacing = WORD_SPACING
}

const SPEED_MIN = 9
const SPEED_SPREAD = 10
const FORCE_RATIO = 0.16
const ARRIVAL_RADIUS = 55
const BLEND_MIN = 0.012
const BLEND_SPREAD = 0.05
const HOLD_MS = 2200

const SETTLE_TIMEOUT_MS = 9000
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

  private packed = -1
  private css = ''

  move(dt: number) {
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

  draw(ctx: CanvasRenderingContext2D, dotSize: number, lastCss: string, dt: number): string {
    if (this.colorWeight < 1.0) {
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

    this.retint({ r: 0, g: 0, b: 0 })
    this.isKilled = true
  }
}

function randomEdgePos(cx: number, cy: number, mag: number): Vector2D {
  const angle = Math.random() * Math.PI * 2
  return { x: cx + Math.cos(angle) * mag, y: cy + Math.sin(angle) * mag }
}

interface Layout {
  fontSize: number
  lines: string[]
}

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

function layoutText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontOf: (size: number) => string,
  maxW: number,
  maxH: number,
): Layout {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return { fontSize: 10, lines: [] }

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

  return { ...best, fontSize: Math.min(best.fontSize, maxH * 0.42) }
}

export interface ParticleTextEffectProps {
  words: Word[]
  className?: string
}

export function ParticleTextEffect({ words, className }: ParticleTextEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
    const fontOf = (size: number) =>
      `600 ${size}px "Clash Display", "Switzer", system-ui, sans-serif`

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
    }

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

      const stride = Math.max(1, Math.ceil(coords.length / MAX_PARTICLES))
      const picked = stride === 1 ? coords : coords.filter((_, i) => i % stride === 0)
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

      for (let i = n; i < particles.length; i++) particles[i].kill(w, h)
    }

    const advance = (now = performance.now()) => {
      wordIndex = (wordIndex + 1) % wordsRef.current.length
      nextWord(wordsRef.current[wordIndex])
      settledAt = 0
      wordStartedAt = now
    }

    let lastT = 0
    const frame = (now: number) => {
      if (!running) return

      const dt = lastT ? Math.min(Math.max((now - lastT) / 16.6667, 0.25), 2.5) : 1
      lastT = now

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

      if (!settledAt) {
        let near = 0
        let checked = 0
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

        if ((checked > 0 && near / checked > 0.9) || now - wordStartedAt > SETTLE_TIMEOUT_MS) {
          settledAt = now
        }
      } else if (now - settledAt > HOLD_MS) {
        advance(now)
      }

      raf = requestAnimationFrame(frame)
    }

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

      nextWord(wordsRef.current[wordIndex])
      settledAt = 0
      wordStartedAt = performance.now()
    }

    let resizeTimer: number | undefined
    const debouncedResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(onResize, 150)
    }

    const observer = new ResizeObserver(() => {
      if (!started) tryStart()
      else debouncedResize()
    })
    observer.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!reduced && started) {
        running = true
        settledAt = 0

        lastT = 0

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
