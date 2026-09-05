import { useMemo, useRef, useEffect } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { SquircleFilter } from '@/components/ui/squircle-filter'
import SigningAvatar from '@/components/SigningAvatar'
import { useSignPlayer } from '@/lib/hooks'
import { useSettings, type CaptionLang, type Retention } from '@/lib/settings'
import { SEED_TURNS } from '@/lib/turns'
import { SIGNS, TOTAL_CLIPS } from '@/lib/lexicon'
import { FIELD_CENSUS } from '@/components/LandmarkField'
import '@/styles/counter.css'
import '@/styles/settings.css'
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconAlert = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" strokeLinecap="round" /><circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)

function Row({
  label, hint, htmlFor, children,
}: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="set-label">{label}</span>}
        {hint && <p className="set-hint">{hint}</p>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  )
}

function Seg<T extends string | number | boolean>({
  value, options, onChange, id,
}: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; id?: string }) {
  return (
    <div className="seg" role="group" id={id}>
      {options.map(o => (
        <button
          key={String(o.v)}
          className={o.v === value ? 'is-on' : ''}
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-group">
      <div className="set-skin" />
      <h2 className="set-group-h">{title}</h2>
      {children}
    </section>
  )
}

export default function Settings() {
  const { settings, set, reset } = useSettings()
  const player = useSignPlayer(['HELLO'], { speed: settings.speed, loop: true, autoplay: true, idle: true })

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

  const impact = useMemo(() => {
    const inbound = SEED_TURNS.filter(t => t.dir === 'in' && t.conf !== undefined)
    const wouldRepeat = inbound.filter(t => (t.conf ?? 1) < settings.threshold).length
    return { total: inbound.length, wouldRepeat, heavy: wouldRepeat > inbound.length * 0.34 }
  }, [settings.threshold])

  const requested = useMemo(
    () => [...new Set(SEED_TURNS.filter(t => t.textOnly).map(t => t.text))].slice(0, 6),
    [],
  )

  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    <div className="settings">
      <SquircleFilter />
      <div className="counter-ambient" aria-hidden="true" />
      <div className="counter-grid" aria-hidden="true" />
      <div className="counter-spot" ref={spotRef} aria-hidden="true" />
      <RandomLetterSwapNav />

      <main id="main" className="set-shell">
        <header className="set-head">
          <p className="set-eyebrow">Counter configuration</p>
          <h1 className="set-title">Settings</h1>
          <p className="set-sub">
            Held on this machine only. Nothing here is synchronised anywhere, because there is
            nowhere for it to go.
          </p>
        </header>

        {}
        <Group title="This counter">
          <Row label="Site" htmlFor="site" hint="Shown on the visitor display and on every archived turn.">
            <input id="site" className="set-input" value={settings.site} onChange={e => set('site', e.target.value)} />
          </Row>
          <Row label="Counter" htmlFor="counter">
            <input id="counter" className="set-input" value={settings.counter} onChange={e => set('counter', e.target.value)} />
          </Row>
          <Row label="Staff on duty" htmlFor="staff">
            <input id="staff" className="set-input" value={settings.staff} onChange={e => set('staff', e.target.value)} />
          </Row>
        </Group>

        {}
        <Group title="Display">
          <Row label="Brightness" htmlFor="theme" hint="A counter runs from before dawn to after dark.">
            <Seg
              id="theme"
              value={settings.theme}
              onChange={v => set('theme', v)}
              options={[{ v: 'light' as const, label: 'Daytime' }, { v: 'dark' as const, label: 'Night' }]}
            />
            {settings.theme === 'light' && (
              <p className="set-impact">
                <IconAlert />
                The daytime palette is not designed yet, so the counter stays dark for now. This is
                recorded, not applied.
              </p>
            )}
          </Row>

          <Row label="Caption size" htmlFor="cap" hint="Applies to the resolved sentence and to the visitor display.">
            <Seg
              id="cap"
              value={settings.captionScale}
              onChange={v => set('captionScale', v)}
              options={[{ v: 1, label: 'Standard' }, { v: 1.25, label: 'Large' }, { v: 1.5, label: 'Largest' }]}
            />
            <p className="set-sample" style={{ fontSize: `calc(1.05rem * ${settings.captionScale})` }}>
              Please wait, the doctor will see you shortly.
            </p>
          </Row>

          <Row label="Caption language" htmlFor="lang" hint="English and Hindi appear side by side throughout this product.">
            <Seg
              id="lang"
              value={settings.captionLang}
              onChange={v => set('captionLang', v)}
              options={[
                { v: 'en' as CaptionLang, label: 'English' },
                { v: 'hi' as CaptionLang, label: 'हिन्दी' },
                { v: 'both' as CaptionLang, label: 'Both' },
              ]}
            />
          </Row>

          <Row label="Signing speed" htmlFor="speed" hint="Slower is standard practice when a visitor is unfamiliar with the avatar.">
            <Seg
              id="speed"
              value={settings.speed}
              onChange={v => set('speed', v)}
              options={[{ v: 0.55, label: 'Slow' }, { v: 0.8, label: 'Measured' }, { v: 1, label: 'Normal' }]}
            />
            <div className="relative h-40 w-full max-w-[15rem] overflow-hidden rounded-[22px] bg-[color:var(--surf-2)]">
              <SigningAvatar
                frame={player.frame}
                face={settings.faceChannel}
                className="absolute inset-0"
                label="Signing speed preview"
              />
            </div>
          </Row>
        </Group>

        {}
        <Group title="Recognition">
          <Row
            label="Confidence threshold"
            htmlFor="thr"
            hint="Below this the counter stops and asks the visitor to sign again rather than guess."
          >
            <div className="set-slider">
              <input
                id="thr" type="range" min={0.5} max={0.95} step={0.01}
                value={settings.threshold}
                onChange={e => set('threshold', Number(e.target.value))}
              />
              <output>{pct(settings.threshold)}</output>
            </div>
            <p className={`set-impact ${impact.heavy ? 'set-impact-warn' : ''}`}>
              {impact.wouldRepeat === 0 ? <IconCheck /> : <IconAlert />}
              <span>
                At {pct(settings.threshold)}, {impact.wouldRepeat} of {impact.total} logged visitor
                turns would have been sent back for a repeat.
                {impact.heavy && ' That is a lot of asking someone to sign twice.'}
              </span>
            </p>
          </Row>

          <Row
            label="Operator camera"
            htmlFor="cam"
            hint="A preview for the person at the counter. Recognition never uses it — the model reads landmarks."
          >
            <Seg
              id="cam"
              value={settings.cameraPreview}
              onChange={v => set('cameraPreview', v)}
              options={[{ v: true, label: 'Show' }, { v: false, label: 'Hide' }]}
            />
          </Row>

          <Row
            label="Face channel"
            htmlFor="face"
            hint="ISL marks questions, negation and intensity on the face. Turning it off is not a small saving."
          >
            <Seg
              id="face"
              value={settings.faceChannel}
              onChange={v => set('faceChannel', v)}
              options={[{ v: true, label: 'Keep' }, { v: false, label: 'Drop' }]}
            />
            {!settings.faceChannel && (
              <p className="set-impact set-impact-warn">
                <IconAlert />
                <span>
                  With the face dropped the model reads {FIELD_CENSUS.pose + FIELD_CENSUS.hands} landmarks
                  instead of {FIELD_CENSUS.total}, and cannot tell a question from a statement. Accuracy on
                  wh-signs falls sharply and the avatar signs without grammar.
                </span>
              </p>
            )}
          </Row>
        </Group>

        {}
        <Group title="Privacy">
          <div className="set-note">
            <p><b>{FIELD_CENSUS.total} coordinates per frame. No image, ever.</b></p>
            <p>
              The camera frame is read and discarded inside the same tick. There is no video buffer, no
              upload, and no cloud account attached to this terminal. What you can delete below is the
              text transcript — the only thing that was ever written down.
            </p>
          </div>
          <Row label="Keep transcripts" htmlFor="ret" hint="How long resolved sentences stay in the archive.">
            <Seg
              id="ret"
              value={settings.retention}
              onChange={v => set('retention', v)}
              options={[
                { v: 'session' as Retention, label: 'This session' },
                { v: 'shift' as Retention, label: 'This shift' },
                { v: 'off' as Retention, label: 'Do not keep' },
              ]}
            />
          </Row>
        </Group>

        {}
        <Group title="Vocabulary">
          <Row label="Deployed" hint="Recorded, validated and available at this counter.">
            <p className="set-stat">
              <b>{SIGNS.length} signs</b> · {TOTAL_CLIPS.toLocaleString('en-IN')} clips
            </p>
            <a className="set-btn" href="#vocabulary">Browse the vocabulary →</a>
          </Row>
          <Row
            label="Not signable"
            hint="Replies the counter could only send as text. These go into the next recording session."
          >
            {requested.length ? (
              <ul className="set-reqlist">
                {requested.map(w => <li key={w}><code>{w}</code></li>)}
              </ul>
            ) : (
              <p className="set-stat-muted">
                Nothing yet. Replies that fall outside the vocabulary collect here.
              </p>
            )}
          </Row>
        </Group>

        {}
        <Group title="About this build">
          <dl className="set-about">
            <div><dt>Recogniser</dt><dd>BiGRU over {FIELD_CENSUS.total}-point landmark sequences</dd></div>
            <div><dt>Runtime</dt><dd>Client-side · CPU · no network</dd></div>
            <div><dt>Corpus</dt><dd>{TOTAL_CLIPS.toLocaleString('en-IN')} clips · 4 signers × {SIGNS.length} signs × 20 reps</dd></div>
            <div><dt>Pre-training</dt><dd>INCLUDE (IIT Madras) · FDMSE-ISL</dd></div>
            <div><dt>Prototype</dt><dd>Recognition and synthesis are simulated in this build</dd></div>
          </dl>
          <div className="set-row" style={{ borderTop: 0 }}>
            <span className="set-label">Reset</span>
            <div className="set-ctl">
              <button className="set-btn" onClick={reset}>Reset to defaults</button>
            </div>
          </div>
        </Group>
      </main>
    </div>
  )
}
