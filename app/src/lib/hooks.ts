import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildTimeline, frameAtTime, idleFrame } from './player'
import { posterT, sampleTrack, type ResolvedFrame } from './pose'
import { SIGN_BY_ID } from './lexicon'
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export function useReveal<T extends HTMLElement = HTMLElement>(threshold = 0.16) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-in'); return }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect() } },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return ref
}

export function useScrollProgress<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  const [p, setP] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const on = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const total = r.height + vh
      const seen = vh - r.top
      setP(Math.max(0, Math.min(1, seen / total)))
    }
    const sched = () => { if (!raf) raf = requestAnimationFrame(on) }
    on()
    window.addEventListener('scroll', sched, { passive: true })
    window.addEventListener('resize', sched)
    return () => {
      window.removeEventListener('scroll', sched)
      window.removeEventListener('resize', sched)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return [ref, p] as const
}

export type PlayerState = {
  frame: ResolvedFrame
  active: number
  local: number

  holding: boolean
  playing: boolean
  progress: number
  elapsed: number
  total: number
}

export function useSignPlayer(
  ids: string[],
  opts: { speed?: number; loop?: boolean; autoplay?: boolean; idle?: boolean; onEnd?: () => void } = {},
) {
  const { speed = 1, idle = true } = opts
  const reduced = useReducedMotion()
  const loop = opts.loop === true && !reduced
  const autoplay = opts.autoplay === true && !reduced
  const timeline = useMemo(() => buildTimeline(ids, speed), [ids.join('|'), speed])
  const [playing, setPlaying] = useState(autoplay)
  const [state, setState] = useState<PlayerState>(() => ({
    frame: idleFrame(0, 0), active: -1, local: 0, holding: false, playing: autoplay, progress: 0, elapsed: 0, total: timeline.total,
  }))
  const t0 = useRef(0)
  const onEnd = useRef(opts.onEnd)
  onEnd.current = opts.onEnd
  const idsKey = ids.join('|')
  useEffect(() => { setPlaying(autoplay); t0.current = 0 }, [idsKey, autoplay])

  useEffect(() => {
    if (!playing && !idle) return
    let raf = 0
    let start = 0
    const step = (now: number) => {
      if (!start) start = now - t0.current
      const e = now - start
      if (playing && timeline.total > 0) {
        if (e >= timeline.total) {
          if (loop) { start = now; t0.current = 0 }
          else {
            setPlaying(false)
            t0.current = timeline.total
            setState(s => ({ ...s, ...frameAtTime(timeline, timeline.total), playing: false, progress: 1, elapsed: timeline.total, total: timeline.total }))
            onEnd.current?.()
            return
          }
        }
        t0.current = e
        const r = frameAtTime(timeline, e)
        setState({ ...r, playing: true, progress: timeline.total ? e / timeline.total : 0, elapsed: e, total: timeline.total })
      } else if (idle && !playing && t0.current === 0) {
        const held = reduced && ids.length ? SIGN_BY_ID[ids[0]]?.frames : null
        setState(s => ({
          ...s,
          frame: held ? sampleTrack(held, posterT(held)) : idleFrame(now, reduced ? 0 : 1),
          active: held ? 0 : -1,
          playing: false,
        }))
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, timeline, loop, idle, reduced, idsKey])

  const play = useCallback(() => { t0.current = 0; setPlaying(true) }, [])
  const toggle = useCallback(() => setPlaying(p => !p), [])
  const stop = useCallback(() => { setPlaying(false); t0.current = 0 }, [])
  return { ...state, playing, play, toggle, stop, timeline }
}

export function useSignLoop(id: string | null, active: boolean, speed = 1) {
  return useSignPlayer(id && active ? [id] : [], { speed, loop: true, autoplay: active, idle: true })
}

export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { }
  }, [key, v])
  return [v, setV] as const
}
