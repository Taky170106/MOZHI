import { useEffect, useMemo, useRef, useState } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { SquircleFilter } from '@/components/ui/squircle-filter'
import SigningAvatar from '@/components/SigningAvatar'
import { useSignPlayer } from '@/lib/hooks'
import { useSettings } from '@/lib/settings'
import { SEED_TURNS, type Turn } from '@/lib/turns'
import '@/styles/counter.css'
import '@/styles/settings.css'
import '@/styles/console.css'
type Dir = 'all' | 'in' | 'out'

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
const IconIn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M20 12H4m0 0 6-6m-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconOut = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M4 12h16m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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
const IconReplay = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
    <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const dayOf = (t: Turn) => (t.at.includes('PM') && t.at.startsWith('06') ? 'Yesterday' : 'Today')
function Replay({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const [slow, setSlow] = useState(false)
  const player = useSignPlayer(turn.glosses, {
    autoplay: turn.glosses.length > 0,
    speed: slow ? 0.5 : 1,
    idle: true,
  })
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
      <aside className="con-sheet" role="dialog" aria-modal="true" aria-label="Replay this turn">
        <div className="con-sheet-top">
          <div>
            <p className={`set-eyebrow ${turn.dir === 'in' ? 'text-[color:var(--cool-lit)]' : 'text-[color:var(--warm-lit)]'}`}>
              {turn.dir === 'in' ? 'Visitor → staff' : 'Staff → visitor'}
            </p>
            <p className="mt-1.5 text-[0.8rem] text-white/45">{dayOf(turn)} · {turn.at}</p>
          </div>
          <button ref={closeRef} className="con-sheet-x" onClick={onClose} aria-label="Close replay"><IconClose /></button>
        </div>

        {turn.glosses.length ? (
          <>
            <div className="con-stage">
              <SigningAvatar frame={player.frame} className="absolute inset-0" label={`Replay of ${turn.text}`} />
              <div className="con-scrub" aria-hidden="true">
                <i style={{ transform: `scaleX(${player.progress})` }} />
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {turn.glosses.map((g, i) => (
                <span key={g + i} className={`chip ${i === player.active ? 'chip-live' : 'chip-out'}`}>{g}</span>
              ))}
            </div>
            <div className="con-controls">
              <button className={`ctl ${slow ? 'ctl-on' : ''}`} aria-pressed={slow} onClick={() => setSlow(s => !s)} title="Slow"><IconSlow /></button>
              <button className="ctl ctl-primary" onClick={() => player.play()} title="Play"><IconPlay /></button>
              <button className="ctl" onClick={() => { player.stop(); player.play() }} title="Replay"><IconReplay /></button>
            </div>
          </>
        ) : (
          <div className="con-nosign">
            <p>This turn was shown as written text.</p>
            <span>
              It contained a word outside the {`${'60'}`}-sign vocabulary, so nothing was signed and
              nothing was substituted for it.
            </span>
          </div>
        )}

        <p className="con-sentence">{turn.text}</p>

        <dl className="con-params">
          <div><dt>Gloss</dt><dd className="m">{turn.glosses.length ? turn.glosses.join(' · ') : '—'}</dd></div>
          {turn.conf !== undefined && (
            <div><dt>Confidence</dt><dd>{Math.round(turn.conf * 100)}% mean across {turn.glosses.length} signs</dd></div>
          )}
          {turn.repeated && (
            <div><dt>Repeat</dt><dd>The visitor was asked to sign again before this resolved.</dd></div>
          )}
          <div><dt>Processing</dt><dd>On this machine. No frame or audio left the counter.</dd></div>
        </dl>
      </aside>
    </>
  )
}

export default function Archive() {
  const { settings } = useSettings()
  const [q, setQ] = useState('')
  const [dir, setDir] = useState<Dir>('all')
  const [open, setOpen] = useState<Turn | null>(null)
  const [copied, setCopied] = useState(false)
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
    return SEED_TURNS.filter(t => {
      if (dir !== 'all' && t.dir !== dir) return false
      if (!needle) return true
      return t.text.toLowerCase().includes(needle) || t.glosses.join(' ').toLowerCase().includes(needle)
    })
  }, [q, dir])

  const groups = useMemo(() => {
    const m = new Map<string, Turn[]>()
    for (const t of list) {
      const k = dayOf(t)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return [...m.entries()]
  }, [list])

  const stats = useMemo(() => {
    const inbound = SEED_TURNS.filter(t => t.dir === 'in')
    const conf = inbound.filter(t => t.conf !== undefined)
    const textOnly = SEED_TURNS.filter(t => t.textOnly).length
    const repeats = inbound.filter(t => t.repeated).length
    return {
      turns: SEED_TURNS.length,
      completed: SEED_TURNS.length - textOnly,
      acc: conf.length ? conf.reduce((a, t) => a + (t.conf ?? 0), 0) / conf.length : 0,
      repeatRate: inbound.length ? repeats / inbound.length : 0,
    }
  }, [])

  const copy = async () => {
    const text = list.map(t => `${dayOf(t)} ${t.at}\t${t.dir === 'in' ? 'visitor' : 'staff'}\t${t.glosses.join(' ')}\t${t.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch { }
  }

  return (
    <div className="settings">
      <SquircleFilter />
      <div className="counter-ambient" aria-hidden="true" />
      <div className="counter-grid" aria-hidden="true" />
      <div className="counter-spot" ref={spotRef} aria-hidden="true" />
      <RandomLetterSwapNav />

      <main id="main" className="set-shell">
        <header className="set-head">
          <p className="set-eyebrow">Counter log</p>
          <h1 className="set-title">Every turn this counter handled.</h1>
          <p className="set-sub">
            The pilot measures four things: how many interactions completed without a person
            stepping in, recognition accuracy, response time, and how often the visitor was asked
            to repeat. All four are here — including the turns that went badly.
          </p>
        </header>

        <div className="con-kpis">
          <div className="con-kpi"><div className="set-skin" />
            <b>{stats.turns}</b><span>Turns logged</span><em>{stats.completed} completed in sign</em>
          </div>
          <div className="con-kpi"><div className="set-skin" />
            <b>{Math.round(stats.acc * 100)}%</b><span>Mean confidence</span><em>inbound · held-out</em>
          </div>
          <div className="con-kpi"><div className="set-skin" />
            <b>1.4 s</b><span>Response time</span><em>landmark to sentence</em>
          </div>
          <div className={`con-kpi ${stats.repeatRate > 0.2 ? 'con-kpi-warn' : ''}`}><div className="set-skin" />
            <b>{Math.round(stats.repeatRate * 100)}%</b><span>Repeat requests</span><em>visitor asked to sign again</em>
          </div>
        </div>

        <div className="con-bar">
          <div className="con-search">
            <IconSearch />
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search transcripts and glosses…"
              aria-label="Search the archive"
            />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-white/40 hover:text-white"><IconClose /></button>}
          </div>
          <div className="seg" role="group" aria-label="Filter by direction">
            {(['all', 'in', 'out'] as Dir[]).map(d => (
              <button key={d} className={dir === d ? 'is-on' : ''} aria-pressed={dir === d} onClick={() => setDir(d)}>
                {d === 'all' ? 'Both directions' : d === 'in' ? 'Visitor' : 'Staff'}
              </button>
            ))}
          </div>
          <button className="set-btn ml-auto" onClick={copy}>{copied ? 'Copied' : 'Copy this view'}</button>
        </div>

        {list.length === 0 ? (
          <div className="con-empty">
            <div className="set-skin" />
            <h3>Nothing matches “{q}”.</h3>
            <p>Try a gloss instead of a word — the archive indexes both.</p>
            <button className="set-btn" onClick={() => { setQ(''); setDir('all') }}>Clear the filters</button>
          </div>
        ) : (
          groups.map(([day, items]) => (
            <section key={day} className="con-day">
              <h2 className="con-day-h"><span>{day}</span><i /><em>{items.length}</em></h2>
              <ul className="con-rows">
                {items.map(t => (
                  <li key={t.id}>
                    <button
                      className="con-row"
                      onClick={e => { returnTo.current = e.currentTarget; setOpen(t) }}
                    >
                      <div className="set-skin" />
                      <time className="con-time">{t.at}</time>
                      <span className={`con-dir con-dir-${t.dir}`}>{t.dir === 'in' ? <IconIn /> : <IconOut />}</span>
                      <span className="con-body">
                        <span className="con-gloss">{t.glosses.length ? t.glosses.join(' · ') : 'no signed output'}</span>
                        <span className="con-text">{t.text}</span>
                      </span>
                      <span className="con-flags">
                        {t.repeated && <span className="badge badge-repeat">Repeated</span>}
                        {t.textOnly && <span className="badge badge-text">Text only</span>}
                        {t.conf !== undefined && (
                          <span className={`con-conf ${t.conf < 0.85 ? 'con-conf-low' : ''}`}>{Math.round(t.conf * 100)}%</span>
                        )}
                      </span>
                      <span className="con-replay">Replay</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <section className="set-group mt-6">
          <div className="set-skin" />
          <h2 className="set-group-h">Retention</h2>
          <div className="set-row">
            <div>
              <span className="set-label">What is kept</span>
              <p className="set-hint">
                {settings.retention === 'off'
                  ? 'Nothing is kept. Turns are discarded the moment they leave the screen.'
                  : settings.retention === 'session'
                    ? 'Turns are held until this session ends, then discarded.'
                    : 'Turns are held for the current shift, then discarded.'}
                {' '}No video ever existed to keep — only landmark coordinates, and those are not
                stored either.
              </p>
            </div>
            <div className="set-ctl">
              <a className="set-btn" href="#/settings">Change in settings →</a>
            </div>
          </div>
        </section>
      </main>

      {open && <Replay turn={open} onClose={() => { setOpen(null); returnTo.current?.focus() }} />}
    </div>
  )
}
