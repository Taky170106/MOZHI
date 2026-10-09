import { useEffect, useRef } from 'react'
import { FRAMING } from '@/lib/classifier'
import {
  FilesetResolver,
  HolisticLandmarker,
  type HolisticLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { createSanketVision, VISION_DELEGATE, type SanketVision, type SignFrame } from '@/lib/sanket-vision'
import { isHand, handSpan } from '@/lib/hand'

/* ============================================================
   CameraField — the real inbound pipeline, stages 01 and 02.

   The webcam, and MediaPipe Holistic over it: 33 pose landmarks, 21 per
   hand and a 468-point face mesh. That is the brief's 543 per frame, and
   they are real here — measured off whoever is in front of the camera
   rather than replayed from a fixture.

   What this is NOT is the classifier. Stages 03–05 (the segmenter, the
   BiGRU, the gloss) remain simulated, because there is no trained model in
   this repository. So the panel shows real tracking driving a real skeleton;
   what the machine claims to have UNDERSTOOD is still scripted.

   The wasm and the model are served from public/mediapipe rather than a CDN.
   A product whose whole claim is that it runs offline on a counter's own
   machine cannot reach for Google's servers the first time someone signs.
   ============================================================ */

/* 'starting' is the permission prompt; 'loading' is the model. They are
   separate because the model is ~24MB of wasm and weights and takes seconds
   on a cold cache — a panel that just says "starting" for ten seconds looks
   broken, and the honest fix is to say which of the two is happening. */
export type CameraStatus = 'off' | 'starting' | 'loading' | 'live' | 'denied' | 'error'

type Props = {
  active: boolean
  /* Which tracker to run.

     'sanket' is the pair the recogniser's checkpoint was trained on — the
     standalone Hand and Pose Landmarkers. 'holistic' is the 543-point model
     the PopSign bench needs, because that one reads the face too. They are
     different networks with different landmark semantics, so the choice
     belongs to whichever recogniser is about to read the numbers. */
  vision?: 'sanket' | 'holistic'
  face?: boolean
  /* Camera lift, from Settings. 0 raw, 1 normalised, 2 bright. Fed to the
     frames the landmarker reads, not just to the preview. */
  boost?: 0 | 1 | 2
  onStatus?: (status: CameraStatus, detail?: string) => void
  /* Diagnostics. When on, a readout is drawn over the stage showing what
     MediaPipe claimed this frame (raw) next to what hand.ts let through
     (pass). The two numbers together are the only way to localise a false
     positive: raw=0 while a word appears means the detector is innocent
     and the problem is downstream; raw=1 with a span far below 0.05 means
     the detector is inventing and the gate is the only thing holding. */
  probe?: boolean
  /* Every frame that was actually run through Holistic, handed on with the
     video element it came from. The landmarks are what the segmenter reads;
     the video is what the classifier crops. Nothing is retained here — the
     callback is synchronous and the frame is gone when it returns. */
  onFrame?: (
    result: HolisticLandmarkerResult | null,
    video: HTMLVideoElement,
    t: number,
    /* Present only in 'sanket' mode: the 144 floats the model wants, built
       by the same rules its training data was. */
    sign?: SignFrame,
  ) => void
  className?: string
}

const asset = (p: string) => `${import.meta.env.BASE_URL}mediapipe/${p}`.replace(/\/{2,}/g, '/')

/* The visitor lane's blue, matched to the simulated field so switching the
   camera on changes what drives the skeleton, not what it looks like. */
const INK_LIT = '#29A9F5'
const INK_FACE = 'rgba(41, 169, 245, 0.55)'

/* Three lift levels.

   `lift`/`gain` shape the pixels MediaPipe reads; `alpha`/`gray` shape only
   the preview. Deliberately separate: the preview is held down under a black
   fill so the wireframe reads over it, and that dimming must never reach the
   landmarker — but neither should a genuinely dark room. */
const BOOST: Record<number, { lift: number; gain: number; alpha: number; gray: number }> = {
  0: { lift: 1, gain: 1, alpha: 0.34, gray: 1 },
  1: { lift: 1.25, gain: 1.08, alpha: 0.5, gray: 0.3 },
  2: { lift: 1.5, gain: 1.14, alpha: 0.66, gray: 0.15 },
}

export default function CameraField({
  active, vision = 'sanket', face = true, boost = 1, onStatus, onFrame, probe, className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* Read through refs inside the loop so toggling the face channel does not
     tear down the camera and re-acquire it. */
  const faceRef = useRef(face)
  faceRef.current = face
  /* Read inside the loop, like the face flag, so changing brightness does not
     tear down and re-acquire the camera. */
  const boostRef = useRef(boost)
  boostRef.current = boost
  const statusRef = useRef(onStatus)
  statusRef.current = onStatus
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame
  const probeElRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /* Bound to non-null locals: `draw` is hoisted and called from several
       places, and TypeScript cannot keep the narrowing above across that. */
    const vid = video
    const cvs = canvas
    const c2d = ctx

    let stream: MediaStream | null = null
    let landmarker: HolisticLandmarker | null = null
    let sanket: SanketVision | null = null
    let raf = 0
    let ro: ResizeObserver | null = null
    let disposed = false
    let lastVideoTime = -1
    let result: HolisticLandmarkerResult | null = null

    const say = (s: CameraStatus, detail?: string) => {
      if (!disposed) statusRef.current?.(s, detail)
    }

    say('starting')

    /* Sized to the element, capped at 2x — the landmark work is per frame and
       a retina backing store buys nothing for a wireframe. */
    let lastW = 0
    let lastH = 0
    let lastDpr = 0
    const resize = () => {
      const r = cvs.getBoundingClientRect()
      if (!r.width || !r.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (r.width === lastW && r.height === lastH && dpr === lastDpr) return
      lastW = r.width; lastH = r.height; lastDpr = dpr
      cvs.width = Math.round(r.width * dpr)
      cvs.height = Math.round(r.height * dpr)
      draw()   // the resize cleared the buffer; never present it empty
    }

    /* The video is letterboxed into the panel rather than stretched, and the
       landmarks have to use the same box or the skeleton drifts off the body.
       Normalised coordinates are mapped through this one transform. */
    const box = () => {
      const cw = cvs.width
      const ch = cvs.height
      const vw = vid.videoWidth || 4
      const vh = vid.videoHeight || 3
      const scale = Math.max(cw / vw, ch / vh)   // cover
      const w = vw * scale
      const h = vh * scale
      return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
    }

    /* The source MediaPipe reads.

       Normally the raw video. But a dark room hands the landmarker dark
       pixels, and HandLandmarker's min detection confidence of 0.5 starts
       failing there — a failed detection writes zeros into the 144-dim
       vector, the segmenter sees no hand, and the word is dropped before the
       model is ever asked to guess it.

       Lifting a copy costs one drawImage and moves no geometry: the landmarks
       are positions, and brightening pixels does not move a hand. The canvas
       is the video's own size, so every normalised coordinate is unchanged. */
    let lift: HTMLCanvasElement | null = null
    let lctx: CanvasRenderingContext2D | null = null
    const prepared = (): HTMLVideoElement | HTMLCanvasElement => {
      const cfg = BOOST[boostRef.current] ?? BOOST[1]
      if (cfg.lift === 1 && cfg.gain === 1) return vid      // raw, by request
      const w = vid.videoWidth
      const h = vid.videoHeight
      if (!w || !h) return vid                              // no metadata yet
      if (!lift) {
        lift = document.createElement('canvas')
        lift.width = w
        lift.height = h
        lctx = lift.getContext('2d')
      }
      if (!lctx) return vid
      lctx.filter = `brightness(${cfg.lift}) contrast(${cfg.gain})`
      lctx.drawImage(vid, 0, 0, w, h)
      lctx.filter = 'none'
      return lift
    }

    const dot = (p: NormalizedLandmark, b: ReturnType<typeof box>, r: number, fill: string) => {
      ctx.beginPath()
      /* Mirrored horizontally: a counter display is a mirror to the person
         standing at it, so raising your right hand raises the skeleton's. */
      ctx.arc(b.x + (1 - p.x) * b.w, b.y + p.y * b.h, r, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    }

    const link = (
      pts: NormalizedLandmark[],
      pairs: readonly { start: number; end: number }[],
      b: ReturnType<typeof box>,
      width: number,
      stroke: string,
    ) => {
      ctx.lineWidth = width
      ctx.strokeStyle = stroke
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const { start, end } of pairs) {
        const a = pts[start]
        const c = pts[end]
        if (!a || !c) continue
        ctx.moveTo(b.x + (1 - a.x) * b.w, b.y + a.y * b.h)
        ctx.lineTo(b.x + (1 - c.x) * b.w, b.y + c.y * b.h)
      }
      ctx.stroke()
    }

    function draw() {
      const ctx = c2d
      const cw = cvs.width
      const ch = cvs.height
      const dpr = lastDpr || 1

      ctx.clearRect(0, 0, cw, ch)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, cw, ch)

      const b = box()

      /* The feed is shown, but held right down. It is there so a visitor can
         see the camera really is on and pointed at them; the bright layer is
         the landmark set, because the landmarks are what the machine keeps. */
      if (vid.readyState >= 2) {
        const cfg = BOOST[boostRef.current] ?? BOOST[1]
        ctx.save()
        ctx.globalAlpha = cfg.alpha
        ctx.filter = `grayscale(${cfg.gray}) brightness(${cfg.lift}) contrast(${cfg.gain})`
        ctx.translate(cw, 0)
        ctx.scale(-1, 1)                     // mirror, as above
        c2d.drawImage(vid, cw - b.x - b.w, b.y, b.w, b.h)
        ctx.restore()
        ctx.filter = 'none'
      }

      if (!result) return

      const pose = result.poseLandmarks?.[0]
      if (pose) {
        link(pose, HolisticLandmarker.POSE_CONNECTIONS, b, 2 * dpr, 'rgba(27, 110, 243, 0.85)')
        for (const p of pose) dot(p, b, 2.2 * dpr, INK_LIT)
      }

      /* Drawn only if it would also be COUNTED — see hand.ts. What the
         panel shows and what the segmenter below it accepts have to be the
         same set of hands, or the operator watches a skeleton the machine
         is refusing to read and has no way to know which of them is
         lying. */
      for (const hand of [result.leftHandLandmarks?.[0], result.rightHandLandmarks?.[0]]) {
        if (!isHand(hand)) continue
        link(hand, HolisticLandmarker.HAND_CONNECTIONS, b, 1.6 * dpr, 'rgba(41, 169, 245, 0.9)')
        for (const p of hand) dot(p, b, 1.7 * dpr, '#9BD8FF')
      }

      /* The face channel is a real toggle here, not a label: switching it off
         stops the mesh being drawn at all, which is the brief's point that
         ISL grammar lives on the face. */
      if (faceRef.current) {
        const mesh = result.faceLandmarks?.[0]
        if (mesh) for (const p of mesh) dot(p, b, 0.75 * dpr, INK_FACE)
      }
    }

    /* The readout, three lines: what the detector claimed, what the gate
       let through, and the frame it came from. `raw` is MediaPipe's answer,
       `pass` is hand.ts's. A word appearing while raw=0 indicts the
       segmenter or the engine and clears the tracker. */
    const f = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '--')
    const probeLine = (
      spans: number[],
      labels: string[],
      pass: number,
      dupes: number,
      pose: boolean,
      src: string,
    ): string => {
      const verdict = spans.length === 0 ? 'NO HAND' : pass > 0 ? 'HAND' : 'REJECTED'
      return [
        `MediaPipe ${VISION_DELEGATE} raw=${spans.length} pass=${pass}${dupes ? ` dup=${dupes}` : ''}   ${verdict}`,
        spans.length
          ? `span ${spans.map(f).join(' ')}   label ${labels.join(' ')}   gate >=0.05`
          : 'detector returned nothing   gate >=0.05',
        `pose=${pose ? 1 : 0}   src=${src}   ${vid.videoWidth}x${vid.videoHeight}   t=${vid.currentTime.toFixed(2)}s`,
      ].join('\n')
    }

    const tick = () => {
      if (disposed) return
      raf = requestAnimationFrame(tick)
      if ((!landmarker && !sanket) || vid.readyState < 2) return

      /* detectForVideo rejects a repeated timestamp, and the camera delivers
         frames more slowly than the display refreshes. */
      if (vid.currentTime !== lastVideoTime) {
        lastVideoTime = vid.currentTime
        const t = performance.now()
        let sign: SignFrame | undefined
        /* Captured regardless of whether the readout is showing: the whole
           point is to have the detector's claim on hand the moment somebody
           asks why a word appeared. */
        let spans: number[] = []
        let labels: string[] = []
        let pass = 0
        let dupes = 0
        let pose = false
        let srcKind = 'raw'
        try {
          /* Lifted, not raw — see prepared(). Same dimensions, so the
             landmarks land exactly where the raw frame would have put them. */
          const src = prepared()
          srcKind = src === vid ? 'raw' : 'lift'
          if (sanket) {
            sign = sanket.detect(src, t)
            result = sanket.last as HolisticLandmarkerResult
            spans = sanket.probe.spans
            labels = sanket.probe.labels
            pass = sanket.probe.accepted
            dupes = sanket.probe.dupes
            pose = sanket.probe.pose
          } else {
            result = landmarker!.detectForVideo(src, t)
            const slots = [
              result.leftHandLandmarks?.[0],
              result.rightHandLandmarks?.[0],
            ]
            for (let i = 0; i < slots.length; i++) {
              const p = slots[i]
              if (!p) continue
              spans.push(handSpan(p))
              labels.push(i === 0 ? 'L' : 'R')
              if (isHand(p)) pass += 1
            }
            pose = !!result.poseLandmarks?.[0]
          }
        } catch {
          /* A dropped frame is not worth tearing the panel down for. */
        }
        /* The recogniser runs on the frames that were actually tracked, not
           on every display refresh — classifying the same frame twice would
           double its weight in the hold average for no new information. */
        try {
          frameRef.current?.(result, vid, t, sign)
        } catch (err) {
          /* A fault downstream must not stop the tracking. */
          console.error('[CameraField] frame consumer threw', err)
        }

        const el = probeElRef.current
        if (el) el.textContent = probeLine(spans, labels, pass, dupes, pose, srcKind)
      }
      draw()
    }

    ;(async () => {
      /* Both started at once. The model does not need the camera and the
         camera does not need the model, so waiting for one before beginning
         the other would add the whole download to the time before anything
         appears. The permission prompt goes up immediately either way. */
      const modelReady = (async () => {
        if (vision === 'sanket') return createSanketVision()
        const fileset = await FilesetResolver.forVisionTasks(asset('wasm'))
        return HolisticLandmarker.createFromOptions(fileset, {
          /* CPU, matching landmark_utils.py and matching the Hand+Pose path
             in sanket-vision.ts — see VISION_DELEGATE. One engine, one set
             of numbers, whichever recogniser is running. */
          baseOptions: { modelAssetPath: asset('models/holistic_landmarker.task'), delegate: VISION_DELEGATE },
          runningMode: 'VIDEO',
          /* Only in framed mode: the mask is what framing.ts uses to cut the
             room away, and computing one nobody reads is wasted GPU. */
          outputPoseSegmentationMasks: FRAMING,
        })
      })()
      // An early failure here must not surface as an unhandled rejection.
      modelReady.catch(() => {})

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          /* 640×480 keeps the 4:3 the framing code assumes while giving the
             two landmarkers far less to chew on — the window fills sooner
             and the drawn field is unaffected at this scale. */
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
      } catch (err) {
        const name = (err as DOMException)?.name
        say(name === 'NotAllowedError' ? 'denied' : 'error', name)
        modelReady.then(l => l.close()).catch(() => {})
        return
      }
      if (disposed) { stream.getTracks().forEach(t => t.stop()); return }

      vid.srcObject = stream
      await vid.play().catch(() => {})

      say('loading')
      try {
        const ready = await modelReady
        if (vision === 'sanket') sanket = ready as SanketVision
        else landmarker = ready as HolisticLandmarker
      } catch (err) {
        say('error', String((err as Error)?.message ?? err))
        return
      }
      if (disposed) { landmarker?.close(); sanket?.close(); return }

      resize()
      window.addEventListener('resize', resize)
      /* The stage can change size WITHOUT the window changing: the output
         panel beside it grows, the caption scale changes, a scrollbar comes
         or goes. Re-measuring on window resize alone left the backing store
         stale, so CSS stretched the frame against the wrong buffer and the
         preview read as a jump. Observe the canvas itself. */
      ro = new ResizeObserver(() => resize())
      ro.observe(cvs)
      say('live')
      raf = requestAnimationFrame(tick)
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      ro?.disconnect()
      /* Every track stopped, so the browser's camera indicator goes out the
         moment this is switched off. Anything less would be the one thing a
         privacy claim cannot afford to get wrong. */
      stream?.getTracks().forEach(t => t.stop())
      vid.srcObject = null
      landmarker?.close()
      sanket?.close()
      say('off')
    }
  }, [active, vision])

  return (
    <div className={className}>
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      {/* Mounted only while asked for: the loop writes straight into it, so
          there is no React state moving at frame rate. */}
      {probe && <div ref={probeElRef} className="mp-probe" aria-hidden="true" />}
    </div>
  )
}
