import type { HandPose, HandShape, Keyframe, Loc, Palm } from './pose'
import { COMMON } from './common'
export type Domain = 'core' | 'question' | 'time' | 'health' | 'counter' | 'travel' | 'action'
export type Sign = {
  id: string
  en: string
  hi: string
  domain: Domain
  hands: 1 | 2
  handshape: string
  location: string
  movement: string
  nmm?: string

  acc?: number

  verified?: boolean

  near?: string[]
  durMs: number
  frames: Keyframe[]
}

const h = (loc: Loc, shape: HandShape, palm: Palm = 'in', rot = 0, dx = 0, dy = 0): HandPose =>
  ({ loc, shape, palm, rot, dx, dy })

const REST = h('rest', 'five', 'in', 8)
export const DOMAINS: { id: Domain; label: string; note: string }[] = [
  { id: 'core',     label: 'Core',      note: 'Greetings, pronouns, politeness, comprehension' },
  { id: 'question', label: 'Question',  note: 'Wh-signs — always sentence-final in ISL' },
  { id: 'time',     label: 'Time',      note: 'Temporal reference, set before the clause' },
  { id: 'health',   label: 'Health',    note: 'District hospital reception vocabulary' },
  { id: 'counter',  label: 'Counter',   note: 'Forms, payment, and desk transactions' },
  { id: 'travel',   label: 'Travel',    note: 'Railway enquiry and PRS counters' },
  { id: 'action',   label: 'Action',    note: 'Verbs and modifiers that carry the predicate' },
]

export const SIGNS: Sign[] = [
  {
    id: 'HELLO', en: 'hello', hi: 'नमस्ते', domain: 'core', hands: 1,
    handshape: 'Flat B, palm out', location: 'Forehead → neutral space',
    movement: 'Salute outward from the brow, arcing away', nmm: 'Brows raised, slight nod',
    acc: 0.99, durMs: 880,
    frames: [
      { t: 0, R: h('brow', 'flat', 'out', -12), L: REST, brow: .3, mouth: .2, nod: 0 },
      { t: .45, R: h('brow', 'flat', 'out', -4, .03, -.01), L: REST, brow: .5, mouth: .3 },
      { t: 1, R: h('sideHigh', 'flat', 'out', 14, -.03, .04), L: REST, brow: .3, mouth: .2, nod: .3 },
    ],
  },
  {
    id: 'THANK-YOU', en: 'thank you', hi: 'धन्यवाद', domain: 'core', hands: 2,
    handshape: 'Both flat B, palms together', location: 'Chest',
    movement: 'Palms join at the chest, then a small bow', nmm: 'Head lowers, mouth closed',
    acc: 0.98, durMs: 1000,
    frames: [
      { t: 0, R: h('chest', 'flat', 'side', -8, .06), L: h('chest', 'flat', 'side', -8, .06), nod: 0 },
      { t: .5, R: h('neck', 'flat', 'side', -6, .01), L: h('neck', 'flat', 'side', -6, .01), nod: .35 },
      { t: 1, R: h('chest', 'flat', 'side', -6, .01), L: h('chest', 'flat', 'side', -6, .01), nod: .5, brow: .1 },
    ],
  },
  {
    id: 'PLEASE', en: 'please', hi: 'कृपया', domain: 'core', hands: 1,
    handshape: 'Flat B, palm in', location: 'Chest',
    movement: 'Flat palm circles once on the chest', nmm: 'Brows slightly raised, lips pressed',
    acc: 0.96, near: ['SORRY'], durMs: 960,
    frames: [
      { t: 0, R: h('chest', 'flat', 'in', 0, .01, -.02), L: REST, brow: .25 },
      { t: .35, R: h('chest', 'flat', 'in', 0, .05, .01), L: REST, brow: .3 },
      { t: .7, R: h('chest', 'flat', 'in', 0, -.01, .03), L: REST, brow: .3 },
      { t: 1, R: h('chest', 'flat', 'in', 0, .01, -.02), L: REST, brow: .25, mouth: -.2 },
    ],
  },
  {
    id: 'SORRY', en: 'sorry', hi: 'माफ़ करें', domain: 'core', hands: 1,
    handshape: 'Fist A, thumb in', location: 'Chest',
    movement: 'Closed fist rubs a circle over the heart', nmm: 'Brows drawn in, head tilted',
    acc: 0.95, near: ['PLEASE'], durMs: 1020,
    frames: [
      { t: 0, R: h('chest', 'fist', 'in', 0, .02, -.02), L: REST, brow: -.3, head: -.2 },
      { t: .35, R: h('chest', 'fist', 'in', 0, .06, .02), L: REST, brow: -.35, head: -.25 },
      { t: .7, R: h('chest', 'fist', 'in', 0, .0, .04), L: REST, brow: -.35, head: -.2 },
      { t: 1, R: h('chest', 'fist', 'in', 0, .02, -.02), L: REST, brow: -.3, head: -.15, mouth: -.3 },
    ],
  },
  {
    id: 'YES', en: 'yes', hi: 'हाँ', domain: 'core', hands: 1,
    handshape: 'Fist A', location: 'Neutral space',
    movement: 'Fist nods at the wrist, twice', nmm: 'Head nods with the hand — the nod is obligatory',
    acc: 0.99, durMs: 720,
    frames: [
      { t: 0, R: h('neutral', 'fist', 'out', -18, -.02, -.04), L: REST, nod: -.1 },
      { t: .3, R: h('neutral', 'fist', 'out', 16, -.02, -.02), L: REST, nod: .4, mouth: .1 },
      { t: .62, R: h('neutral', 'fist', 'out', -14, -.02, -.04), L: REST, nod: -.05 },
      { t: 1, R: h('neutral', 'fist', 'out', 14, -.02, -.02), L: REST, nod: .4 },
    ],
  },
  {
    id: 'NO', en: 'no', hi: 'नहीं', domain: 'core', hands: 1,
    handshape: 'Index + middle close to thumb', location: 'Neutral space, shoulder height',
    movement: 'Fingers snap shut against the thumb once', nmm: 'Headshake — obligatory negation marker',
    acc: 0.98, durMs: 760,
    frames: [
      { t: 0, R: h('chestHigh', 'v', 'out', -6, .04, -.03), L: REST, head: .25, brow: -.2 },
      { t: .45, R: h('chestHigh', 'flatO', 'out', 0, .04, -.03), L: REST, head: -.3, brow: -.25, mouth: -.4 },
      { t: 1, R: h('chestHigh', 'flatO', 'out', 4, .04, -.03), L: REST, head: .2, brow: -.2, mouth: -.4 },
    ],
  },
  {
    id: 'NAME', en: 'name', hi: 'नाम', domain: 'core', hands: 2,
    handshape: 'Both index + middle (V), stacked', location: 'Neutral space',
    movement: 'Dominant fingers tap twice across the base hand',
    acc: 0.94, durMs: 820,
    frames: [
      { t: 0, R: h('neutral', 'v', 'down', -70, -.02, -.06), L: h('neutral', 'v', 'down', 70, .02, -.02) },
      { t: .35, R: h('neutral', 'v', 'down', -70, -.02, -.028), L: h('neutral', 'v', 'down', 70, .02, -.02) },
      { t: .7, R: h('neutral', 'v', 'down', -70, -.02, -.06), L: h('neutral', 'v', 'down', 70, .02, -.02) },
      { t: 1, R: h('neutral', 'v', 'down', -70, -.02, -.03), L: h('neutral', 'v', 'down', 70, .02, -.02) },
    ],
  },
  {
    id: 'YOU', en: 'you', hi: 'आप', domain: 'core', hands: 1,
    handshape: 'Index point', location: 'Toward the addressee',
    movement: 'Single directed point forward', nmm: 'Eye gaze locks to the addressee',
    acc: 0.99, near: ['MY'], durMs: 560,
    frames: [
      { t: 0, R: h('chest', 'point', 'out', -22, .02, -.02), L: REST },
      { t: 1, R: h('far', 'point', 'out', -34, .02, -.09), L: REST, brow: .15 },
    ],
  },
  {
    id: 'MY', en: 'my', hi: 'मेरा', domain: 'core', hands: 1,
    handshape: 'Flat B, palm in', location: 'Chest',
    movement: 'Flat palm presses to the signer’s own chest',
    acc: 0.97, near: ['YOU'], durMs: 620,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'in', -30, -.03, -.03), L: REST },
      { t: 1, R: h('chest', 'flat', 'in', -46, -.05, -.01), L: REST, nod: .15 },
    ],
  },
  {
    id: 'HELP', en: 'help', hi: 'मदद', domain: 'core', hands: 2,
    handshape: 'Fist A resting on flat B palm', location: 'Neutral space',
    movement: 'Base palm lifts the dominant fist upward', nmm: 'Brows raised — request marker',
    acc: 0.96, durMs: 900,
    frames: [
      { t: 0, R: h('neutral', 'thumb', 'side', 0, -.03, .04), L: h('neutral', 'flat', 'up', 84, .03, .05), brow: .3 },
      { t: 1, R: h('chestHigh', 'thumb', 'side', 0, -.01, .0), L: h('chestHigh', 'flat', 'up', 84, .05, .01), brow: .45, mouth: .2 },
    ],
  },
  {
    id: 'UNDERSTAND', en: 'understand', hi: 'समझ गया', domain: 'core', hands: 1,
    handshape: 'Hook X opening to index point', location: 'Temple',
    movement: 'Hooked index flicks open at the temple', nmm: 'Single sharp nod',
    acc: 0.93, near: ['NOT-UNDERSTAND'], durMs: 720,
    frames: [
      { t: 0, R: h('temple', 'hook', 'out', -6), L: REST, brow: 0 },
      { t: 1, R: h('temple', 'point', 'out', -6, .01, -.02), L: REST, brow: .4, nod: .35, mouth: .2 },
    ],
  },
  {
    id: 'NOT-UNDERSTAND', en: 'I don’t understand', hi: 'समझ नहीं आया', domain: 'core', hands: 1,
    handshape: 'Index point at the temple', location: 'Temple',
    movement: 'Point at the temple, then twist away with a headshake',
    nmm: 'Brows furrowed and headshake — negation is carried on the face',
    acc: 0.91, near: ['UNDERSTAND'], durMs: 1040,
    frames: [
      { t: 0, R: h('temple', 'point', 'out', -6), L: REST, brow: -.3, head: 0 },
      { t: .5, R: h('temple', 'point', 'side', 26, .03, .01), L: REST, brow: -.5, head: -.3, mouth: -.4 },
      { t: 1, R: h('sideHigh', 'five', 'up', 30, -.03, .06), L: REST, brow: -.5, head: .3, mouth: -.4 },
    ],
  },

  {
    id: 'WHAT', en: 'what', hi: 'क्या', domain: 'question', hands: 2,
    handshape: 'Both open 5, palms up', location: 'Neutral space',
    movement: 'Both palms turn up and shake slightly outward',
    nmm: 'Brows furrowed, head forward — wh-question marker',
    acc: 0.97, near: ['WHERE'], durMs: 880,
    frames: [
      { t: 0, R: h('neutral', 'five', 'up', 52, .0, .0), L: h('neutral', 'five', 'up', -52, .0, .0), brow: -.4, nod: .2 },
      { t: .45, R: h('neutral', 'five', 'up', 62, .04, .01), L: h('neutral', 'five', 'up', -62, -.04, .01), brow: -.5, nod: .3, mouth: .3 },
      { t: 1, R: h('neutral', 'five', 'up', 54, .0, .0), L: h('neutral', 'five', 'up', -54, .0, .0), brow: -.5, nod: .25, mouth: .3 },
    ],
  },
  {
    id: 'WHERE', en: 'where', hi: 'कहाँ', domain: 'question', hands: 1,
    handshape: 'Index point', location: 'Neutral space, shoulder height',
    movement: 'Upright index oscillates side to side',
    nmm: 'Brows furrowed, slight head tilt', acc: 0.96, near: ['WHAT'], durMs: 860,
    frames: [
      { t: 0, R: h('chestHigh', 'point', 'out', -14, .03, -.02), L: REST, brow: -.45, head: .15 },
      { t: .33, R: h('chestHigh', 'point', 'out', 16, .07, -.02), L: REST, brow: -.5, head: .15 },
      { t: .66, R: h('chestHigh', 'point', 'out', -16, .0, -.02), L: REST, brow: -.5, head: .15 },
      { t: 1, R: h('chestHigh', 'point', 'out', 12, .05, -.02), L: REST, brow: -.5, head: .15, mouth: .2 },
    ],
  },
  {
    id: 'WHEN', en: 'when', hi: 'कब', domain: 'question', hands: 2,
    handshape: 'Both index points', location: 'Neutral space',
    movement: 'Dominant index circles once around the base index',
    nmm: 'Brows furrowed', acc: 0.93, durMs: 940,
    frames: [
      { t: 0, R: h('neutral', 'point', 'out', -20, .04, -.05), L: h('neutral', 'point', 'up', 0, .0, -.02), brow: -.4 },
      { t: .35, R: h('neutral', 'point', 'out', -20, .07, -.0), L: h('neutral', 'point', 'up', 0, .0, -.02), brow: -.45 },
      { t: .7, R: h('neutral', 'point', 'out', -20, .01, .02), L: h('neutral', 'point', 'up', 0, .0, -.02), brow: -.45 },
      { t: 1, R: h('neutral', 'point', 'out', -20, .02, -.05), L: h('neutral', 'point', 'up', 0, .0, -.02), brow: -.45, mouth: .2 },
    ],
  },
  {
    id: 'HOW-MANY', en: 'how many', hi: 'कितने', domain: 'question', hands: 2,
    handshape: 'Both closed → open 5', location: 'Neutral space',
    movement: 'Both fists spring open, fingers spreading',
    nmm: 'Brows furrowed, chin forward', acc: 0.92, durMs: 800,
    frames: [
      { t: 0, R: h('neutral', 'fist', 'up', 42, -.01, .02), L: h('neutral', 'fist', 'up', -42, .01, .02), brow: -.4 },
      { t: 1, R: h('neutral', 'five', 'up', 56, .05, -.02), L: h('neutral', 'five', 'up', -56, -.05, -.02), brow: -.5, nod: .25, mouth: .3 },
    ],
  },
  {
    id: 'WHY', en: 'why', hi: 'क्यों', domain: 'question', hands: 1,
    handshape: 'Flat B → Y', location: 'Forehead',
    movement: 'Touch the forehead, then drop to a Y handshape',
    nmm: 'Brows furrowed throughout', acc: 0.91, durMs: 900,
    frames: [
      { t: 0, R: h('forehead', 'flat', 'in', -8), L: REST, brow: -.4 },
      { t: .5, R: h('cheek', 'flat', 'in', 6, .02, .03), L: REST, brow: -.5 },
      { t: 1, R: h('chestHigh', 'y', 'out', 10, .04, -.02), L: REST, brow: -.5, nod: .2, mouth: .25 },
    ],
  },

  {
    id: 'TODAY', en: 'today', hi: 'आज', domain: 'time', hands: 2,
    handshape: 'Both flat B, palms down', location: 'Neutral space',
    movement: 'Both palms press down once in front of the body',
    acc: 0.95, near: ['NOW'], durMs: 720,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'down', 78, .02, -.05), L: h('neutral', 'flat', 'down', -78, -.02, -.05) },
      { t: 1, R: h('neutral', 'flat', 'down', 82, .02, .02), L: h('neutral', 'flat', 'down', -82, -.02, .02), nod: .2 },
    ],
  },
  {
    id: 'NOW', en: 'now', hi: 'अभी', domain: 'time', hands: 2,
    handshape: 'Both bent B, palms up', location: 'Neutral space, low',
    movement: 'Both hands drop sharply once',
    acc: 0.93, near: ['TODAY'], durMs: 620,
    frames: [
      { t: 0, R: h('neutral', 'bent', 'up', 62, .02, -.06), L: h('neutral', 'bent', 'up', -62, -.02, -.06), brow: .2 },
      { t: 1, R: h('neutral', 'bent', 'up', 66, .02, .03), L: h('neutral', 'bent', 'up', -66, -.02, .03), brow: .1, nod: .25 },
    ],
  },
  {
    id: 'TOMORROW', en: 'tomorrow', hi: 'कल', domain: 'time', hands: 1,
    handshape: 'Thumb A', location: 'Cheek → forward',
    movement: 'Thumb arcs forward from the cheek — the future is ahead',
    acc: 0.94, near: ['YESTERDAY'], durMs: 780,
    frames: [
      { t: 0, R: h('cheek', 'thumb', 'side', -10), L: REST },
      { t: 1, R: h('far', 'thumb', 'side', 24, .04, -.13), L: REST, nod: .15 },
    ],
  },
  {
    id: 'YESTERDAY', en: 'yesterday', hi: 'कल (बीता)', domain: 'time', hands: 1,
    handshape: 'Thumb A', location: 'Cheek → back over the shoulder',
    movement: 'Thumb flicks back past the ear — the past is behind',
    acc: 0.93, near: ['TOMORROW'], durMs: 780,
    frames: [
      { t: 0, R: h('cheek', 'thumb', 'side', -6), L: REST },
      { t: 1, R: h('ear', 'thumb', 'side', -34, .05, -.03), L: REST, head: .2 },
    ],
  },
  {
    id: 'MORNING', en: 'morning', hi: 'सुबह', domain: 'time', hands: 2,
    handshape: 'Flat B rising over a flat forearm', location: 'Neutral space',
    movement: 'Dominant hand rises like the sun over the base arm',
    acc: 0.96, durMs: 940,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'in', -74, -.06, .06), L: h('neutral', 'flat', 'down', -84, -.02, .02) },
      { t: 1, R: h('chestHigh', 'flat', 'in', -20, -.02, -.02), L: h('neutral', 'flat', 'down', -84, -.02, .02), brow: .25, mouth: .2 },
    ],
  },
  {
    id: 'TIME', en: 'time', hi: 'समय', domain: 'time', hands: 2,
    handshape: 'Index point onto flat wrist', location: 'Base wrist',
    movement: 'Dominant index taps the base wrist twice',
    acc: 0.97, durMs: 760,
    frames: [
      { t: 0, R: h('neutral', 'point', 'down', -60, -.02, -.04), L: h('neutral', 'flat', 'down', -80, .0, .0) },
      { t: .35, R: h('neutral', 'point', 'down', -60, -.02, -.008), L: h('neutral', 'flat', 'down', -80, .0, .0) },
      { t: .7, R: h('neutral', 'point', 'down', -60, -.02, -.04), L: h('neutral', 'flat', 'down', -80, .0, .0) },
      { t: 1, R: h('neutral', 'point', 'down', -60, -.02, -.01), L: h('neutral', 'flat', 'down', -80, .0, .0) },
    ],
  },
  {
    id: 'WAIT', en: 'wait', hi: 'रुकिए', domain: 'time', hands: 2,
    handshape: 'Both open 5, palms up', location: 'Neutral space',
    movement: 'Fingers flutter while the hands hold still',
    nmm: 'Brows raised, lips rounded — softens the instruction',
    acc: 0.95, durMs: 1080,
    frames: [
      { t: 0, R: h('neutral', 'five', 'up', 44, .02, -.02), L: h('neutral', 'cup', 'up', -46, -.03, .01), brow: .3, mouth: .3 },
      { t: .33, R: h('neutral', 'cup', 'up', 50, .02, -.03), L: h('neutral', 'five', 'up', -42, -.03, .0), brow: .35, mouth: .35 },
      { t: .66, R: h('neutral', 'five', 'up', 44, .02, -.02), L: h('neutral', 'cup', 'up', -46, -.03, .01), brow: .35, mouth: .35 },
      { t: 1, R: h('neutral', 'cup', 'up', 48, .02, -.03), L: h('neutral', 'five', 'up', -44, -.03, .0), brow: .3, mouth: .3 },
    ],
  },

  {
    id: 'DOCTOR', en: 'doctor', hi: 'डॉक्टर', domain: 'health', hands: 2,
    handshape: 'Index + middle (V) onto the base wrist', location: 'Base wrist — taking a pulse',
    movement: 'Dominant fingertips press the base wrist twice',
    acc: 0.98, near: ['TIME'], durMs: 860,
    frames: [
      { t: 0, R: h('neutral', 'v', 'down', -62, -.02, -.05), L: h('neutral', 'flat', 'up', -78, .0, .01) },
      { t: .35, R: h('neutral', 'v', 'down', -62, -.02, -.012), L: h('neutral', 'flat', 'up', -78, .0, .01), brow: .1 },
      { t: .7, R: h('neutral', 'v', 'down', -62, -.02, -.05), L: h('neutral', 'flat', 'up', -78, .0, .01) },
      { t: 1, R: h('neutral', 'v', 'down', -62, -.02, -.014), L: h('neutral', 'flat', 'up', -78, .0, .01), brow: .1 },
    ],
  },
  {
    id: 'HOSPITAL', en: 'hospital', hi: 'अस्पताल', domain: 'health', hands: 1,
    handshape: 'Index + middle (V)', location: 'Upper arm',
    movement: 'Fingertips trace a cross on the opposite upper arm',
    acc: 0.96, durMs: 940,
    frames: [
      { t: 0, R: h('across', 'v', 'in', -40, -.02, -.06), L: REST },
      { t: .45, R: h('across', 'v', 'in', -40, -.02, .03), L: REST },
      { t: .55, R: h('across', 'v', 'in', -40, -.07, -.01), L: REST },
      { t: 1, R: h('across', 'v', 'in', -40, .03, -.01), L: REST },
    ],
  },
  {
    id: 'MEDICINE', en: 'medicine', hi: 'दवा', domain: 'health', hands: 2,
    handshape: 'Middle finger onto an open palm', location: 'Base palm',
    movement: 'Dominant fingertip grinds a small circle on the base palm',
    acc: 0.94, durMs: 980,
    frames: [
      { t: 0, R: h('neutral', 'pinch', 'down', -56, -.02, -.04), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: .33, R: h('neutral', 'pinch', 'down', -56, .01, -.02), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: .66, R: h('neutral', 'pinch', 'down', -56, -.04, -.01), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: 1, R: h('neutral', 'pinch', 'down', -56, -.02, -.04), L: h('neutral', 'flat', 'up', -80, .0, .01) },
    ],
  },
  {
    id: 'PAIN', en: 'pain', hi: 'दर्द', domain: 'health', hands: 2,
    handshape: 'Both index points, facing each other', location: 'At the painful site',
    movement: 'Index tips jab toward each other twice',
    nmm: 'Brows furrowed, teeth clenched — intensity is on the face',
    acc: 0.95, durMs: 900,
    frames: [
      { t: 0, R: h('neutral', 'point', 'in', -100, -.03, -.03), L: h('neutral', 'point', 'in', 100, -.03, -.03), brow: -.5, mouth: -.5 },
      { t: .4, R: h('neutral', 'point', 'in', -100, -.062, -.03), L: h('neutral', 'point', 'in', 100, -.062, -.03), brow: -.6, mouth: -.6 },
      { t: .7, R: h('neutral', 'point', 'in', -100, -.03, -.03), L: h('neutral', 'point', 'in', 100, -.03, -.03), brow: -.55, mouth: -.5 },
      { t: 1, R: h('neutral', 'point', 'in', -100, -.058, -.03), L: h('neutral', 'point', 'in', 100, -.058, -.03), brow: -.6, mouth: -.6 },
    ],
  },
  {
    id: 'FEVER', en: 'fever', hi: 'बुखार', domain: 'health', hands: 1,
    handshape: 'Back of flat B', location: 'Forehead',
    movement: 'Back of the hand rests on the forehead, then falls',
    nmm: 'Eyes narrowed, head heavy', acc: 0.93, durMs: 940,
    frames: [
      { t: 0, R: h('brow', 'flat', 'in', -8, .0, .02), L: REST, brow: -.3, mouth: -.3 },
      { t: .45, R: h('forehead', 'flat', 'in', -6, .0, -.005), L: REST, brow: -.4, mouth: -.35, nod: .2 },
      { t: 1, R: h('neutral', 'flat', 'in', 8, .02, -.02), L: REST, brow: -.35, mouth: -.35, nod: .25 },
    ],
  },
  {
    id: 'HEAD', en: 'head', hi: 'सिर', domain: 'health', hands: 1,
    handshape: 'Bent B', location: 'Side of the head',
    movement: 'Fingertips touch the temple, then the jaw',
    acc: 0.97, durMs: 780,
    frames: [
      { t: 0, R: h('temple', 'bent', 'in', -14), L: REST },
      { t: 1, R: h('cheek', 'bent', 'in', -4, .0, .04), L: REST, nod: .1 },
    ],
  },
  {
    id: 'STOMACH', en: 'stomach', hi: 'पेट', domain: 'health', hands: 1,
    handshape: 'Bent B, palm in', location: 'Abdomen',
    movement: 'Flat hand circles the abdomen',
    acc: 0.96, durMs: 900,
    frames: [
      { t: 0, R: h('abdomen', 'bent', 'in', -6, -.03, -.02), L: REST },
      { t: .35, R: h('abdomen', 'bent', 'in', -6, .02, .01), L: REST },
      { t: .7, R: h('abdomen', 'bent', 'in', -6, -.03, .03), L: REST },
      { t: 1, R: h('abdomen', 'bent', 'in', -6, -.03, -.02), L: REST },
    ],
  },
  {
    id: 'BLOOD', en: 'blood', hi: 'ख़ून', domain: 'health', hands: 2,
    handshape: 'Open 5 trickling from a closed hand', location: 'Mouth → down',
    movement: 'Fingers wiggle downward from the lips',
    acc: 0.92, durMs: 980,
    frames: [
      { t: 0, R: h('mouth', 'point', 'in', -8, .0, .0), L: REST },
      { t: .4, R: h('chestHigh', 'five', 'in', -4, .02, -.02), L: REST, mouth: -.2 },
      { t: 1, R: h('chest', 'cup', 'in', 6, .03, .04), L: REST, mouth: -.25 },
    ],
  },
  {
    id: 'TEST', en: 'test', hi: 'जाँच', domain: 'health', hands: 2,
    handshape: 'Both index points drawing question marks', location: 'Neutral space',
    movement: 'Both index fingers hook downward together',
    acc: 0.9, near: ['REPORT'], durMs: 900,
    frames: [
      { t: 0, R: h('chestHigh', 'point', 'out', -12, .03, -.02), L: h('chestHigh', 'point', 'out', 12, -.03, -.02), brow: -.2 },
      { t: .5, R: h('neutral', 'hook', 'out', 6, .05, -.02), L: h('neutral', 'hook', 'out', -6, -.05, -.02), brow: -.2 },
      { t: 1, R: h('neutral', 'point', 'out', -8, .03, .02), L: h('neutral', 'point', 'out', 8, -.03, .02), brow: -.15 },
    ],
  },
  {
    id: 'REPORT', en: 'report', hi: 'रिपोर्ट', domain: 'health', hands: 2,
    handshape: 'Flat B sliding off a flat B palm', location: 'Neutral space',
    movement: 'Dominant palm slides forward off the base palm and lifts',
    acc: 0.91, near: ['TEST', 'FORM'], durMs: 900,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'down', -76, -.05, -.02), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: .55, R: h('neutral', 'flat', 'down', -76, .05, -.03), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: 1, R: h('chestHigh', 'flat', 'out', -20, .06, -.02), L: h('neutral', 'flat', 'up', -80, .0, .01), brow: .2 },
    ],
  },
  {
    id: 'APPOINTMENT', en: 'appointment', hi: 'अपॉइंटमेंट', domain: 'health', hands: 2,
    handshape: 'Fist A circling above a fist A', location: 'Neutral space',
    movement: 'Dominant fist circles once, then lands on the base fist',
    acc: 0.9, durMs: 1020,
    frames: [
      { t: 0, R: h('chestHigh', 'fist', 'down', -30, .0, -.02), L: h('neutral', 'fist', 'down', -60, .0, .0) },
      { t: .4, R: h('chestHigh', 'fist', 'down', -30, .06, .0), L: h('neutral', 'fist', 'down', -60, .0, .0) },
      { t: .75, R: h('neutral', 'fist', 'down', -40, .02, -.05), L: h('neutral', 'fist', 'down', -60, .0, .0) },
      { t: 1, R: h('neutral', 'fist', 'down', -46, .0, -.02), L: h('neutral', 'fist', 'down', -60, .0, .0), nod: .2 },
    ],
  },
  {
    id: 'EMERGENCY', en: 'emergency', hi: 'आपातकाल', domain: 'health', hands: 1,
    handshape: 'Fist A, thumb up', location: 'Shoulder height',
    movement: 'Raised fist shakes rapidly',
    nmm: 'Eyes wide, mouth open — urgency is marked on the face',
    acc: 0.94, durMs: 860,
    frames: [
      { t: 0, R: h('sideHigh', 'thumb', 'out', -14, -.02, -.02), L: REST, brow: .5, mouth: .6 },
      { t: .3, R: h('sideHigh', 'thumb', 'out', 16, -.02, -.05), L: REST, brow: .55, mouth: .6 },
      { t: .6, R: h('sideHigh', 'thumb', 'out', -16, -.02, -.02), L: REST, brow: .55, mouth: .6 },
      { t: 1, R: h('sideHigh', 'thumb', 'out', 14, -.02, -.05), L: REST, brow: .55, mouth: .6 },
    ],
  },
  {
    id: 'INJECTION', en: 'injection', hi: 'इंजेक्शन', domain: 'health', hands: 1,
    handshape: 'Index + middle (V), thumb pressing', location: 'Opposite upper arm',
    movement: 'Fingers press the arm, thumb depresses like a plunger',
    acc: 0.95, durMs: 860,
    frames: [
      { t: 0, R: h('across', 'v', 'in', -50, -.03, -.04), L: REST },
      { t: .5, R: h('across', 'v', 'in', -50, -.01, -.01), L: REST, brow: -.25, mouth: -.3 },
      { t: 1, R: h('across', 'pinch', 'in', -50, -.01, -.01), L: REST, brow: -.3, mouth: -.35 },
    ],
  },
  {
    id: 'SICK', en: 'sick', hi: 'बीमार', domain: 'health', hands: 2,
    handshape: 'Middle fingers to forehead and stomach', location: 'Forehead + abdomen',
    movement: 'Both middle fingertips touch, then twist slightly',
    nmm: 'Brows drawn, mouth downturned', acc: 0.93, durMs: 900,
    frames: [
      { t: 0, R: h('forehead', 'pinch', 'in', -8, .0, .01), L: h('abdomen', 'pinch', 'in', 8, .0, -.01), brow: -.4, mouth: -.4 },
      { t: 1, R: h('forehead', 'pinch', 'in', 6, .0, -.005), L: h('abdomen', 'pinch', 'in', -6, .0, .01), brow: -.45, mouth: -.45, head: -.2 },
    ],
  },

  {
    id: 'FORM', en: 'form', hi: 'फ़ॉर्म', domain: 'counter', hands: 2,
    handshape: 'Both flat B outlining a rectangle', location: 'Neutral space',
    movement: 'Hands trace the edges of a sheet of paper',
    acc: 0.94, near: ['REPORT'], durMs: 940,
    frames: [
      { t: 0, R: h('chestHigh', 'flat', 'out', -8, -.01, -.02), L: h('chestHigh', 'flat', 'out', 8, .01, -.02) },
      { t: .5, R: h('chestHigh', 'flat', 'out', -8, .06, -.02), L: h('chestHigh', 'flat', 'out', 8, -.06, -.02) },
      { t: 1, R: h('neutral', 'flat', 'out', -8, .06, .03), L: h('neutral', 'flat', 'out', 8, -.06, .03) },
    ],
  },
  {
    id: 'SIGNATURE', en: 'signature', hi: 'हस्ताक्षर', domain: 'counter', hands: 2,
    handshape: 'Index + middle (V) writing on an open palm', location: 'Base palm',
    movement: 'Dominant fingers sweep across the base palm',
    acc: 0.95, durMs: 900,
    frames: [
      { t: 0, R: h('neutral', 'v', 'down', -60, -.06, -.03), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: .5, R: h('neutral', 'v', 'down', -58, .0, -.015), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: 1, R: h('neutral', 'v', 'down', -56, .05, -.03), L: h('neutral', 'flat', 'up', -80, .0, .01) },
    ],
  },
  {
    id: 'MONEY', en: 'money', hi: 'पैसा', domain: 'counter', hands: 1,
    handshape: 'Thumb rubbing fingertips', location: 'Neutral space',
    movement: 'Thumb rubs across the fingertips repeatedly',
    acc: 0.97, near: ['PAY'], durMs: 800,
    frames: [
      { t: 0, R: h('neutral', 'pinch', 'up', 30, .02, -.03), L: REST },
      { t: .33, R: h('neutral', 'flatO', 'up', 34, .02, -.03), L: REST },
      { t: .66, R: h('neutral', 'pinch', 'up', 30, .02, -.03), L: REST },
      { t: 1, R: h('neutral', 'flatO', 'up', 34, .02, -.03), L: REST },
    ],
  },
  {
    id: 'PAY', en: 'pay', hi: 'भुगतान', domain: 'counter', hands: 2,
    handshape: 'Flat O leaving an open palm', location: 'Base palm → forward',
    movement: 'Dominant hand flicks forward off the base palm',
    acc: 0.94, near: ['MONEY'], durMs: 800,
    frames: [
      { t: 0, R: h('neutral', 'flatO', 'up', -60, -.04, -.02), L: h('neutral', 'flat', 'up', -80, .0, .01) },
      { t: 1, R: h('far', 'five', 'out', -30, .04, -.06), L: h('neutral', 'flat', 'up', -80, .0, .01), nod: .15 },
    ],
  },
  {
    id: 'CARD', en: 'card', hi: 'कार्ड', domain: 'counter', hands: 2,
    handshape: 'Both L, outlining a card', location: 'Neutral space',
    movement: 'Hands draw a small rectangle, then slide forward',
    acc: 0.92, durMs: 880,
    frames: [
      { t: 0, R: h('neutral', 'l', 'out', -10, -.02, -.03), L: h('neutral', 'l', 'out', 10, .02, .0) },
      { t: .55, R: h('neutral', 'l', 'out', -10, .03, -.03), L: h('neutral', 'l', 'out', 10, -.03, .0) },
      { t: 1, R: h('far', 'flat', 'up', -50, .01, -.05), L: h('neutral', 'l', 'out', 10, -.03, .0) },
    ],
  },
  {
    id: 'NUMBER', en: 'number', hi: 'नंबर', domain: 'counter', hands: 2,
    handshape: 'Both flat O, fingertips meeting', location: 'Neutral space',
    movement: 'Fingertips touch and twist past each other',
    acc: 0.93, durMs: 840,
    frames: [
      { t: 0, R: h('neutral', 'flatO', 'in', -40, .02, -.03), L: h('neutral', 'flatO', 'in', 40, -.02, -.03) },
      { t: .5, R: h('neutral', 'flatO', 'in', -70, .01, -.03), L: h('neutral', 'flatO', 'in', 70, -.01, -.03) },
      { t: 1, R: h('neutral', 'flatO', 'in', -40, .02, -.03), L: h('neutral', 'flatO', 'in', 40, -.02, -.03) },
    ],
  },
  {
    id: 'ROOM', en: 'room', hi: 'कमरा', domain: 'counter', hands: 2,
    handshape: 'Both flat B, facing', location: 'Neutral space',
    movement: 'Palms face in, then rotate to enclose a space',
    acc: 0.94, durMs: 880,
    frames: [
      { t: 0, R: h('chestHigh', 'flat', 'in', -6, .04, -.02), L: h('chestHigh', 'flat', 'in', 6, -.04, -.02) },
      { t: 1, R: h('neutral', 'flat', 'side', -70, .05, .0), L: h('neutral', 'flat', 'side', 70, -.05, .0) },
    ],
  },
  {
    id: 'OPEN', en: 'open', hi: 'खुला', domain: 'counter', hands: 2,
    handshape: 'Both flat B, palms down → apart', location: 'Neutral space',
    movement: 'Joined palms swing apart and turn up',
    acc: 0.96, near: ['CLOSED'], durMs: 780,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'down', -84, .0, -.03), L: h('neutral', 'flat', 'down', 84, .0, -.03) },
      { t: 1, R: h('neutral', 'flat', 'up', 40, .07, -.03), L: h('neutral', 'flat', 'up', -40, -.07, -.03), brow: .2, mouth: .2 },
    ],
  },
  {
    id: 'CLOSED', en: 'closed', hi: 'बंद', domain: 'counter', hands: 2,
    handshape: 'Both flat B, palms up → together', location: 'Neutral space',
    movement: 'Open palms swing together and turn down',
    nmm: 'Head shake, lips pressed', acc: 0.95, near: ['OPEN'], durMs: 780,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'up', 40, .07, -.03), L: h('neutral', 'flat', 'up', -40, -.07, -.03), head: .15 },
      { t: 1, R: h('neutral', 'flat', 'down', -84, .0, -.03), L: h('neutral', 'flat', 'down', 84, .0, -.03), head: -.2, mouth: -.4 },
    ],
  },
  {
    id: 'MEETING', en: 'meeting', hi: 'बैठक', domain: 'counter', hands: 2,
    handshape: 'Both open 5 closing to flat O', location: 'Neutral space',
    movement: 'Both hands come together and the fingers close',
    acc: 0.92, durMs: 860,
    frames: [
      { t: 0, R: h('chestHigh', 'five', 'in', -10, .07, -.02), L: h('chestHigh', 'five', 'in', 10, -.07, -.02) },
      { t: 1, R: h('chestHigh', 'flatO', 'in', -20, .015, -.02), L: h('chestHigh', 'flatO', 'in', 20, -.015, -.02), nod: .15 },
    ],
  },

  {
    id: 'TRAIN', en: 'train', hi: 'ट्रेन', domain: 'travel', hands: 2,
    handshape: 'Both index + middle (V), palms down', location: 'Neutral space',
    movement: 'Dominant fingers slide back and forth along the base fingers',
    acc: 0.96, durMs: 900,
    frames: [
      { t: 0, R: h('neutral', 'v', 'down', -80, -.03, -.03), L: h('neutral', 'v', 'down', -80, .02, -.03) },
      { t: .4, R: h('neutral', 'v', 'down', -80, .03, -.03), L: h('neutral', 'v', 'down', -80, .02, -.03) },
      { t: .75, R: h('neutral', 'v', 'down', -80, -.04, -.03), L: h('neutral', 'v', 'down', -80, .02, -.03) },
      { t: 1, R: h('neutral', 'v', 'down', -80, .02, -.03), L: h('neutral', 'v', 'down', -80, .02, -.03) },
    ],
  },
  {
    id: 'DELAY', en: 'delay', hi: 'देरी', domain: 'travel', hands: 2,
    handshape: 'Both flat B, palms up, pushing forward', location: 'Neutral space',
    movement: 'Both hands push forward slowly in small stages',
    nmm: 'Cheeks puffed, brows raised — duration is marked on the face',
    acc: 0.9, durMs: 1080,
    frames: [
      { t: 0, R: h('neutral', 'flat', 'up', 46, -.02, -.02), L: h('neutral', 'flat', 'up', -46, .02, -.02), brow: .3, mouth: .35 },
      { t: .5, R: h('neutral', 'flat', 'up', 46, .03, -.05), L: h('neutral', 'flat', 'up', -46, -.03, -.05), brow: .35, mouth: .4 },
      { t: 1, R: h('far', 'flat', 'up', 42, .04, -.07), L: h('far', 'flat', 'up', -42, -.04, -.07), brow: .35, mouth: .4 },
    ],
  },
  {
    id: 'TICKET', en: 'ticket', hi: 'टिकट', domain: 'travel', hands: 2,
    handshape: 'Index + middle (V) clamping the base palm edge', location: 'Base palm',
    movement: 'Dominant fingers pinch the edge of the base hand twice',
    acc: 0.93, durMs: 840,
    frames: [
      { t: 0, R: h('neutral', 'v', 'side', -50, -.05, -.03), L: h('neutral', 'flat', 'side', -70, .0, .0) },
      { t: .4, R: h('neutral', 'flatO', 'side', -50, -.025, -.02), L: h('neutral', 'flat', 'side', -70, .0, .0) },
      { t: .7, R: h('neutral', 'v', 'side', -50, -.05, -.03), L: h('neutral', 'flat', 'side', -70, .0, .0) },
      { t: 1, R: h('neutral', 'flatO', 'side', -50, -.03, -.02), L: h('neutral', 'flat', 'side', -70, .0, .0) },
    ],
  },

  {
    id: 'NEED', en: 'need', hi: 'ज़रूरत', domain: 'action', hands: 1,
    handshape: 'Hook X, palm down', location: 'Neutral space',
    movement: 'Hooked index pulls down sharply, twice',
    nmm: 'Brows drawn, single firm nod', acc: 0.95, durMs: 800,
    frames: [
      { t: 0, R: h('chestHigh', 'hook', 'down', -50, .03, -.02), L: REST, brow: -.25 },
      { t: .45, R: h('neutral', 'hook', 'down', -50, .03, -.01), L: REST, brow: -.3, nod: .25 },
      { t: .7, R: h('chestHigh', 'hook', 'down', -50, .03, -.02), L: REST, brow: -.25 },
      { t: 1, R: h('neutral', 'hook', 'down', -50, .03, -.01), L: REST, brow: -.3, nod: .3 },
    ],
  },
  {
    id: 'SEE', en: 'see', hi: 'देखना', domain: 'action', hands: 1,
    handshape: 'Index + middle (V), fingertips forward', location: 'Below the eyes → outward',
    movement: 'V moves from the eyes toward the addressee',
    nmm: 'Eye gaze follows the hand', acc: 0.98, durMs: 700,
    frames: [
      { t: 0, R: h('eye', 'v', 'in', -6, .0, .01), L: REST, brow: .15 },
      { t: 1, R: h('far', 'v', 'out', -34, .02, -.11), L: REST, brow: .2 },
    ],
  },
  {
    id: 'COME', en: 'come', hi: 'आना', domain: 'action', hands: 1,
    handshape: 'Index point, palm up', location: 'Forward → chest',
    movement: 'Index draws inward toward the signer',
    nmm: 'Brows raised — invitation', acc: 0.96, near: ['GO'], durMs: 720,
    frames: [
      { t: 0, R: h('far', 'point', 'up', -20, .04, -.08), L: REST, brow: .3 },
      { t: 1, R: h('chest', 'point', 'up', 20, -.02, -.01), L: REST, brow: .35, nod: .2 },
    ],
  },
  {
    id: 'GO', en: 'go', hi: 'जाना', domain: 'action', hands: 1,
    handshape: 'Index point, palm down', location: 'Chest → forward',
    movement: 'Index drives forward and away',
    acc: 0.96, near: ['COME'], durMs: 720,
    frames: [
      { t: 0, R: h('chest', 'point', 'down', -40, .0, -.02), L: REST },
      { t: 1, R: h('far', 'point', 'down', -50, .05, -.09), L: REST, nod: .15 },
    ],
  },
  {
    id: 'GOOD', en: 'good', hi: 'अच्छा', domain: 'action', hands: 1,
    handshape: 'Fist A, thumb up', location: 'Neutral space',
    movement: 'Thumb rises decisively',
    nmm: 'Nod, lips pressed in approval', acc: 0.99, near: ['BAD'], durMs: 640,
    frames: [
      { t: 0, R: h('neutral', 'thumb', 'side', 0, .0, .02), L: REST, nod: 0 },
      { t: 1, R: h('chestHigh', 'thumb', 'side', 0, .02, -.02), L: REST, nod: .35, mouth: .2, brow: .2 },
    ],
  },
  {
    id: 'BAD', en: 'bad', hi: 'ख़राब', domain: 'action', hands: 1,
    handshape: 'Fist A, thumb down', location: 'Neutral space',
    movement: 'Thumb turns and drops',
    nmm: 'Brows furrowed, headshake', acc: 0.98, near: ['GOOD'], durMs: 680,
    frames: [
      { t: 0, R: h('chestHigh', 'thumb', 'side', 0, .02, -.02), L: REST, brow: -.2 },
      { t: 1, R: h('neutral', 'thumb', 'side', 178, .02, .04), L: REST, brow: -.45, mouth: -.45, head: -.2 },
    ],
  },
  {
    id: 'FINISH', en: 'finished', hi: 'हो गया', domain: 'action', hands: 2,
    handshape: 'Both open 5, palms in → flicked out', location: 'Neutral space',
    movement: 'Both hands flip over and out — completion',
    nmm: 'Single sharp nod, mouth closes', acc: 0.97, durMs: 720,
    frames: [
      { t: 0, R: h('neutral', 'five', 'in', -20, .02, -.03), L: h('neutral', 'five', 'in', 20, -.02, -.03) },
      { t: 1, R: h('neutral', 'five', 'out', 40, .07, -.01), L: h('neutral', 'five', 'out', -40, -.07, -.01), nod: .35, mouth: -.2 },
    ],
  },
  {
    id: 'MORE', en: 'more', hi: 'और', domain: 'action', hands: 2,
    handshape: 'Both flat O, fingertips meeting', location: 'Neutral space',
    movement: 'Fingertips tap together twice',
    acc: 0.95, near: ['NUMBER'], durMs: 760,
    frames: [
      { t: 0, R: h('neutral', 'flatO', 'in', -46, .05, -.03), L: h('neutral', 'flatO', 'in', 46, -.05, -.03) },
      { t: .4, R: h('neutral', 'flatO', 'in', -46, .012, -.03), L: h('neutral', 'flatO', 'in', 46, -.012, -.03) },
      { t: .72, R: h('neutral', 'flatO', 'in', -46, .05, -.03), L: h('neutral', 'flatO', 'in', 46, -.05, -.03) },
      { t: 1, R: h('neutral', 'flatO', 'in', -46, .015, -.03), L: h('neutral', 'flatO', 'in', 46, -.015, -.03) },
    ],
  },
  {
    id: 'AGAIN', en: 'again', hi: 'फिर से', domain: 'action', hands: 2,
    handshape: 'Bent B rotating onto an open palm', location: 'Base palm',
    movement: 'Dominant hand turns over and lands on the base palm',
    nmm: 'Brows raised — request to repeat', acc: 0.94, durMs: 820,
    frames: [
      { t: 0, R: h('chestHigh', 'bent', 'up', 40, .06, .0), L: h('neutral', 'flat', 'up', -80, .0, .01), brow: .3 },
      { t: 1, R: h('neutral', 'bent', 'down', -60, -.01, -.02), L: h('neutral', 'flat', 'up', -80, .0, .01), brow: .35, nod: .2 },
    ],
  },
]

export const ALL_SIGNS: Sign[] = [...SIGNS, ...COMMON]
export const SIGN_BY_ID: Record<string, Sign> = Object.fromEntries(ALL_SIGNS.map(s => [s.id, s]))
export const CLIPS_PER_SIGN = 80
export const SIGNERS = 4
export const REPS = 20
export const TOTAL_CLIPS = SIGNS.length * CLIPS_PER_SIGN
export const PLANNED_PACKS = [
  { id: 'railway', label: 'Railway PRS', count: 74, note: 'Reservation, platform, refund, quota' },
  { id: 'banking', label: 'Banking & CSC', count: 88, note: 'Account, KYC, passbook, deposit' },
  { id: 'police',  label: 'Police desk',  count: 61, note: 'Complaint, FIR, witness, station' },
  { id: 'civic',   label: 'Civic services', count: 52, note: 'Certificate, ration, pension, Aadhaar' },
]
