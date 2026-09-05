import { buildTimeline, frameAtTime, holdMsFor, HOLD_MIN_MS, HOLD_MAX_MS, COART_MS } from '../src/lib/player'
import { SIGNS, SIGN_BY_ID } from '../src/lib/lexicon'

let fail = 0
const ok = (c: boolean, m: string) => { if (!c) { console.log('  FAIL ' + m); fail++ } }

/* 1. every one of the 60 signs gets a hold inside the brief's window */
for (const s of SIGNS) {
  const h = holdMsFor(s)
  ok(h >= HOLD_MIN_MS && h <= HOLD_MAX_MS, `${s.id} hold ${h}ms outside ${HOLD_MIN_MS}–${HOLD_MAX_MS}`)
}
console.log(`60 signs · hold range ${Math.min(...SIGNS.map(holdMsFor))}–${Math.max(...SIGNS.map(holdMsFor))}ms`)

/* 2. the pose must actually stop moving during the hold */
const tl = buildTimeline(['DOCTOR', 'SEE', 'NEED'])
const seg = tl.segments[0]
const mid = (seg.stroke + seg.end) / 2
const a = frameAtTime(tl, seg.stroke + 1)
const b = frameAtTime(tl, mid)
const c = frameAtTime(tl, seg.end - 1)
const moved = (p: typeof a, q: typeof a) =>
  Math.abs(p.frame.R.pos.x - q.frame.R.pos.x) + Math.abs(p.frame.R.pos.y - q.frame.R.pos.y) +
  Math.abs(p.frame.brow - q.frame.brow) + Math.abs(p.frame.nod - q.frame.nod)
ok(a.holding && b.holding && c.holding, 'hold window not flagged as holding')
ok(moved(a, b) < 1e-9 && moved(b, c) < 1e-9, `pose drifted during hold by ${moved(a, c)}`)
console.log(`hold window is motionless · drift ${moved(a, c).toFixed(12)}`)

/* 3. the pose MUST still move during the stroke — a hold everywhere is not a fix */
const s0 = frameAtTime(tl, seg.start + 5)
const s1 = frameAtTime(tl, seg.stroke - 5)
ok(moved(s0, s1) > 0.01, 'stroke is not moving — the sign never articulates')
console.log(`stroke travels ${moved(s0, s1).toFixed(4)} units`)

/* 4. co-articulation still sits in the 150–250ms window between signs */
const gap = tl.segments[1].start - tl.segments[0].end
ok(Math.abs(gap - COART_MS) < 1e-6, `co-articulation gap ${gap}ms, expected ${COART_MS}`)
ok(COART_MS >= 150 && COART_MS <= 250, 'co-articulation outside 150–250ms')
console.log(`co-articulation gap ${gap}ms`)

/* 5. slow mode lengthens the hold rather than only the stroke */
const slow = buildTimeline(['DOCTOR'], 0.5)
const fast = buildTimeline(['DOCTOR'], 1)
const hSlow = slow.segments[0].end - slow.segments[0].stroke
const hFast = fast.segments[0].end - fast.segments[0].stroke
ok(Math.abs(hSlow - hFast * 2) < 1e-6, `slow hold ${hSlow} != 2× ${hFast}`)
console.log(`slow mode · hold ${hFast}ms → ${hSlow}ms`)

/* 6. structure order holds for every segment */
for (const s of tl.segments) ok(s.start < s.stroke && s.stroke < s.end, `${s.id} segment order broken`)

/* 7. the gloss engine still refuses to substitute */
import('../src/lib/glossing').then(({ englishToGloss }) => {
  const r = englishToGloss('please take paracetamol tomorrow morning')
  ok(r.oov.includes('paracetamol'), 'OOV word not surfaced')
  ok(!r.glosses.some(g => !SIGN_BY_ID[g]), 'emitted a gloss outside the vocabulary')
  const t = englishToGloss('where is the doctor room today?')
  ok(t.glosses[t.glosses.length - 1] === 'WHERE', `wh-sign not final: ${t.glosses.join(' ')}`)
  ok(t.glosses[0] === 'TODAY', `time not fronted: ${t.glosses.join(' ')}`)
  console.log(`ISL order · ${t.glosses.join(' · ')}`)
  console.log(fail ? `\n${fail} FAILED` : '\nall timing + linguistics checks passed')
  if (fail) process.exit(1)
})
