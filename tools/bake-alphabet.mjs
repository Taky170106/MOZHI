/* Turns the extractor's landmark JSON into app/src/lib/alphabet.ts.
   Run: node tools/bake-alphabet.mjs

   Handshapes are authored, not solved. Driving the rig's bones from the
   recorded landmarks was tried at length and abandoned: a small head-on
   photograph does not carry the depth a bone solver needs, and the error
   lands in the axes a viewer reads as a wrong hand.

   So each shape is read off a reference drawing and written as the closest
   configuration the rig can hold, which is the same path the word signs
   already take. The recorded corpus still supplies hand placement and how
   far the source frames agreed with each other.                          */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IN = path.join(HERE, 'out/fingerspell-landmarks.json')
const OUT = path.join(HERE, '../app/src/lib/alphabet.ts')

const data = JSON.parse(fs.readFileSync(IN, 'utf8'))
const L = data.letters

/* Mirrors the table in retarget.ts. Curl runs 0 (straight) to 1 (closed),
   per finger, thumb first. */
const SHAPES = {
  flat:  [0.15, 0.02, 0.02, 0.02, 0.02],
  five:  [0.10, 0.00, 0.00, 0.00, 0.00],
  fist:  [0.75, 0.95, 0.95, 0.95, 0.95],
  point: [0.70, 0.00, 0.95, 0.95, 0.95],
  v:     [0.70, 0.00, 0.00, 0.95, 0.95],
  three: [0.10, 0.00, 0.00, 0.95, 0.95],
  o:     [0.55, 0.60, 0.62, 0.62, 0.60],
  c:     [0.35, 0.40, 0.42, 0.42, 0.40],
  pinch: [0.62, 0.66, 0.30, 0.25, 0.20],
  cup:   [0.30, 0.35, 0.35, 0.35, 0.35],
  bent:  [0.25, 0.55, 0.55, 0.55, 0.55],
  thumb: [0.00, 0.95, 0.95, 0.95, 0.95],
  hook:  [0.60, 0.80, 0.80, 0.35, 0.30],
  flatO: [0.50, 0.45, 0.45, 0.45, 0.45],
  l:     [0.00, 0.00, 0.95, 0.95, 0.95],
  y:     [0.00, 0.95, 0.95, 0.95, 0.00],
  w:     [0.75, 0.00, 0.00, 0.00, 0.95],
  relax: [0.20, 0.22, 0.25, 0.28, 0.30],
}

const CHEST_X = 0.065
const SPAN = 0.075
const SOLO_DX = 0.035

const r3 = n => Math.round(n * 1000) / 1000

/* A finger's curl, 0 to 1, from its three measured joint bends. FULL is the
   flexion of a finger closed right into the palm; the corpus never exceeds
   it, so the ratio lands in range without flattening the differences. */
const FULL = 3.6
const curlOf = joints =>
  Array.from({ length: 5 }, (_, f) => {
    const sum = joints.slice(f * 3, f * 3 + 3).reduce((a, b) => a + b, 0)
    return Math.max(0, Math.min(1, sum / FULL))
  })

/* Nearest handshape by weighted squared distance. The thumb counts for half:
   MediaPipe reads it least reliably, and weighting it evenly pulled open
   hands onto closed shapes. */
const W = [0.5, 1, 1, 1, 1]
const nearestShape = curl => {
  let best = 'relax'
  let bestD = Infinity
  for (const [name, ref] of Object.entries(SHAPES)) {
    let d = 0
    for (let i = 0; i < 5; i++) d += W[i] * (curl[i] - ref[i]) ** 2
    if (d < bestD) { bestD = d; best = name }
  }
  return { shape: best, distance: r3(Math.sqrt(bestD)) }
}

const palmOf = feat => (feat.palmNormal.z < 0 ? 'out' : 'in')

const confidenceOf = e => {
  const h = e.right ?? e.left
  if (!h) return 'none'
  if (e.kept < 60) return 'thin'
  if (h.mad > 0.20) return 'noisy'
  return 'measured'
}

/* Two hands are a measured distance apart and the frames are not mirrored, so
   the hand further left in shot is the signer's right — real evidence. One
   hand gives none: across the twenty-five one-handed classes the wrist x runs
   0.02 to 0.59 with no gap, a single cluster at frame centre. Those go on the
   right hand by convention, which is a decision, not a measurement. */
const byGeometry = e => {
  const a = e.right, b = e.left
  if (a && b) return a.wrist.x <= b.wrist.x ? { R: a, L: b } : { R: b, L: a }
  const only = a ?? b
  return only ? { R: only, L: null } : { R: null, L: null }
}

/* Digits authored by eye from the corpus photographs, which for the numbers
   are well lit, one-handed and unambiguous — unlike the letters, which are
   two-handed, very dark, and drawn from several different sessions.
   Reading them off the pictures:

     0  thumb and index meeting in a circle, other fingers curled
     1  index alone
     2  index and middle, spread
     3  thumb, index and middle
     4  four fingers up, thumb folded across the palm
     5  the open hand
     6  three up, little finger tucked to the thumb
     7  two up with the thumb held out
     8  index and middle, spread wide
     9  three fingers up

   These override the nearest-shape matcher, which had no counting shapes to
   reach for and was landing most of them on 'l'. */
const DIGIT_SHAPES = {
  '0': 'o', '1': 'point', '2': 'v', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'three', '8': 'v', '9': 'three',
}

/* Letters authored from the reference drawings supplied for this build,
   read one by one:

     A  closed fist, thumb alongside        N  two fingers folded over the thumb
     B  flat hand, thumb across the palm    O  fingers meeting the thumb
     C  the whole hand curved into a C      P  the K shape, turned to point down
     D  index up, the rest to the thumb     Q  the G shape, turned to point down
     E  fingers folded onto the thumb       R  index and middle crossed
     F  index to thumb, three fingers up    S  fist, thumb across the front
     G  index out flat, thumb parallel      T  thumb between index and middle
     H  index and middle out together       U  index and middle up, together
     I  little finger up                    V  index and middle up, apart
     J  the I shape, with a movement        W  index, middle and ring up
     K  index and middle up, thumb between  X  index hooked
     L  index up, thumb out square          Y  thumb and little finger out
     M  three fingers folded over thumb     Z  index up, tracing a Z

   This is a ONE-HANDED manual alphabet, which is the American convention.
   Indian Sign Language fingerspells with two hands. Supplied deliberately —
   see the note on the Letter type. */
const LETTER_SHAPES = {
  A: 'aFist',   B: 'bFlat',  C: 'c',      D: 'dPoint', E: 'eClaw',
  F: 'fCircle', G: 'gPoint', H: 'hTwo',   I: 'y',      J: 'y',
  K: 'kV',      L: 'l',      M: 'mThree', N: 'nTwo',   O: 'o',
  P: 'kV',      Q: 'gPoint', R: 'rCross', S: 'fist',   T: 'tThumb',
  U: 'uTwo',    V: 'v',      W: 'three',  X: 'hook',   Y: 'y',
  Z: 'point',
}

/* The palm faces the reader across the alphabet, except where a letter turns
   the hand over or lays it sideways. */
const LETTER_PALM = { P: 'down', Q: 'down', G: 'side', H: 'side' }

const entries = []
const report = []

for (const id of Object.keys(L).sort()) {
  const e = L[id]
  const conf = confidenceOf(e)
  if (conf === 'none') { console.warn(`skip ${id}`); continue }

  const side = byGeometry(e)
  const pose = (feat, dx, dy, side) => {
    if (!feat) return 'null'
    const matched = nearestShape(curlOf(feat.joints))
    const authored = DIGIT_SHAPES[id] ?? LETTER_SHAPES[id]
    const shape = authored ?? matched.shape
    report.push({ id, shape, distance: matched.distance, authored: !!authored })
    /* The handshape is always emitted. The solve rides alongside it, and the
       rig drops back to the shape if the solve turns out unusable. */
    const palm = LETTER_PALM[id] ?? (authored ? 'out' : palmOf(feat))
    return `p('${shape}', '${palm}', ${dx}, ${dy}`
      + ')'
  }

  let right = 'null'
  let left = 'null'

  /* Authored classes are one-handed whatever the corpus showed: the drawings
     they were read from use a single hand. */
  const authoredHere = !!(DIGIT_SHAPES[id] ?? LETTER_SHAPES[id])
  const hands = authoredHere ? 1 : e.hands

  if (hands === 2 && side.R && side.L && e.relative) {
    const dx = r3(Math.abs(e.relative.x) * SPAN / 2 - CHEST_X)
    const dy = r3(e.relative.y * SPAN / 2)
    right = pose(side.R, dx, dy, 'Right')
    left = pose(side.L, dx, r3(-dy), 'Left')
  } else {
    right = pose(side.R ?? side.L, SOLO_DX, 0, 'Right')
  }

  const h = e.right ?? e.left
  entries.push(`  G('${id}', ${hands}, ${right}, ${left}, '${conf}', ${e.kept}, ${r3(h.mad)}),`)
}

const src = `import type { HandPose, HandShape, Keyframe, Palm } from './pose'

/* ============================================================
   The fingerspelling alphabet.

   Every handshape here is authored: each was read off a reference drawing
   and written as the closest configuration the rig can hold. Solving the
   bones from the recorded corpus was tried at length and abandoned — the
   photographs carry no usable depth and the results were unrecognisable.

   IMPORTANT — these letters are a ONE-HANDED manual alphabet, which is the
   American convention. Indian Sign Language fingerspells with TWO hands, and
   the recorded corpus in tools/out shows exactly that. The one-handed set is
   here by an explicit product decision, not by mistake. Anything shown to a
   user should say which alphabet it is; the script field carries that.

   The digits are a separate case: those were read from the ISL corpus itself
   and are one-handed there too.

   Generated by tools/bake-alphabet.mjs — edit that, not this.
   ============================================================ */

export type Confidence = 'measured' | 'thin' | 'noisy'

export type Letter = {
  id: string
  letter: string
  en: string
  hands: 1 | 2
  durMs: number
  frames: Keyframe[]
  /** How far the source frames agreed with each other. */
  confidence: Confidence
  /** Frames the handshape was chosen from. */
  samples: number
  /** Median absolute deviation of the measured joint angles, in radians. */
  mad: number
  /** True only once a human has checked this letter against a reference. */
  verified: boolean
  /** Which manual alphabet this shape belongs to. */
  script: 'ASL' | 'ISL'
}

export const LETTER_MS = 420
export const LETTER_COART_MS = 90

const REST: HandPose = { loc: 'rest', shape: 'five', palm: 'in', rot: 8 }

/* Fingerspelling is held up beside the face, not down at the chest — that is
   where a signer puts it and it is also the only place the letters are
   legible, since every letter shares one hand position and the whole
   difference between them is in the fingers. At chest height on a full-body
   avatar that difference is a few pixels and every letter looks alike. */
const p = (
  shape: HandShape, palm: Palm, dx: number, dy: number,
  bones?: Record<string, [number, number, number]>,
): HandPose => ({ loc: 'shoulder', shape, palm, dx, dy, bones })

const G = (
  id: string, hands: 1 | 2, R: HandPose | null, L: HandPose | null,
  confidence: Confidence, samples: number, mad: number,
): Letter => ({
  id: \`FS-\${id}\`,
  letter: id,
  en: id,
  hands,
  durMs: LETTER_MS,
  confidence,
  samples,
  mad,
  verified: false,
  script: /[0-9]/.test(id) ? 'ISL' : 'ASL',
  frames: [
    { t: 0, R: REST, L: REST, brow: 0, mouth: 0 },
    { t: 0.5, R: R ?? REST, L: L ?? REST, brow: 0, mouth: 0 },
    { t: 1, R: R ?? REST, L: L ?? REST, brow: 0, mouth: 0 },
  ],
})

export const LETTERS: Letter[] = [
${entries.join('\n')}
]

export const LETTER_BY_ID: Record<string, Letter> =
  Object.fromEntries(LETTERS.map(l => [l.id, l]))

export const LETTER_BY_CHAR: Record<string, Letter> =
  Object.fromEntries(LETTERS.map(l => [l.letter, l]))

export const isLetterId = (id: string) => id.startsWith('FS-')

/** Letters and digits both: a counter spells names and room numbers alike. */
export const spellable = (word: string) => /[a-z0-9]/i.test(word)

export function fingerspell(word: string): string[] {
  return word
    .toUpperCase()
    .split('')
    .filter(ch => LETTER_BY_CHAR[ch])
    .map(ch => LETTER_BY_CHAR[ch].id)
}

export const ALPHABET = LETTERS.filter(l => /[A-Z]/.test(l.letter))
export const DIGITS = LETTERS.filter(l => /[0-9]/.test(l.letter))
export const VERIFIED_COUNT = LETTERS.filter(l => l.verified).length

/** True when any part of the alphabet is not the language the product claims. */
export const HAS_FOREIGN_SCRIPT = LETTERS.some(l => l.script !== 'ISL')
`

fs.writeFileSync(OUT, src)
const used = {}
for (const r of report) used[r.shape] = (used[r.shape] ?? 0) + 1
console.log(`wrote ${OUT}`)
console.log(`  ${entries.length} classes, ${report.length} hands`)
console.log(`  handshapes chosen: ${Object.entries(used).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k}:${n}`).join('  ')}`)
console.log(`  authored by eye: ${report.filter(r => r.authored).length}  ` +
  `matched by measurement: ${report.filter(r => !r.authored).length}`)
