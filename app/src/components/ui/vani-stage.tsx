import { useEffect, useRef, useState } from 'react'
import SigningAvatar from '@/components/SigningAvatar'
import { idleFrame } from '@/lib/player'
import { sampleTrack, type Keyframe, type ResolvedFrame } from '@/lib/pose'
import { AVATAR_ENABLED } from '@/lib/flags'

/* ============================================================
   vani-stage — the avatar, and the six things she does, on one screen.

   The disc belongs to Meenu alone. The six features live in the space around
   her and arrive out of that space as the page scrolls, so the tablet reads
   as one picture: her in the middle, everything she does orbiting her.
   ============================================================ */

/* A wave, authored rather than borrowed.

   The lexicon's HELLO is a salute — flat hand up at the brow and away — which
   is the sign, not a greeting anyone recognises across a room. This is the
   greeting: the open hand comes up beside the head and swings, and the swing
   is carried by moving the hand rather than rolling the wrist, because the
   3D rig deliberately ignores a pose's screen roll. */
const WAVE: Keyframe[] = [
  { t: 0,    R: { loc: 'rest', shape: 'relax', palm: 'in' },                        L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0,    mouth: 0 },
  { t: 0.14, R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.055, dy: -0.02 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.25, mouth: 0.3 },
  { t: 0.32, R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.098, dy: -0.03 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.35, mouth: 0.45 },
  { t: 0.5,  R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.038, dy: -0.05 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.3,  mouth: 0.5, head: 0.12 },
  { t: 0.68, R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.098, dy: -0.03 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.35, mouth: 0.45 },
  { t: 0.86, R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.042, dy: -0.05 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.3,  mouth: 0.5, head: -0.1 },
  { t: 1,    R: { loc: 'cheek', shape: 'five', palm: 'out', dx: 0.07,  dy: -0.03 }, L: { loc: 'rest', shape: 'relax', palm: 'in' }, brow: 0.25, mouth: 0.35 },
]

const WAVE_MS = 1750

type Feature = { src: string; label: string; x: number; y: number }

/* Bubble centres as a percentage of the tablet screen. Three a side, and the
   bottom pair pulled inboard so they clear her name. */
const FEATURES: Feature[] = [
  { src: 'features/both-directions.webp', label: 'Both directions, one desk', x: 23, y: 17 },
  { src: 'features/on-device.webp', label: 'Runs on the counter’s own machine', x: 77, y: 17 },
  { src: 'features/vocabulary.webp', label: '105 signs and full fingerspelling', x: 14, y: 52 },
  { src: 'features/isl-grammar.webp', label: 'ISL grammar, not English order', x: 86, y: 52 },
  { src: 'features/bilingual.webp', label: 'English, Hindi and Tamil, side by side', x: 29, y: 84 },
  { src: 'features/stops-guessing.webp', label: 'Stops instead of guessing', x: 71, y: 84 },
]

export function VaniPanel() {
  const host = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [frame, setFrame] = useState<ResolvedFrame>(() => sampleTrack(WAVE, 0))

  /* Read through a ref so the animation loop is built once and still sees the
     current hover state. */
  const hoverRef = useRef(hover)
  hoverRef.current = hover

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let waveStart = 0
    /* Eases from the wave back to the resting idle so the hand comes down
       instead of snapping to her side. */
    let blend = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)

      if (hoverRef.current) {
        if (!waveStart) waveStart = now
        blend = Math.min(1, blend + 0.06)
      } else {
        waveStart = 0
        blend = Math.max(0, blend - 0.05)
      }

      const idle = idleFrame(now, reduced ? 0 : 1)
      if (blend <= 0) {
        setFrame(idle)
      } else {
        const u = waveStart ? ((now - waveStart) % WAVE_MS) / WAVE_MS : 1
        const wave = sampleTrack(WAVE, u)
        setFrame(blend >= 1 ? wave : mix(idle, wave, blend))
      }

      /* Reveal progress for the six bubbles, measured off the tablet itself. */
      const box = el.getBoundingClientRect()
      const p = reduced
        ? 1
        : Math.min(1, Math.max(0, (innerHeight * 0.82 - box.top) / (innerHeight * 0.62)))
      el.style.setProperty('--p', String(p))
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={host}
      className="vani-panel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg className="vani-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {FEATURES.map((f, i) => (
          <line
            key={f.src}
            x1="50"
            y1="46"
            x2={f.x}
            y2={f.y}
            style={{ ['--i' as string]: i }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className={`vani-disc${hover ? ' is-live' : ''}`}>
        <div className="vani-disc-skin" aria-hidden="true" />
        <div className="vani-rig">
          {AVATAR_ENABLED ? (
            <SigningAvatar
              frame={frame}
              yaw={10}
              className="absolute inset-0"
              label="Meenu, the signing avatar"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <span className="vani-off">Avatar offline</span>
            </div>
          )}
        </div>
      </div>

      <div className="vani-caption">
        <h3>meet Meenu</h3>
        <p>avatar built by us</p>
      </div>

      {FEATURES.map((f, i) => (
        <figure
          key={f.src}
          className="vani-node"
          style={{
            ['--x' as string]: f.x,
            ['--y' as string]: f.y,
            ['--i' as string]: i,
          }}
        >
          <img src={f.src} alt="" loading="lazy" decoding="async" />
          <figcaption>{f.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}

/* A straight blend of two resolved frames — enough to hand the wave over to
   the idle without a jump, and nothing more. */
function mix(a: ResolvedFrame, b: ResolvedFrame, k: number): ResolvedFrame {
  const lerp = (x: number, y: number) => x + (y - x) * k
  return {
    R: {
      ...b.R,
      pos: { x: lerp(a.R.pos.x, b.R.pos.x), y: lerp(a.R.pos.y, b.R.pos.y) },
      blend: k < 0.5 ? a.R.blend : b.R.blend,
    },
    L: {
      ...b.L,
      pos: { x: lerp(a.L.pos.x, b.L.pos.x), y: lerp(a.L.pos.y, b.L.pos.y) },
    },
    brow: lerp(a.brow, b.brow),
    mouth: lerp(a.mouth, b.mouth),
    head: lerp(a.head, b.head),
    nod: lerp(a.nod, b.nod),
    torso: lerp(a.torso, b.torso),
  }
}

export default VaniPanel
