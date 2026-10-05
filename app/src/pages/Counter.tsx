import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LandmarkField from '@/components/LandmarkField'
import SigningAvatar from '@/components/SigningAvatar'
import CameraField, { type CameraStatus } from '@/components/CameraField'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { SquircleFilter } from '@/components/ui/squircle-filter'
import { ChatBubble, ChatBubbleMessage } from '@/components/ui/chat-bubble'
import { useRecognizer } from '@/lib/recognizer'
import { useLiveRecognizer } from '@/lib/live'
import { useSignPlayer } from '@/lib/hooks'
import { groupGlosses, readGlosses, suggestFor } from '@/lib/glossing'
import { caption, textToGloss } from '@/lib/hindi'
import { useSpeech } from '@/lib/speech'
import { ALL_SIGNS, SIGN_BY_ID } from '@/lib/lexicon'
import { SEED_TURNS, type Turn } from '@/lib/turns'
import { fetchTurns, createTurn, type NewTurn } from '@/lib/api'
import { useSettings } from '@/lib/settings'
import { AVATAR_ENABLED, MODEL_ENABLED } from '@/lib/flags'
import '@/styles/counter.css'

/**
 * Stands in for the VRM while AVATAR_ENABLED is false.
 *
 * It fills the same stage the rig would, so the card keeps its proportions
 * and the gloss chips below it keep their place — the reply still resolves
 * to a correct sign sequence, it is simply not performed yet.
 */
function AvatarOff({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`} aria-hidden="true">
      <span className="m text-[0.62rem] uppercase tracking-[0.16em] text-white/25">
        Avatar offline
      </span>
    </div>
  )
}

/**
 * The Counter — the working product screen.
 *
 * Three cards: the visitor's lane, the transcript, the staff's lane. The
 * layout's own idea is inversion — the visitor card is dark holding white
 * boxes, the staff card is white holding dark ones. Two people on opposite
 * sides of one desk, said in ground rather than in hue.
 *
 * None of the landing page's decoration belongs here: no cursor trail, no
 * beams. That is enforced by construction — the trail's canvas and its rAF
 * loop live inside Landing, so there is nothing here to switch off. The nav
 * is shared, because a visitor should not be able to tell they left the site.
 *
 * What is simulated: the camera, MediaPipe and the BiGRU. Everything else runs
 * for real — the segmenter opens and closes a window per sign, the classifier
 * emits a confidence, low confidence stalls instead of guessing, and the gloss
 * is written by the same rules the shipped pipeline would use.
 */

/* Real gloss sequences out of the deployed 60, in ISL order: time at the
   front of the clause, wh-signs at the end. */
const VISITOR_LINES: { label: string; glosses: string[] }[] = [
  { label: 'Needs a doctor', glosses: ['DOCTOR', 'SEE', 'NEED'] },
  { label: 'Head pain', glosses: ['MY', 'HEAD', 'PAIN'] },
  { label: 'Asks about a report', glosses: ['TEST', 'REPORT', 'WHEN'] },
  { label: 'Asks the cost', glosses: ['MEDICINE', 'MONEY', 'HOW-MANY'] },
  { label: 'Wants an appointment', glosses: ['TOMORROW', 'APPOINTMENT', 'NEED'] },
  { label: 'Where to sign', glosses: ['FORM', 'SIGNATURE', 'WHERE'] },
  { label: 'Emergency', glosses: ['EMERGENCY', 'DOCTOR', 'NEED'] },
  { label: 'Did not understand', glosses: ['NOT-UNDERSTAND'] },
]

const QUICK_REPLIES = [
  'Please wait, the doctor will see you shortly.',
  'Come tomorrow morning for the report.',
  'Please sign the form here.',
  'Go to room number 2.',
  'Do you need help?',
]

const clockNow = () =>
  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()

const pct = (n: number) => `${Math.round(n * 100)}%`

function GlossChip({
  gloss, tone, conf, live, fresh, spelled,
}: {
  gloss: string; tone: 'in' | 'out'; conf?: number
  live?: boolean; fresh?: boolean; spelled?: boolean
}) {
  const low = conf !== undefined && conf < 0.85
  const cls = live ? 'chip-live' : low ? 'chip-low' : tone === 'in' ? 'chip-in' : 'chip-out'
  return (
    <span
      className={`chip ${cls} ${fresh ? 'chip-enter' : ''} ${spelled ? 'chip-spelled' : ''}`}
      title={
        spelled
          ? `spelled: ${gloss.split('-').join(' ')}`
          : SIGN_BY_ID[gloss]
            ? `${SIGN_BY_ID[gloss].en} · ${SIGN_BY_ID[gloss].hi}`
            : gloss
      }
    >
      {gloss}
      {conf !== undefined && <span className="opacity-55">{pct(conf)}</span>}
    </span>
  )
}

const IconSlow = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
)
const IconReplay = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
    <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function Counter() {
  /* The log starts empty and is filled from the service, so what is on
     screen is what is actually stored. SEED_TURNS is only reached if the
     service cannot be read — see the loader below. */
  const [turns, setTurns] = useState<Turn[]>([])
  const [logLive, setLogLive] = useState<boolean | null>(null)
  const [reply, setReply] = useState('')
  const [picked, setPicked] = useState<number | null>(null)

  /* §5.2 — the Counter reads Settings rather than holding its own copies,
     which is what makes those controls real rather than decorative. Declared
     above the camera state because the camera's default comes out of it. */
  const { settings, set } = useSettings()

  /* Starts from Settings rather than a hardcoded false. `cameraPreview`
     defaults to true and was never read here, so the real camera was off out
     of the box while the Operator camera control claimed otherwise.

     Status is still reported back by the component rather than assumed — a
     panel that says the camera is live while the browser is still showing a
     permission prompt, or after the user denied it, is worse than nothing. */
  const [camera, setCamera] = useState(() => settings.cameraPreview)
  const [camStatus, setCamStatus] = useState<CameraStatus>(
    settings.cameraPreview ? 'starting' : 'off',
  )
  const onCamStatus = useCallback((s: CameraStatus) => {
    setCamStatus(s)
    if (s === 'denied' || s === 'error') setCamera(false)
  }, [])
  const [slow, setSlow] = useState(false)
  const [visitorDisplay, setVisitorDisplay] = useState(false)
  const [signed, setSigned] = useState<string[]>(['ROOM', 'NUMBER', 'GO'])
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const threshold = settings.threshold
  /* §5.2 — the caption language is one setting read in four places: the
     visitor's resolved sentence, every line of the transcript, the visitor
     display, and the reply the clerk is about to send. Hindi is composed
     from the gloss sequence, so it says the same thing the avatar signs. */
  const lang = settings.captionLang
  const faceChannel = settings.faceChannel
  const setFaceChannel = (fn: (v: boolean) => boolean) => set('faceChannel', fn(faceChannel))

  /* Read the stored log once on mount. A counter that cannot reach its log
     service still has to take the next visitor, so a failure here is not an
     error state — it drops to the scripted conversation, marks the log as
     not being written, and the screen carries on. */
  useEffect(() => {
    let cancelled = false
    fetchTurns().then(stored => {
      if (cancelled) return
      if (stored) { setTurns(stored); setLogLive(true) }
      else { setTurns(SEED_TURNS); setLogLive(false) }
    })
    return () => { cancelled = true }
  }, [])

  /* Appended optimistically so the transcript never lags the conversation,
     then reconciled with the row the server actually wrote — which is where
     the id and the timestamp come from. If the write fails the optimistic
     turn stays on screen, because losing a line the clerk just watched
     happen would be worse than a line that is only in memory. */
  const pushTurn = useCallback((t: Omit<Turn, 'id' | 'at' | 'fresh'>) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setTurns(prev => [...prev, { ...t, id: localId, at: clockNow(), fresh: true }])

    const payload: NewTurn = {
      dir: t.dir, text: t.text, glosses: t.glosses,
      conf: t.conf, repeated: t.repeated, textOnly: t.textOnly,
    }
    createTurn(payload).then(saved => {
      if (!saved) { setLogLive(false); return }
      setLogLive(true)
      setTurns(prev => prev.map(x => (x.id === localId ? { ...saved, fresh: true } : x)))
    })
  }, [])

  const commitRead = useCallback(
    (r: { text: string; glosses: string[]; conf: number; repeated: boolean }) =>
      pushTurn({ dir: 'in', text: r.text, glosses: r.glosses, conf: r.conf, repeated: r.repeated }),
    [pushTurn],
  )

  /* Two inbound lanes, and only one of them is running at a time.
     `sim` is the scripted read the picker buttons drive — it is what the
     screen falls back to when no model has been exported. `live` is the
     real one: camera → landmarks → segmenter → classifier → gloss. The
     swap is decided by whether a model actually loaded, so a missing
     public/models/tm/ degrades the demo instead of emptying the panel. */
  const sim = useRecognizer({
    threshold,
    speed: 1,
    face: faceChannel,
    onResolved: commitRead,
  })

  /* MODEL_ENABLED gates the classifier, not the camera. With it off the
     recogniser never loads a model, so `live.ready` stays false and the lane
     falls back to `sim` — while CameraField below still runs Holistic and
     still draws the landmarks. Tracking is real; the reading is not claimed. */
  const live = useLiveRecognizer({
    enabled: camera && MODEL_ENABLED,
    threshold,
    onResolved: commitRead,
  })

  const liveMode = camera && live.ready
  const rec = liveMode ? live : sim

  /* Typed or spoken, English or Hindi — one entry point picks the reader by
     script, so a clerk can work in either language without a mode switch. */
  const parsed = useMemo(() => textToGloss(reply), [reply])
  const spelledWords = useMemo(
    () => parsed.tokens.filter(t => t.kind === 'fingerspell').map(t => t.source),
    [parsed],
  )
  const signer = useSignPlayer(signed, { speed: slow ? settings.speed * 0.5 : settings.speed, idle: true })

  const send = useCallback(() => {
    const text = reply.trim()
    if (!text) return
    const { glosses, oov } = textToGloss(text)
    if (!glosses.length) return
    setSigned(glosses)
    /* Text-only means the avatar could not produce the reply. A spelled word
       is produced, so it no longer counts — only a word with neither a sign
       nor letters does. */
    pushTurn({ dir: 'out', text, glosses, textOnly: oov.length > 0 })
    setReply('')
  }, [reply, pushTurn])

  /* Dictation lands in the composer, never in the transcript: the clerk
     still presses Enter. A misheard sentence must not reach the avatar
     unread, and a cloud recogniser will mishear an Indian counter. */
  const onHeard = useCallback((said: string) => {
    setReply(prev => (prev.trim() ? `${prev.trim()} ${said}` : said))
    composerRef.current?.focus()
  }, [])
  const voice = useSpeech({
    lang: settings.speechLang,
    enabled: settings.voiceInput,
    onFinal: onHeard,
  })
  const micOn = settings.voiceInput && voice.supported

  /* Playing has to wait for the new track to be the current one. Calling
     play() in the same tick as setSigned() looked right and did nothing:
     useSignPlayer resets `playing` to its autoplay value whenever the id
     list changes, so the play was issued against the outgoing track and
     then immediately cancelled by the incoming one. */
  const firstSigned = useRef(true)
  useEffect(() => {
    if (firstSigned.current) { firstSigned.current = false; return }
    signer.play()
  }, [signed])

  /* §10 The spotlight is written straight to a CSS custom property. Putting
     the cursor into React state would re-render the whole screen — including
     two WebGL stages — on every pointer move. */
  const spotRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (matchMedia('(pointer: coarse)').matches) return
    let raf = 0
    let x = 0, y = 0
    const write = () => {
      raf = 0
      spotRef.current?.style.setProperty('--mx', `${x}px`)
      spotRef.current?.style.setProperty('--my', `${y}px`)
    }
    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY
      if (!raf) raf = requestAnimationFrame(write)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  /* the log reads newest-last, like every messages view */
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  /* Read through a ref so the shortcut is bound once and still reaches the
     current recogniser after the language setting changes. */
  const micRef = useRef<(() => void) | null>(null)
  micRef.current = micOn ? voice.toggle : null
  const sendRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)
      if (e.key === 'Escape') { setVisitorDisplay(false); return }
      if (typing) return
      if (e.key === 'v' || e.key === 'V') { setVisitorDisplay(v => !v); return }
      if ((e.key === 'm' || e.key === 'M') && micRef.current) { micRef.current(); return }
      /* Enter, with the composer unfocused, belongs to the visitor's lane:
         it sends the words that have accumulated there. Nothing the camera
         reads reaches the transcript until this happens, which is what lets
         several signs become one sentence. */
      if (e.key === 'Enter') { e.preventDefault(); sendRef.current?.(); return }
      if (e.key === '/') { e.preventDefault(); composerRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Whichever lane is running, Enter sends its pending words. */
  sendRef.current = rec.pending ? rec.send : null

  /* How much of the sentence a retry would keep. */
  const kept = Math.max(0, rec.pending - (liveMode ? 0 : 1))

  const reading = rec.state === 'reading'
  const stalled = rec.state === 'lowconf'
  const busy = rec.state !== 'off' && rec.state !== 'done'
  const segProgress = reading ? rec.player.progress : rec.state === 'done' ? 1 : 0
  const lowSign = stalled ? rec.commits[rec.commits.length - 1] : null

  const stateLabel: Record<string, string> = {
    off: 'Ready', waiting: 'Camera open', reading: 'Reading',
    resolving: 'Resolving', lowconf: 'Unsure', done: 'Resolved',
  }

  const lastOut = [...turns].reverse().find(t => t.dir === 'out')

  /* The three captions this screen shows, all built the same way. */
  /* `utterance`, not `commits`: the sentence is written from the whole
     sequence, and a chip list that has been trimmed by a retry would give
     the two languages different content. */
  const inCap = caption(rec.sentence, rec.utterance, lang, rec.clauses)
  const outCap = caption(
    lastOut?.text ?? 'Go to room number 2.',
    lastOut?.glosses ?? signed,
    lang,
  )
  const replyCap = caption(reply.trim(), parsed.glosses, lang)

  return (
    <div className="counter">
      <SquircleFilter />
      {/* §6 §9 §10 — ground, grid, and the light under the cursor */}
      <div className="counter-ambient" aria-hidden="true" />
      <div className="counter-grid" aria-hidden="true" />
      <div className="counter-spot" ref={spotRef} aria-hidden="true" />
      <RandomLetterSwapNav />

      <main
        id="main"
        className="relative z-[1] grid flex-1 gap-6 px-5 pb-4 pt-[88px] sm:px-7 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.66fr)_minmax(0,1fr)] lg:gap-6 lg:px-8"
      >
        {/* ══ VISITOR — dark card, white boxes ══════════════════ */}
        <section className="card card-visitor rise rise-1">
          <div className="card-skin" />
          <h2 className="card-title">Visitor</h2>
          <div className="card-body">

          {/* the camera feed: landmarks only, and no frame kept */}
          <div className="slot slot-stage">
            <div className="slot-skin" />
            {camera ? (
              /* Real webcam, real MediaPipe Holistic: 33 pose + 21 per hand +
                 468 face, measured off whoever is standing there. The stages
                 after this one — segmenter, BiGRU, gloss — are still the
                 simulation, so what is REAL here is the tracking, not the
                 reading. */
              <CameraField
                active
                /* The tracker follows the recogniser: our own model was
                   trained on the Hand and Pose Landmarkers, the ASL bench
                   needs Holistic's 543 points because it reads the face.
                   Running the wrong one hands the model numbers from a
                   network it has never seen. */
                vision={live.backend === 'islr' ? 'holistic' : 'sanket'}
                face={faceChannel}
                boost={settings.videoBoost}
                onStatus={onCamStatus}
                onFrame={MODEL_ENABLED ? live.onFrame : undefined}
                className="absolute inset-0"
              />
            ) : (
            <LandmarkField
              frame={rec.player.frame}
              direction="in"
              face={faceChannel}
              parallax={false}
              /* §11 a slow ambient drift so 'LIVE · TRACKING' looks live and
                 not like a frozen still. Restrained by design — the component
                 stops it under reduced motion. */
              drift
              trails={reading}
              bloom
              tone="glow"
              zoom={0.9}
              className="absolute inset-0"
              label="Visitor's landmarks, read live"
            />
            )}
            <div className="slot-head pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
              <span className="slot-label flex items-center gap-1.5">
                <span className="live-dot live-dot-ink" />
                {!camera
                  ? 'Standby · sample'
                  : camStatus === 'live'
                    ? liveMode
                      ? live.backend === 'islr'
                        ? 'Camera · ASL bench'
                        : live.backend === 'sanket'
                          ? 'Camera · Sanket model'
                          : 'Camera · reading'
                      : live.status === 'loading'
                        ? 'Camera · loading classifier'
                        : 'Camera · tracking only'
                    : camStatus === 'loading'
                      ? 'Camera · loading model'
                      : 'Camera · starting'}
              </span>
              <span className="slot-label">{stateLabel[rec.state]}</span>
            </div>
            <div className="slot-foot pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
              {/* The claim has to track the state. With the camera off there
                  is no feed at all; with it on there is one, and the honest
                  thing to say is what happens to it — the frames drive the
                  landmarks and are then gone. Neither line says "recording",
                  because nothing is written to disk in either state. */}
              <p className="text-[0.72rem] font-semibold text-white">
                {camStatus === 'denied'
                  ? 'Camera blocked by the browser.'
                  : liveMode
                    ? live.backend === 'sanket'
                      /* Said plainly, because the recogniser is a second
                         process: the frames stay in this tab, the 144
                         coordinates go to a service on this same machine,
                         and nothing leaves it. */
                      ? 'Live camera. Landmarks read on this machine. No frame is kept.'
                      : live.backend === 'islr'
                      /* Said plainly on screen, because a bench that reads a
                         different language must never be mistaken for the
                         product. Landmarks leave the page for the local
                         service; frames still do not leave the browser. */
                      ? 'PopSign ASL bench — not ISL. Landmarks only.'
                      : 'Live camera, reading signs. No frame is kept.'
                    : camera && live.status === 'absent'
                      ? 'Tracking only — no classifier exported.'
                      : camera && live.status === 'error'
                        ? 'Classifier failed to load — tracking only.'
                        : camera
                          ? 'Live camera. No frame is kept.'
                          : 'Camera off. Nothing is being recorded.'}
              </p>

              <button
                className={`cam-toggle pointer-events-auto${camera ? ' cam-on' : ''}`}
                aria-pressed={camera}
                onClick={() => { setCamera(v => !v); if (camera) setCamStatus('off') }}
                title={camera ? 'Turn the camera off' : 'Turn the camera on and track for real'}
              >
                <span className="cam-dot" />
                {camera ? 'Camera on' : 'Camera off'}
              </button>
            </div>
          </div>

          {/* the output box: what the machine heard */}
          {/* Always open, and it has to stay that way.

              It used to fold itself open the moment the first word committed
              (`reading || stalled || commits.length > 0 || sentence`), which
              grew this panel by ~40–64px inside a flex column — so the camera
              stage above it shrank at the same instant. The canvas only
              re-measured on window resize, so it was left holding a stale
              backing store while CSS stretched the frame against it, and the
              preview read as a shake for as long as the fold animated.

              Pinning it open removes the trigger: the lane no longer changes
              height when words arrive, so the camera never moves. Hover still
              discloses it the same way the staff composer does. */}
          <div className="slot disclose px-5 py-4 is-open">
            <div className="slot-skin" />
            <div className="disclose-fold fold-ohead">
              <div className="disclose-inner mb-3 flex items-center gap-3">
                <span className="slot-label shrink-0">Output</span>
                <div className="seg-track flex-1" data-open={reading ? '1' : '0'}>
                  <div className="seg-fill" style={{ width: `${segProgress * 100}%` }} />
                </div>
                <span className="slot-label shrink-0">
                  {reading ? `${rec.commits.length}/${rec.utterance.length}` : '—'}
                </span>
                {/* Clears the read and puts the lane back to waiting. The
                    picker rail already had this, but only while a read was
                    running and only over on the controls — a clerk watching a
                    bad read wants to reset the thing they are looking AT. */}
                <button
                  className="out-refresh shrink-0"
                  onClick={() => { rec.stop(); setPicked(null) }}
                  disabled={rec.state === 'off'}
                  title="Clear the output and wait for the next sign"
                  aria-label="Clear the output"
                >
                  ↻
                </button>
              </div>
            </div>

            {rec.commits.length > 0 && (
              <div className="disclose-fold fold-ochips">
                <div className="disclose-inner mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {rec.commits.map((c, i) => (
                    <GlossChip key={`${c.gloss}-${i}`} gloss={c.gloss} tone="in" conf={c.conf} fresh />
                  ))}
                  {reading && <span className="caret" />}
                </div>
              </div>
            )}

            {stalled ? (
              <div>
                <p className="sentence sentence-stall sentence-live">Not sure about that sign.</p>
                <p className="mt-1.5 max-w-[46ch] text-[0.76rem] leading-snug text-white/60">
                  {lowSign && <><span className="m text-[0.66rem]">{lowSign.gloss}</span> read at {pct(lowSign.conf)}, under the {pct(threshold)} threshold. </>}
                  {/* The scripted lane shows the unsure word as its last
                      chip, so it is inside the count; the live lane holds it
                      outside. Either way this says how much of the sentence
                      survives a retry. */}
                  {kept === 0
                    ? 'The terminal stops rather than guessing.'
                    : kept === 1
                      ? 'Only this word is waiting — the one in front of it stands.'
                      : `Only this word is waiting — the ${kept} in front of it stand.`}
                </p>
              </div>
            ) : (
              <>
                <p
                  className={`sentence ${rec.sentence ? 'sentence-live' : 'sentence-ghost'}`}
                  style={rec.sentence ? { fontSize: `calc(1.45rem * ${settings.captionScale})` } : undefined}
                >
                  {rec.sentence ? inCap.primary : 'The visitor’s sentence appears here.'}
                </p>
                {/* Hindi is not a translation of the line above it — both are
                    written from the same gloss sequence, which is the only
                    thing the machine actually read. */}
                {rec.sentence && inCap.secondary && (
                  <p
                    className="sentence-hi deva"
                    style={{ fontSize: `calc(1.05rem * ${settings.captionScale})` }}
                    title={inCap.composed ? 'Hindi composed from the sign sequence' : undefined}
                  >
                    {inCap.secondary}
                  </p>
                )}

                {/* Nothing above has been written down yet. Several signs
                    become one sentence here, and it is sent on purpose. */}
                {rec.pending > 0 && (
                  <div className="pending-bar">
                    <span className="pending-count">
                      {rec.pending} {rec.pending === 1 ? 'word' : 'words'} waiting
                    </span>
                    <button
                      className="go go-undo"
                      onClick={() => rec.undo()}
                      title="Take back the last word — the sentence in front of it stands"
                    >
                      ⌫ Last word
                    </button>
                    <button className="go go-send" onClick={() => rec.send()}>
                      ↵ Add to transcript
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* the bar: who is at the counter and what they sign */}
          <div className="slot px-4 py-3">
            <div className="slot-skin" />
            <div className="rail items-center">
              {stalled ? (
                <button className="go go-stall" onClick={rec.retry}>↻ Repeat that word</button>
              ) : liveMode ? (
                /* Nothing to pick from: the visitor is the input. What the
                   rail shows instead is the segmenter, because the one thing
                   a signer needs to know is when the machine is looking —
                   and it looks during the HOLD, not during the movement. */
                <>
                  <span className="slot-label shrink-0">
                    {live.segState === 'hold'
                      ? live.backend === 'islr' ? 'Reading the sign' : 'Reading the hold'
                      : live.segState === 'moving'
                        ? 'Movement'
                        : 'Waiting for hands'}
                  </span>
                  <div className="seg-track flex-1" data-open={live.segState !== 'idle' ? '1' : '0'}>
                    <div
                      className="seg-fill"
                      style={{ width: `${Math.min(1, live.energy / 0.6) * 100}%` }}
                    />
                  </div>
                  {(rec.commits.length > 0 || rec.sentence) && (
                    <button className="go" onClick={() => rec.stop()}>Clear</button>
                  )}
                </>
              ) : (
                <>
                  {VISITOR_LINES.map((line, i) => (
                    <button
                      key={line.label}
                      className="pick"
                      aria-pressed={picked === i}
                      disabled={busy}
                      onClick={() => { setPicked(i); sim.begin(line.glosses) }}
                      title={line.glosses.join(' · ')}
                    >
                      {line.label}
                    </button>
                  ))}
                  {rec.state !== 'off' && (
                    <button className="go" onClick={() => { rec.stop(); setPicked(null) }}>
                      {rec.state === 'done' ? 'Clear' : 'Cancel'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        </section>

        {/* ══ TRANSCRIPT ════════════════════════════════════════ */}
        <section className="card card-transcript rise rise-2">
          <div className="card-skin" />
          <h2 className="card-title">Transcript</h2>
          <div className="bubbles" ref={logRef}>
            {turns.map(t => {
              const cap = caption(t.text, t.glosses, lang)
              return (
              <ChatBubble
                key={t.id}
                variant={t.dir === 'out' ? 'sent' : 'received'}
                className={t.fresh ? 'turn-new' : undefined}
              >
                {/* Plain text in the log, with the clock time shown. A
                    transcript that cannot say WHEN something was said is a
                    chat window, not a record — and at a counter the time is
                    the part a clerk refers back to. The gloss and confidence
                    stay on the title, a hover away, so surfacing the time
                    does not drag three more lines of machine output with it. */}
                <ChatBubbleMessage
                  variant={t.dir === 'out' ? 'sent' : 'received'}
                  className={t.textOnly ? 'bubble-textonly' : undefined}
                  title={[
                    t.glosses.join(' · '),
                    t.at,
                    t.conf !== undefined ? pct(t.conf) : null,
                    t.repeated ? 'repeated' : null,
                    t.textOnly ? 'text only — could not be signed in full' : null,
                  ].filter(Boolean).join('  ·  ')}
                >
                  {cap.primary}
                  {cap.secondary && <span className="bubble-hi deva">{cap.secondary}</span>}
                  <span className="m turn-time">{t.at}</span>
                </ChatBubbleMessage>
              </ChatBubble>
              )
            })}

            {/* the avatar is mid-utterance, so the log says so */}
            {signer.playing && (
              <ChatBubble variant="sent">
                <ChatBubbleMessage variant="sent" isLoading />
              </ChatBubble>
            )}
          </div>
        </section>

        {/* ══ STAFF — white card, dark boxes ════════════════════ */}
        <section className="card card-staff rise rise-3">
          <div className="card-skin" />
          <h2 className="card-title">Staff</h2>
          <div className="card-body">

          {/* the avatar signing the reply */}
          <div className="slot slot-stage">
            <div className="slot-skin" />
            {/* The VRM, driven by the same ResolvedFrame the landmark field
                uses — one representation, two renderers. */}
            <div className="avatar-ground" aria-hidden="true" />
            {AVATAR_ENABLED ? (
              <SigningAvatar
                frame={signer.frame}
                face={faceChannel}
                className="absolute inset-0"
                label="The avatar signing the reply"
              />
            ) : (
              <AvatarOff className="absolute inset-0" />
            )}
            <div className="slot-head pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
              <span className="slot-label flex items-center gap-1.5">
                {AVATAR_ENABLED && <span className="live-dot" />}
                Avatar · {AVATAR_ENABLED ? 'signing' : 'offline'}
              </span>
              <span className="slot-label">
                {!AVATAR_ENABLED ? '—' : signer.playing ? 'Playing' : 'Held'}
              </span>
            </div>
            <div className="slot-foot pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-x-4 gap-y-2 p-4">
              {groupGlosses(signed).map(run => (
                <GlossChip
                  key={`${run.label}-${run.from}`}
                  gloss={run.label}
                  tone="out"
                  spelled={run.spelled}
                  live={signer.playing
                    && signer.active >= run.from
                    && signer.active < run.from + run.ids.length}
                />
              ))}
            </div>
          </div>

          {/* the input box */}
          {/* Rests as a single input line and opens on hover, focus or the
              moment it holds text. Everything it had is still here — it is
              disclosed rather than removed, so the resting screen is quiet
              without the clerk losing anything they need mid-conversation. */}
          <div className={`slot disclose px-5 py-4${reply.trim() ? ' is-open' : ''}`}>
            <div className="slot-skin" />
            <div className="disclose-fold fold-head">
              <div className="disclose-inner mb-2 flex items-center justify-between">
                <span className="slot-label">Reply to the visitor</span>
                <span className="slot-label">↵ sign</span>
              </div>
            </div>
            <textarea
              ref={composerRef}
              rows={2}
              className="composer"
              placeholder="Type what you would say at the counter…"
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            />

            {/* Speech is opt-in per counter and says so while it is on. The
                browser's recogniser is the one part of this product that
                leaves the machine — audio goes to the browser vendor's
                service and text comes back — so the row states that rather
                than showing a bare microphone glyph. Typing is unchanged and
                remains the offline path. */}
            {micOn && (
              <div className="mic-row">
                <button
                  className={`mic${voice.state === 'listening' ? ' mic-live' : ''}`}
                  aria-pressed={voice.state === 'listening'}
                  onClick={voice.toggle}
                  title={voice.state === 'listening' ? 'Stop listening (M)' : 'Speak the reply (M)'}
                >
                  <span className="mic-dot" />
                  {voice.state === 'listening' ? 'Listening' : 'Speak'}
                </button>
                <span className="mic-note">
                  {voice.error
                    ? voice.error
                    : voice.state === 'listening'
                      ? `Audio goes to the browser’s speech service · ${settings.speechLang === 'hi-IN' ? 'हिन्दी' : 'English'}`
                      : 'Cloud speech · typing stays on the machine'}
                </span>
                {voice.interim && <span className="mic-interim">{voice.interim}</span>}
              </div>
            )}

            {reply.trim() && (
              <div className="mt-2 border-t border-white/10 pt-3">
                {/* One line, not a token-by-token inspector. What the clerk
                    needs to know before pressing Enter is what will actually
                    be signed and in what order — the per-word strikethroughs
                    were a lesson about ISL, not a control. */}
                {parsed.glosses.length > 0 && (
                  <p className="m text-[0.55rem] leading-relaxed text-white/70">
                    {parsed.glosses.join(' · ')}
                  </p>
                )}

                {/* What the visitor will read, in the language they are set
                    to read it in — shown before Enter, not after. */}
                {replyCap.secondary && (
                  <p className="deva mt-1.5 text-[0.8rem] leading-snug text-white/70">
                    {replyCap.secondary}
                  </p>
                )}

                {/* A word outside the vocabulary is spelled, never swapped for
                    one that merely looks close. At a medical counter a
                    confident substitution is worse than a slower answer. */}
                {spelledWords.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-[rgb(167_155_255/0.35)] bg-[rgb(110_96_220/0.14)] px-3.5 py-3">
                    <p className="m text-[0.55rem] text-[color:#A79BFF]">
                      Outside the {ALL_SIGNS.length}-sign vocabulary — spelled
                    </p>
                    <p className="mt-1.5 text-[0.78rem] leading-snug text-white/75">
                      <span className="font-semibold text-white">{spelledWords.join(', ')}</span>
                      {spelledWords.length > 1 ? ' have' : ' has'} no sign, so
                      {spelledWords.length > 1 ? ' they are' : ' it is'} fingerspelled letter by
                      letter. Nothing is substituted.
                    </p>
                  </div>
                )}

                {/* Only reached by something with no letters to spell either. */}
                {parsed.oov.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-[rgb(255_143_163/0.4)] bg-[rgb(214_34_74/0.12)] px-3.5 py-3">
                    <p className="m text-[0.55rem] text-[color:#FF8FA3]">
                      Cannot be signed or spelled
                    </p>
                    <p className="mt-1.5 text-[0.78rem] leading-snug text-white/75">
                      <span className="font-semibold text-white">{parsed.oov.join(', ')}</span> has no
                      sign and no letters to spell. Nothing will be substituted for it.
                    </p>
                    {suggestFor(parsed.oov[0]).length > 0 && (
                      <p className="m mt-2 text-[0.55rem] text-white/45">
                        In vocabulary: {suggestFor(parsed.oov[0]).slice(0, 3).join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="disclose-fold fold-quick">
              <div className="disclose-inner rail mt-3">
                {QUICK_REPLIES.map(q => (
                  <button key={q} className="quick" onClick={() => setReply(q)}>{q}</button>
                ))}
              </div>
            </div>
          </div>

          {/* playback — holds and slow mode are legibility, not polish */}
          <div className="slot flex items-center gap-4 px-5 py-3">
            <div className="slot-skin" />
            <button className={`ctl ${slow ? 'ctl-on' : ''}`} aria-pressed={slow} title="Slow mode" onClick={() => setSlow(s => !s)}>
              <IconSlow />
            </button>
            <button className="ctl ctl-primary" title="Play" onClick={() => signer.play()}><IconPlay /></button>
            <button className="ctl" title="Replay" onClick={() => { signer.stop(); signer.play() }}><IconReplay /></button>
            <div className="ml-auto text-right">
              <span className="slot-label">
                {slow ? `Slow · ${(settings.speed * 0.5).toFixed(2)}×` : `${settings.speed}× speed`}
              </span>
              <p className="mt-0.5 truncate text-[0.68rem] text-white/55">
                {readGlosses(signed).join(' ')}
              </p>
            </div>
          </div>
          </div>
        </section>
      </main>

      {/* ── utility rail ───────────────────────────────────────── */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-4 sm:px-7 lg:px-8">
        <span className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="m text-[0.56rem] text-white/50">Counter live · {settings.staff}</span>
        </span>
        <button
          onClick={() => setFaceChannel(f => !f)}
          aria-pressed={faceChannel}
          title="468-point face mesh — ISL marks questions and negation on the face"
          className={`util ${faceChannel ? '' : 'util-off'}`}
        >
          Face channel {faceChannel ? 'on' : 'off'}
        </button>
        <button className="util" onClick={() => setVisitorDisplay(true)}>⛶ Visitor display</button>
        <span className="m text-[0.56rem] text-white/25">On-device · {ALL_SIGNS.length} signs · fingerspelling · CPU</span>

        {/* Everything else on this screen runs in the page. If speech is on,
            one thing does not, and the footer that makes the on-device claim
            is where that has to be said. */}
        {settings.voiceInput && (
          <span
            className="m text-[0.56rem]"
            style={{ color: '#FF8A3D' }}
            title="The browser's speech recogniser streams microphone audio to its vendor's service. Turn it off in Settings to keep this counter fully offline."
          >
            Speech · cloud {voice.supported ? '' : '· unsupported here'}
          </span>
        )}

        {/* Whether the log is actually being written. The screen should never
            imply a record it is not keeping, so this states the real state
            rather than staying quiet when the service is unreachable. */}
        <span
          className="m text-[0.56rem]"
          style={{ color: logLive === false ? '#FF8A3D' : 'rgb(255 255 255 / 0.25)' }}
          title={
            logLive === false
              ? 'This browser is not allowing storage. Turns are held in memory for this session only.'
              : 'Turns are written to this browser as they happen. Nothing is sent anywhere.'
          }
        >
          {logLive === null ? 'Log · opening' : logLive ? 'Log · on device' : 'Log · memory only'}
        </span>
        <span className="ml-auto hidden items-center gap-4 lg:flex">
          {[['V', 'display'], ['↵', 'send read'], ['/', 'reply'], ...(micOn ? [['M', 'speak']] : []), ['Esc', 'exit']].map(([k, what]) => (
            <span key={k} className="flex items-center gap-1.5">
              <kbd className="key">{k}</kbd>
              <span className="m text-[0.54rem] text-white/30">{what}</span>
            </span>
          ))}
        </span>
      </footer>

      {/* ══ VISITOR DISPLAY ══════════════════════════════════════
          Full-screen, one caption, the avatar and nothing else. This is
          what the deaf visitor actually looks at; a kiosk without it is
          unusable. */}
      {visitorDisplay && (
        <div className="vdisplay" role="dialog" aria-modal="true" aria-label="Visitor display">
          <div className="flex items-center justify-between px-7 py-5">
            <span className="m text-[0.6rem] text-white/40">{settings.site} · {settings.counter}</span>
            <button onClick={() => setVisitorDisplay(false)} className="util">Esc — exit</button>
          </div>

          <div className="relative min-h-0 flex-1">
            {AVATAR_ENABLED ? (
              <SigningAvatar
                frame={signer.frame}
                face={faceChannel}
                className="absolute inset-0"
                label="The avatar signing the reply, full screen"
              />
            ) : (
              <AvatarOff className="absolute inset-0" />
            )}
          </div>

          <div className="px-7 pb-12 pt-4">
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {groupGlosses(signed).map(run => (
                <GlossChip
                  key={`${run.label}-${run.from}`}
                  gloss={run.label}
                  tone="out"
                  spelled={run.spelled}
                  live={signer.playing
                    && signer.active >= run.from
                    && signer.active < run.from + run.ids.length}
                />
              ))}
            </div>
            <p
              className="vcaption"
              aria-live="polite"
              style={{ fontSize: `calc(clamp(2rem, 5.4vw, 5rem) * ${settings.captionScale})` }}
            >
              {outCap.primary}
            </p>
            {/* The one screen the deaf visitor actually reads. If they read
                Hindi faster than English, this is where it matters most. */}
            {outCap.secondary && (
              <p
                className="vcaption vcaption-hi deva"
                style={{ fontSize: `calc(clamp(1.4rem, 3.4vw, 3.1rem) * ${settings.captionScale})` }}
              >
                {outCap.secondary}
              </p>
            )}
            <div className="mt-8 flex items-center justify-center gap-5">
              <button className={`ctl ${slow ? 'ctl-on' : ''}`} title="Slow mode" onClick={() => setSlow(s => !s)}><IconSlow /></button>
              <button className="ctl ctl-primary" title="Play" onClick={() => signer.play()}><IconPlay /></button>
              <button className="ctl" title="Replay" onClick={() => { signer.stop(); signer.play() }}><IconReplay /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
