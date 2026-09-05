import { SIGN_BY_ID, type Sign } from './lexicon'
import { blendFrames, restFrame, sampleTrack, type ResolvedFrame } from './pose'
export const COART_MS = 170

export const HOLD_MIN_MS = 120
export const HOLD_MAX_MS = 250
const LEAD_MS = 400

export function holdMsFor(sign: Sign | undefined): number {
  const d = sign?.durMs ?? 700
  return Math.max(HOLD_MIN_MS, Math.min(HOLD_MAX_MS, Math.round(d * 0.22)))
}

export type Segment = {
  id: string
  index: number

  start: number

  stroke: number

  end: number
}

export type Timeline = { segments: Segment[]; total: number; speed: number }
export function buildTimeline(ids: string[], speed = 1): Timeline {
  const segments: Segment[] = []
  const s = Math.max(0.1, speed)
  let t = LEAD_MS / s
  ids.forEach((id, index) => {
    const sign = SIGN_BY_ID[id]
    const dur = (sign?.durMs ?? 700) / s
    const hold = holdMsFor(sign) / s
    segments.push({ id, index, start: t, stroke: t + dur, end: t + dur + hold })
    t += dur + hold + COART_MS / s
  })

  const total = ids.length ? segments[segments.length - 1].end + LEAD_MS / s : 0
  return { segments, total, speed: s }
}

const headOf = (id: string) => sampleTrack(SIGN_BY_ID[id]?.frames ?? [], 0)
const tailOf = (id: string) => sampleTrack(SIGN_BY_ID[id]?.frames ?? [], 1)
export type PlayHead = {
  frame: ResolvedFrame

  active: number

  local: number

  holding: boolean
}

export function frameAtTime(tl: Timeline, tMs: number): PlayHead {
  const rest = restFrame()
  if (!tl.segments.length) return { frame: rest, active: -1, local: 0, holding: false }

  const t = Math.max(0, tMs)
  const first = tl.segments[0]
  if (t < first.start) {
    const k = t / Math.max(1, first.start)
    return { frame: blendFrames(rest, headOf(first.id), k), active: -1, local: 0, holding: false }
  }

  for (let i = 0; i < tl.segments.length; i++) {
    const s = tl.segments[i]
    if (t <= s.stroke) {
      const local = (t - s.start) / Math.max(1, s.stroke - s.start)
      return {
        frame: sampleTrack(SIGN_BY_ID[s.id]?.frames ?? [], local),
        active: i, local, holding: false,
      }
    }

    if (t <= s.end) {
      return { frame: tailOf(s.id), active: i, local: 1, holding: true }
    }

    const next = tl.segments[i + 1]
    if (next && t < next.start) {
      const k = (t - s.end) / Math.max(1, next.start - s.end)
      return { frame: blendFrames(tailOf(s.id), headOf(next.id), k), active: i, local: 1, holding: false }
    }
  }

  const last = tl.segments[tl.segments.length - 1]
  const k = (t - last.end) / Math.max(1, tl.total - last.end)
  return {
    frame: blendFrames(tailOf(last.id), rest, Math.min(1, k)),
    active: tl.segments.length - 1, local: 1, holding: false,
  }
}

export function idleFrame(tMs: number, amp = 1): ResolvedFrame {
  const f = restFrame()
  const b = Math.sin(tMs / 2100) * 0.012 * amp
  const sway = Math.sin(tMs / 3100 + 1.1) * 0.010 * amp
  f.R.pos = { x: f.R.pos.x + sway + 0.004, y: f.R.pos.y + b }
  f.L.pos = { x: f.L.pos.x + sway * 0.7 - 0.002, y: f.L.pos.y + b * 0.8 - 0.008 }
  f.R.rot += Math.sin(tMs / 2700) * 5 * amp
  f.L.rot += Math.sin(tMs / 2400 + 2) * 4 * amp
  f.head = Math.sin(tMs / 3400) * 0.14 * amp
  f.nod = Math.sin(tMs / 2900 + 0.6) * 0.08 * amp
  f.torso = Math.sin(tMs / 4100) * 0.4 * amp
  const blink = Math.sin(tMs / 1500)
  f.brow = blink > 0.985 ? -0.18 : 0
  f.mouth = Math.sin(tMs / 5200) * 0.05
  return f
}
