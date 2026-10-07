import { useMemo, useRef, useEffect } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { SquircleFilter } from '@/components/ui/squircle-filter'
import SigningAvatar from '@/components/SigningAvatar'
import { useSignPlayer } from '@/lib/hooks'
import { useSettings, type CaptionLang, type Retention } from '@/lib/settings'
import { SPEECH_LANGS, type SpeechLang } from '@/lib/speech'
import { glossToHindi } from '@/lib/hindi'
import { SEED_TURNS } from '@/lib/turns'
import { SIGNS, TOTAL_CLIPS } from '@/lib/lexicon'
import '@/styles/counter.css'
import '@/styles/settings.css'

function Row({
  label, htmlFor, children,
}: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="set-label">{label}</span>}
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


  const requested = useMemo(
    () => [...new Set(SEED_TURNS.filter(t => t.textOnly).map(t => t.text))].slice(0, 6),
    [],
  )

  const hindiSample = useMemo(
    () => glossToHindi(['PLEASE', 'WAIT', 'DOCTOR', 'SEE', 'YOU'])?.text ?? '',
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
        </header>

        {}
        <Group title="This counter">
          <Row label="Site" htmlFor="site">
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
          <Row label="Camera brightness" htmlFor="boost">
            <Seg
              id="boost"
              value={settings.videoBoost}
              onChange={v => set('videoBoost', v)}
              options={[
                { v: 0 as const, label: 'Raw' },
                { v: 1 as const, label: 'Normal' },
                { v: 2 as const, label: 'Bright' },
              ]}
            />
            <p className="set-sample">
              Lifts the frames the hand tracker reads. Raise it if the counter is dim.
            </p>
          </Row>

          <Row label="Caption size" htmlFor="cap">
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

          <Row
            label="Caption language"
            htmlFor="lang"
          >
            <Seg
              id="lang"
              value={settings.captionLang}
              onChange={v => set('captionLang', v)}
              options={[
                { v: 'en' as CaptionLang, label: 'English' },
                { v: 'hi' as CaptionLang, label: 'தமிழ்' },
                { v: 'both' as CaptionLang, label: 'Both' },
              ]}
            />
            {/* The sample is generated by the same function the counter uses,
                from a real gloss sequence — so what is shown here is what
                will actually appear, not a hand-written specimen. */}
            <p className="set-sample">
              {settings.captionLang !== 'hi' && 'Please wait, the doctor will see you shortly.'}
              {settings.captionLang === 'both' && <br />}
              {settings.captionLang !== 'en' && (
                <span className="deva">{hindiSample}</span>
              )}
            </p>
          </Row>

          <Row label="Signing speed" htmlFor="speed">
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
          >
            <div className="set-slider">
              <input
                id="thr" type="range" min={0.5} max={0.95} step={0.01}
                value={settings.threshold}
                onChange={e => set('threshold', Number(e.target.value))}
              />
              <output>{pct(settings.threshold)}</output>
            </div>
          </Row>

          <Row
            label="Operator camera"
            htmlFor="cam"
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
          >
            <Seg
              id="face"
              value={settings.faceChannel}
              onChange={v => set('faceChannel', v)}
              options={[{ v: true, label: 'Keep' }, { v: false, label: 'Drop' }]}
            />
          </Row>

          {/* Off by default. The network cost is stated where it is paid —
              on the Counter's microphone row and in its footer. */}
          <Row
            label="Voice input"
            htmlFor="voice"
          >
            <Seg
              id="voice"
              value={settings.voiceInput}
              onChange={v => set('voiceInput', v)}
              options={[{ v: false, label: 'Off' }, { v: true, label: 'On' }]}
            />
          </Row>

          {settings.voiceInput && (
            <Row
              label="Spoken language"
              htmlFor="slang"
            >
              <Seg
                id="slang"
                value={settings.speechLang}
                onChange={v => set('speechLang', v)}
                options={SPEECH_LANGS.map(l => ({ v: l.v as SpeechLang, label: l.label }))}
              />
            </Row>
          )}
        </Group>

        {}
        <Group title="Privacy">
          <div className="set-note">
            <p><b>Landmarks only. No image, ever.</b></p>
            <p>
              The camera frame is read and discarded inside the same tick. What the recogniser sees is
              75 landmarks — two hands and an upper body — of which it keeps 48 as 144 numbers a frame. There is no video buffer, no upload, and no cloud account attached to this
              terminal. What you can delete below is the text transcript — the only thing that was
              ever written down.
            </p>
          </div>
          <Row label="Keep transcripts" htmlFor="ret">
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
          <Row label="Deployed">
            <p className="set-stat">
              <b>{SIGNS.length} signs</b> · {TOTAL_CLIPS.toLocaleString('en-IN')} clips
            </p>
            <a className="set-btn" href="#vocabulary">Browse the vocabulary →</a>
          </Row>
          <Row
            label="Not signable"
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
            <div><dt>Recogniser</dt><dd>BiGRU with temporal attention · 30 frames × 144 coordinates · 29 signs</dd></div>
            <div>
              <dt>Runtime</dt>
              <dd>
                {settings.voiceInput
                  ? 'Client-side · CPU · network used for voice input only'
                  : 'Client-side · CPU · no network'}
              </dd>
            </div>
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
