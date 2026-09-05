import { useEffect, useMemo, useRef, useState } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { SquircleFilter } from '@/components/ui/squircle-filter'
import SigningAvatar from '@/components/SigningAvatar'
import AvatarThumb from '@/components/AvatarThumb'
import { useSignLoop, useSignPlayer } from '@/lib/hooks'
import {
  CLIPS_PER_SIGN, DOMAINS, PLANNED_PACKS, REPS, SIGNERS, SIGNS, TOTAL_CLIPS,
  type Domain, type Sign,
} from '@/lib/lexicon'
import '@/styles/counter.css'
import '@/styles/settings.css'
import '@/styles/console.css'
type Sort = 'az' | 'domain' | 'acc'

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
)
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
)
const IconSlow = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
)

function Card({ sign, onOpen }: { sign: Sign; onOpen: (el: HTMLButtonElement | null) => void }) {
  const [hot, setHot] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const loop = useSignLoop(sign.id, hot, 0.9)
  return (
    <li>
      <button
        ref={btn}
        className="con-card"
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
        onClick={() => onOpen(btn.current)}
        aria-label={`${sign.en} — ${sign.id}. Open sign details.`}
      >
        <div className="set-skin" />
        <span className="con-thumb">
          <AvatarThumb
            frame={hot ? loop.frame : null}
            className="absolute inset-0"
            label={hot ? `${sign.id} signed` : undefined}
          />
        </span>
        {}
        <span className="con-card-word">{sign.en}</span>
        <span className="con-card-hi">{sign.hi}</span>
        <span className="con-card-hands">{sign.hands === 2 ? 'Two-handed' : 'One-handed'}</span>
        <span className="con-acc" title={`${Math.round(sign.acc * 100)}% on held-out signers`}>
          <span className="con-accbar">
            <i style={{ transform: `scaleX(${Math.max(0.06, (sign.acc - 0.86) / 0.14).toFixed(3)})` }} />
          </span>
          <em>{Math.round(sign.acc * 100)}%</em>
        </span>
      </button>
    </li>
  )
}

function Detail({ sign, onClose }: { sign: Sign; onClose: () => void }) {
  const [slow, setSlow] = useState(false)
  const player = useSignPlayer([sign.id], { autoplay: true, loop: true, speed: slow ? 0.5 : 1, idle: true })
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  return (
    <>
      <div className="con-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="con-sheet" role="dialog" aria-modal="true" aria-label={`${sign.id} — ${sign.en}`}>
        <div className="con-sheet-top">
          <div>
            <p className="set-eyebrow">{DOMAINS.find(d => d.id === sign.domain)?.label}</p>
            <p className="mt-1.5 font-mono text-[0.95rem] tracking-[0.12em] text-white">{sign.id}</p>
          </div>
          <button ref={closeRef} className="con-sheet-x" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>

        <div className="con-stage">
          <SigningAvatar frame={player.frame} className="absolute inset-0" label={`${sign.id} signed`} />
          <div className="con-scrub" aria-hidden="true"><i style={{ transform: `scaleX(${player.progress})` }} /></div>
        </div>

        <div className="con-controls">
          <button className={`ctl ${slow ? 'ctl-on' : ''}`} aria-pressed={slow} onClick={() => setSlow(s => !s)} title="Slow"><IconSlow /></button>
          <button className="ctl ctl-primary" onClick={() => player.play()} title="Play"><IconPlay /></button>
        </div>

        <p className="con-sentence">{sign.en} · <span className="deva">{sign.hi}</span></p>

        <dl className="con-params">
          <div><dt>Handshape</dt><dd>{sign.handshape}</dd></div>
          <div><dt>Location</dt><dd>{sign.location}</dd></div>
          <div><dt>Movement</dt><dd>{sign.movement}</dd></div>
          {sign.nmm && <div><dt>Non-manual</dt><dd>{sign.nmm}</dd></div>}
          <div><dt>Hands</dt><dd>{sign.hands === 2 ? 'Two-handed' : 'One-handed'}</dd></div>
          <div><dt>Accuracy</dt><dd>{Math.round(sign.acc * 100)}% on held-out signers</dd></div>
          <div><dt>Corpus</dt><dd>{CLIPS_PER_SIGN} clips · {SIGNERS} signers × {REPS} repetitions</dd></div>
          {sign.near?.length ? (
            <div>
              <dt>Confused with</dt>
              <dd>{sign.near.join(' and ')} — the pair share a handshape, so the classifier separates them on movement.</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 text-[0.74rem] leading-relaxed text-white/35">
          Handshape and movement here describe the corpus this build was trained on. Production
          vocabulary aligns to the ISLRTC Indian Sign Language Dictionary.
        </p>
      </aside>
    </>
  )
}

export default function Vocabulary() {
  const [q, setQ] = useState('')
  const [dom, setDom] = useState<Domain | 'all'>('all')
  const [sort, setSort] = useState<Sort>('az')
  const [open, setOpen] = useState<Sign | null>(null)
  const returnTo = useRef<HTMLButtonElement | null>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (matchMedia('(pointer: coarse)').matches) return
    let raf = 0, x = 0, y = 0
    const write = () => {
      raf = 0
      spotRef.current?.style.setProperty('--mx', `${x}px`)
      spotRef.current?.style.setProperty('--my', `${y}px`)
    }
    const onMove = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(write) }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = SIGNS.filter(s => {
      if (dom !== 'all' && s.domain !== dom) return false
      if (!needle) return true
      return s.id.toLowerCase().includes(needle)
        || s.en.toLowerCase().includes(needle)
        || s.hi.includes(needle)
    })
    return out.sort((a, b) =>
      sort === 'acc' ? b.acc - a.acc
        : sort === 'az' ? a.id.localeCompare(b.id)
        : a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id))
  }, [q, dom, sort])

  const counts = useMemo(() => {
    const m: Partial<Record<Domain, number>> = {}
    for (const s of SIGNS) m[s.domain] = (m[s.domain] ?? 0) + 1
    return m
  }, [])

  return (
    <div className="settings">
      <SquircleFilter />
      <div className="counter-ambient" aria-hidden="true" />
      <div className="counter-grid" aria-hidden="true" />
      <div className="counter-spot" ref={spotRef} aria-hidden="true" />
      <RandomLetterSwapNav />

      <main id="main" className="set-shell">
        <header className="set-head">
          <p className="set-eyebrow">Deployed vocabulary</p>
          <h1 className="set-title">{SIGNS.length} signs this counter knows.</h1>
          <p className="set-sub">
            Recorded, validated and available today — {TOTAL_CLIPS.toLocaleString('en-IN')} clips
            from {SIGNERS} signers. What is not here is listed at the bottom, because the boundary
            of what the machine knows is part of knowing it.
          </p>
        </header>

        <div className="con-bar">
          <div className="con-search">
            <IconSearch />
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search gloss, English or हिन्दी…"
              aria-label="Search the vocabulary"
            />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-white/40 hover:text-white"><IconClose /></button>}
          </div>
          <div className="seg" role="group" aria-label="Sort">
            {(['az', 'domain', 'acc'] as Sort[]).map(v => (
              <button key={v} className={sort === v ? 'is-on' : ''} aria-pressed={sort === v} onClick={() => setSort(v)}>
                {v === 'az' ? 'A–Z' : v === 'domain' ? 'By domain' : 'By accuracy'}
              </button>
            ))}
          </div>
        </div>

        <div className="con-bar">
          <div className="seg" role="group" aria-label="Filter by domain">
            <button className={dom === 'all' ? 'is-on' : ''} aria-pressed={dom === 'all'} onClick={() => setDom('all')}>
              All {SIGNS.length}
            </button>
            {DOMAINS.map(d => (
              <button key={d.id} className={dom === d.id ? 'is-on' : ''} aria-pressed={dom === d.id} onClick={() => setDom(d.id)} title={d.note}>
                {d.label} {counts[d.id]}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="con-empty">
            <div className="set-skin" />
            <h3>Nothing matches “{q}”.</h3>
            <p>
              That word may be outside the deployed {SIGNS.length}. The counter surfaces those
              rather than substituting something that looks close.
            </p>
            <button className="set-btn" onClick={() => { setQ(''); setDom('all') }}>Clear the filters</button>
          </div>
        ) : (
          <ul className="con-grid">
            {list.map(s => (
              <Card key={s.id} sign={s} onOpen={el => { returnTo.current = el; setOpen(s) }} />
            ))}
          </ul>
        )}

        <section className="set-group mt-8">
          <div className="set-skin" />
          <h2 className="set-group-h">Not recorded yet</h2>
          <p className="set-hint mb-5 max-w-[56ch]">
            The vocabulary is a hospital reception domain. These packs are planned, not deployed —
            a word from one of them reaches the counter as text, never as a guess.
          </p>
          <div className="con-packs">
            {PLANNED_PACKS.map(p => (
              <div key={p.id} className="con-pack">
                <b>{p.label}</b>
                <span>{p.note}</span>
                <em>{p.count} signs · planned</em>
              </div>
            ))}
          </div>
        </section>
      </main>

      {open && <Detail sign={open} onClose={() => { setOpen(null); returnTo.current?.focus() }} />}
    </div>
  )
}
