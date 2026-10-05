import { ALL_SIGNS, SIGNS, SIGN_BY_ID } from './lexicon'
import { LETTER_BY_ID, fingerspell, isLetterId, spellable } from './alphabet'
export type TokenKind = 'sign' | 'dropped' | 'oov' | 'fingerspell'
export type GlossToken = {
  gloss: string | null
  source: string
  kind: TokenKind

  clause: number

  reason?: string

  letters?: string[]
}

export type GlossResult = {
  tokens: GlossToken[]

  glosses: string[]

  clauses: string[][]
  oov: string[]
  question: boolean
  notes: string[]
}

const DROP: Record<string, string> = {
  a: 'article', an: 'article', the: 'article',
  is: 'copula', am: 'copula', are: 'copula', was: 'copula', were: 'copula',
  be: 'copula', been: 'copula', being: 'copula',
  to: 'preposition', of: 'preposition', at: 'preposition', in: 'preposition',
  on: 'preposition', for: 'preposition', with: 'preposition', from: 'preposition',
  do: 'auxiliary', does: 'auxiliary', did: 'auxiliary',
  will: 'auxiliary', would: 'auxiliary', shall: 'auxiliary', should: 'auxiliary',
  can: 'auxiliary', could: 'auxiliary', may: 'auxiliary', might: 'auxiliary',
  has: 'auxiliary', have: 'auxiliary', had: 'auxiliary',
  and: 'conjunction', that: 'determiner', this: 'determiner',
  there: 'expletive', it: 'pronoun', your: 'pronoun', very: 'intensifier',
  just: 'filler', so: 'filler', then: 'filler', shortly: 'carried on the face',
  here: 'shown by pointing', now_: 'filler',
  soon: 'carried on the face', kindly: 'folded into PLEASE',
}

const LEX: Record<string, string> = {}
const add = (gloss: string, ...words: string[]) => words.forEach(w => { LEX[w] = gloss })
ALL_SIGNS.forEach(s => { LEX[s.en.toLowerCase()] = s.id; LEX[s.id.toLowerCase()] = s.id })

add('HELLO', 'hi', 'hey', 'greetings', 'namaste', 'welcome')
add('THANK-YOU', 'thanks', 'thankyou', 'grateful')
add('PLEASE', 'pls')
add('SORRY', 'apologies', 'apologise', 'apologize', 'excuse')
add('YES', 'yeah', 'yep', 'ok', 'okay', 'sure', 'correct', 'right')
add('NO', 'not', "n't", 'never', 'none', 'nope', 'cannot', "can't", "don't", "doesn't", "won't", "isn't")
add('NAME', 'names', 'called')
add('YOU', 'u', 'sir', 'madam', 'ma\'am')
add('MY', 'i', 'me', 'mine', 'myself', 'we', 'our', 'us')
add('HELP', 'helping', 'assist', 'assistance', 'support')
add('UNDERSTAND', 'understood', 'understands', 'know', 'clear', 'got')
add('NOT-UNDERSTAND', 'confused', 'unclear')
add('WHAT', 'which')
add('WHERE', 'location')
add('WHEN', 'time?')
add('HOW-MANY', 'howmany', 'count', 'quantity', 'many', 'much')
add('WHY', 'reason')
add('TODAY', 'today\'s')
add('NOW', 'immediately', 'currently', 'present')
add('TOMORROW', 'next')
add('YESTERDAY', 'last')
add('MORNING', 'am', 'morn')
add('TIME', 'clock', 'hour', 'schedule', 'timing')
add('WAIT', 'waiting', 'hold', 'stay', 'pause', 'queue', 'line')
add('DOCTOR', 'doctors', 'dr', 'physician', 'consultant', 'specialist')
add('HOSPITAL', 'clinic', 'phc', 'dispensary', 'ward')
add('MEDICINE', 'medicines', 'tablet', 'tablets', 'drug', 'pills', 'pill', 'prescription', 'pharmacy')
add('PAIN', 'hurt', 'hurts', 'hurting', 'ache', 'aching', 'sore', 'painful')
add('FEVER', 'temperature', 'feverish', 'hot')
add('HEAD', 'headache', 'skull', 'forehead')
add('STOMACH', 'belly', 'abdomen', 'tummy', 'gastric')
add('BLOOD', 'bleeding', 'bp', 'haemoglobin')
add('TEST', 'tests', 'testing', 'scan', 'xray', 'x-ray', 'sample', 'lab', 'checkup')
add('REPORT', 'reports', 'result', 'results', 'record', 'records')
add('APPOINTMENT', 'appointments', 'booking', 'slot', 'consultation', 'visit')
add('EMERGENCY', 'urgent', 'urgently', 'critical', 'casualty')
add('INJECTION', 'injections', 'vaccine', 'shot', 'jab', 'immunisation', 'immunization')
add('SICK', 'ill', 'unwell', 'illness', 'disease', 'patient')
add('FORM', 'forms', 'paper', 'papers', 'document', 'documents', 'application')
add('SIGNATURE', 'sign', 'signed', 'autograph', 'initial')
add('MONEY', 'rupees', 'rupee', 'cash', 'fee', 'fees', 'charge', 'cost', 'amount', 'price')
add('PAY', 'paid', 'paying', 'payment', 'deposit')
add('CARD', 'cards', 'aadhaar', 'aadhar', 'id', 'identity', 'abha')
add('NUMBER', 'numbers', 'no.', 'token', 'id-number', 'phone')
add('ROOM', 'rooms', 'counter', 'window', 'desk', 'cabin', 'opd')
add('OPEN', 'opens', 'opened', 'available')
add('CLOSED', 'close', 'closes', 'shut', 'unavailable')
add('MEETING', 'meetings', 'session')
add('TRAIN', 'trains', 'rail', 'railway', 'express')
add('DELAY', 'delayed', 'late', 'postponed', 'held')
add('TICKET', 'tickets', 'reservation', 'pnr', 'booking-slip')
add('NEED', 'needs', 'needed', 'want', 'wants', 'require', 'required', 'must', 'requires')
add('SEE', 'seeing', 'saw', 'meet', 'meeting-with', 'consult', 'look', 'examine', 'check')
add('COME', 'coming', 'came', 'arrive', 'arrived', 'bring', 'return')

add('GO', 'going', 'went', 'leave', 'proceed', 'move')
add('GOOD', 'well', 'fine', 'nice', 'better', 'successful', 'successfully')
add('BAD', 'worse', 'poor', 'wrong', 'problem', 'issue')
add('FINISH', 'finished', 'done', 'complete', 'completed', 'over', 'end', 'ended', 'ready', 'prepared')
add('MORE', 'another', 'additional', 'extra', 'again?')
add('AGAIN', 'repeat', 'once-more', 'resend')

add('WATER', 'water', 'drink', 'thirsty')
add('SIT', 'sit', 'seat', 'sitting', 'sits')
add('STAND', 'stand', 'standing', 'stands')
add('BRING', 'brings', 'bringing', 'fetch', 'carry')
add('GIVE', 'gives', 'giving', 'hand', 'submit', 'deposit')
add('TAKE', 'takes', 'taking', 'collect', 'receive')
add('SHOW', 'shows', 'showing', 'display', 'present')
add('WRITE', 'writes', 'writing', 'fill', 'note')
add('EVENING', 'evenings')
add('NIGHT', 'nights', 'tonight')
add('DAY', 'days', 'daily')
add('WEEK', 'weeks', 'weekly')
add('MONTH', 'months', 'monthly')
add('YEAR', 'years', 'yearly', 'annual')
add('LATER', 'afterwards', 'afterward', 'soon')
add('BEFORE', 'earlier', 'prior', 'previously')
add('NURSE', 'nurse', 'nurses')
add('WARD', 'ward', 'wards')
add('BED', 'bed', 'beds')
add('TABLET', 'tablet', 'tablets', 'capsule')
add('XRAY', 'x-ray', 'xray', 'scan', 'radiograph')
add('QUEUE', 'queue', 'queues', 'lineup')
add('TOKEN', 'token', 'tokens', 'slip', 'coupon')
add('WINDOW', 'window', 'windows')
add('PHONE', 'phone', 'phones', 'mobile')
add('ADDRESS', 'addresses')
add('AGE', 'ages', 'old age')
add('BIG', 'large', 'huge', 'bigger')
add('SMALL', 'little', 'tiny', 'smaller')
add('NEW', 'newer', 'fresh')
add('OLD', 'older', 'previous')
add('ALL', 'everything', 'every', 'whole')
add('MANY', 'much', 'lots', 'several', 'plenty')
add('I', 'myself')
add('WE', 'our', 'ours', 'us')
add('HE-SHE', 'he', 'she', 'him', 'her', 'they', 'them')
add('OK', 'fine', 'alright')
add('KNOW', 'knows', 'knew', 'aware')
add('NOT-KNOW', 'unknown', 'unsure')
add('WANT', 'wants', 'wanted', 'wish', 'require')
add('CAN', 'able', 'possible', 'may')
add('CANNOT', 'unable', 'impossible')
add('HAVE', 'has', 'had', 'having', 'got')
add('HERE', 'this side')
add('THERE', 'that side')

/* Police front-desk pack. The base word for each is registered from the
   sign's own `en`; these are the synonyms a visitor or clerk actually uses. */
add('POLICE', 'constable', 'cop', 'havaldar')
add('STATION', 'thana', 'chowki', 'outpost')
add('OFFICER', 'inspector', 'sho', 'in-charge', 'incharge', 'sub-inspector')
add('COMPLAINT', 'complain', 'complaints', 'grievance', 'fir', 'diary', 'ncr')
add('THEFT', 'stolen', 'steal', 'stole', 'robbery', 'robbed', 'snatched', 'snatch', 'burglary')
add('LOST', 'missing', 'misplaced', 'miss', 'gone')

const PHRASES: [string[], string][] = [
  [['thank', 'you'], 'THANK-YOU'],
  [['thanks', 'a', 'lot'], 'THANK-YOU'],
  [['how', 'many'], 'HOW-MANY'],
  [['how', 'much'], 'HOW-MANY'],
  [['i', 'do', 'not', 'understand'], 'NOT-UNDERSTAND'],
  [['i', "don't", 'understand'], 'NOT-UNDERSTAND'],
  [['do', 'not', 'understand'], 'NOT-UNDERSTAND'],
  [['x', 'ray'], 'TEST'],
  [['blood', 'test'], 'TEST'],
  [['blood', 'pressure'], 'BLOOD'],
  [['once', 'more'], 'AGAIN'],
  [['one', 'more', 'time'], 'AGAIN'],
  [['excuse', 'me'], 'SORRY'],
  [['good', 'morning'], 'MORNING'],
  [['right', 'now'], 'NOW'],
  [['come', 'back'], 'COME'],
  [['first', 'floor'], 'ROOM'],
]

const TIME_GLOSSES = new Set(['TODAY', 'TOMORROW', 'YESTERDAY', 'NOW', 'MORNING', 'TIME'])
const VERB_FINAL = new Set([
  'NEED', 'COME', 'GO', 'WAIT', 'PAY', 'FINISH', 'DELAY',
  'OPEN', 'CLOSED', 'GOOD', 'BAD', 'UNDERSTAND', 'NOT-UNDERSTAND', 'SIGNATURE',
])
const WH_GLOSSES = new Set(['WHAT', 'WHERE', 'WHEN', 'WHY', 'HOW-MANY'])
const NEG_GLOSSES = new Set(['NO', 'NOT-UNDERSTAND'])
function lemma(w: string): string[] {
  const out = [w]
  if (w.endsWith("'s")) out.push(w.slice(0, -2))
  if (w.length > 3 && w.endsWith('s')) out.push(w.slice(0, -1))
  if (w.length > 4 && w.endsWith('es')) out.push(w.slice(0, -2))
  if (w.length > 5 && w.endsWith('ing')) { out.push(w.slice(0, -3), w.slice(0, -3) + 'e') }
  if (w.length > 4 && w.endsWith('ed')) { out.push(w.slice(0, -2), w.slice(0, -1)) }
  if (w.length > 5 && w.endsWith('ly')) out.push(w.slice(0, -2))
  return out
}

function glossClause(words: string[], clause: number): GlossToken[] {
  const tokens: GlossToken[] = []
  let i = 0
  outer: while (i < words.length) {
    for (const [seq, gloss] of PHRASES) {
      if (seq.every((x, k) => words[i + k] === x)) {
        tokens.push({ gloss, source: seq.join(' '), kind: 'sign', clause })
        i += seq.length
        continue outer
      }
    }
    const w = words[i]
    let hit: string | undefined
    for (const cand of lemma(w)) { if (LEX[cand]) { hit = LEX[cand]; break } }
    if (hit) tokens.push({ gloss: hit, source: w, kind: 'sign', clause })
    else if (DROP[w]) tokens.push({ gloss: null, source: w, kind: 'dropped', clause, reason: DROP[w] })
    else if (/^\d+$/.test(w)) {
      const letters = fingerspell(w)
      tokens.push(letters.length
        ? { gloss: null, source: w, kind: 'fingerspell', clause, letters }
        : { gloss: 'NUMBER', source: w, kind: 'sign', clause })
    }
    else if (spellable(w)) {
      const letters = fingerspell(w)
      tokens.push(
        letters.length
          ? { gloss: null, source: w, kind: 'fingerspell', clause, letters }
          : { gloss: null, source: w, kind: 'oov', clause },
      )
    }
    else tokens.push({ gloss: null, source: w, kind: 'oov', clause })
    i++
  }
  return tokens
}

function orderClause(signs: string[]): string[] {
  const polite = signs.filter(g => g === 'PLEASE')
  const time = signs.filter(g => TIME_GLOSSES.has(g))
  const wh = signs.filter(g => WH_GLOSSES.has(g))
  const neg = signs.filter(g => NEG_GLOSSES.has(g))
  const rest = signs.filter(
    g => g !== 'PLEASE' && !TIME_GLOSSES.has(g) && !WH_GLOSSES.has(g) && !NEG_GLOSSES.has(g))
  const verbs = rest.filter(g => VERB_FINAL.has(g))
  const body = rest.filter(g => !VERB_FINAL.has(g))
  return [...polite, ...time, ...body, ...verbs, ...neg, ...wh]
}

export function englishToGloss(text: string): GlossResult {
  const question = /\?\s*$/.test(text.trim())
  const raw = text
    .toLowerCase()
    .replace(/[.!¡?"“”()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = raw
    .split(/\s*[,;]\s*|\s+\b(?:and then|then|and)\b\s+/)
    .map(p => p.trim())
    .filter(Boolean)

  const tokens: GlossToken[] = []
  const clauses: string[][] = []
  parts.forEach((part, ci) => {
    const words = part.split(' ').filter(Boolean)
    const raw2 = glossClause(words, ci)
    const seq: GlossToken[] = []
    for (const t of raw2) {
      const prev = [...seq].reverse().find(x => x.kind === 'sign')
      if (t.kind === 'sign' && prev && prev.gloss === t.gloss) continue
      seq.push(t)
    }
    tokens.push(...seq)
    const spelled = seq.filter(t => t.kind === 'fingerspell')
    const ordered = orderClause(
      seq
        .filter(t => t.kind === 'sign' || t.kind === 'fingerspell')
        .map(t => (t.kind === 'sign' ? t.gloss! : `FS:${t.source}`)),
    )
    const expanded = ordered.flatMap(g =>
      g.startsWith('FS:')
        ? spelled.find(t => t.source === g.slice(3))?.letters ?? []
        : [g],
    )
    if (expanded.length) clauses.push(expanded)
  })

  const glosses = clauses.flat()
  const allSigns = tokens.filter(t => t.kind === 'sign').map(t => t.gloss!)
  const notes: string[] = []
  if (clauses.length > 1) notes.push(`${clauses.length} clauses — each is ordered on its own, with a pause between them.`)
  if (allSigns.some(g => TIME_GLOSSES.has(g))) notes.push('Time set at the front of its clause.')
  if (allSigns.some(g => WH_GLOSSES.has(g))) notes.push('Wh-sign held to the end; the question is marked on the brows.')
  if (allSigns.some(g => NEG_GLOSSES.has(g))) notes.push('Negation follows the predicate and is carried by a headshake.')
  const spelledWords = tokens.filter(t => t.kind === 'fingerspell')
  if (spelledWords.length) {
    const list = spelledWords.map(t => t.source).join(', ')
    notes.push(
      `${spelledWords.length} word${spelledWords.length > 1 ? 's' : ''} fingerspelled rather than substituted: ${list}.`,
    )
  }
  const dropped = tokens.filter(t => t.kind === 'dropped')
  if (dropped.length) notes.push(`${dropped.length} function word${dropped.length > 1 ? 's' : ''} not signed in ISL.`)

  return {
    tokens,
    glosses,
    clauses,
    oov: tokens.filter(t => t.kind === 'oov').map(t => t.source),
    question: question || allSigns.some(g => WH_GLOSSES.has(g)),
    notes,
  }
}

export function suggestFor(word: string): string[] {
  const w = word.toLowerCase()
  const score = (s: string) => {
    if (s.includes(w) || w.includes(s)) return 10 + Math.min(w.length, s.length)
    let n = 0
    for (let i = 0; i < Math.min(w.length, s.length); i++) {
      if (w[i] !== s[i]) break
      n++
    }
    return n >= 4 && n >= Math.min(w.length, s.length) * 0.6 ? n : 0
  }

  return SIGNS
    .map(s => ({ s, n: score(s.en.toLowerCase()) }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(x => x.s.en)
}

const TEMPLATES: [string[], string][] = [
  [['DOCTOR', 'SEE', 'NEED'], 'I need to see a doctor soon.'],
  [['MORNING', 'TRAIN', 'DELAY'], 'The morning train was delayed.'],
  [['MEETING', 'FINISH', 'GOOD'], 'The meeting finished well.'],
  [['PLEASE', 'WAIT', 'DOCTOR', 'SEE', 'YOU'], 'Please wait, the doctor will see you shortly.'],
  [['MY', 'HEAD', 'PAIN'], 'My head hurts.'],
  [['MY', 'STOMACH', 'PAIN'], 'I have stomach pain.'],
  [['TODAY', 'DOCTOR', 'ROOM', 'WHERE'], 'Where is the doctor’s room today?'],
  [['MEDICINE', 'MONEY', 'HOW-MANY'], 'How much do the medicines cost?'],
  [['REPORT', 'READY', 'WHEN'], 'When will the report be ready?'],
  [['TEST', 'REPORT', 'WHEN'], 'When will the test report be ready?'],
  [['APPOINTMENT', 'TOMORROW', 'NEED'], 'I need an appointment for tomorrow.'],
  [['MY', 'NAME', 'WHAT'], 'What is my name?'],
  [['FEVER', 'MEDICINE', 'NEED'], 'I have a fever and need medicine.'],
  [['TICKET', 'MONEY', 'HOW-MANY'], 'How much does the ticket cost?'],
  [['FORM', 'SIGNATURE', 'WHERE'], 'Where do I sign the form?'],
  [['EMERGENCY', 'DOCTOR', 'NEED'], 'This is an emergency — I need a doctor.'],

  /* Police front desk. Keyed by the gloss order the composer actually
     produces, so the same entry serves an inbound read and an outbound reply. */
  [['COMPLAINT', 'NEED'], 'I need to file a complaint.'],
  [['MY', 'PHONE', 'THEFT'], 'My phone was stolen.'],
  [['HELP', 'NEED'], 'I need help.'],
  [['OFFICER', 'SEE', 'NEED'], 'I need to see an officer.'],
  [['TOKEN', 'NUMBER', 'WHAT'], 'What is the token number?'],
  [['MY', 'CARD', 'LOST'], 'My ID card is lost.'],
  [['NOT-UNDERSTAND'], 'I don’t understand.'],
  [['PLEASE', 'OFFICER', 'WAIT'], 'Please wait for an officer.'],
  [['PLEASE', 'COMPLAINT', 'SIGNATURE'], 'Please sign the complaint here.'],
  [['PLEASE', 'WINDOW', 'GO'], 'Please go to the window.'],
  [['YOU', 'HELP', 'NEED'], 'Do you need help?'],
  [['TOMORROW', 'MORNING', 'COME'], 'Come tomorrow morning.'],
  [['WINDOW', 'NUMBER', 'GO'], 'Go to the window.'],
]

const NOUN_PHRASE: Record<string, string> = {
  DOCTOR: 'a doctor', HOSPITAL: 'the hospital', MEDICINE: 'medicine', REPORT: 'the report',
  TEST: 'a test', APPOINTMENT: 'an appointment', FORM: 'the form', ROOM: 'the room',
  CARD: 'the card', MONEY: 'the payment', TICKET: 'a ticket', TRAIN: 'the train',
  NUMBER: 'the number', SIGNATURE: 'a signature', INJECTION: 'an injection',
  MEETING: 'the meeting', NAME: 'your name', BLOOD: 'a blood test', TIME: 'the time',
  HEAD: 'my head', STOMACH: 'my stomach', PAIN: 'pain', FEVER: 'a fever',
  EMERGENCY: 'an emergency', HELP: 'help',
  POLICE: 'the police', STATION: 'the station', OFFICER: 'an officer',
  COMPLAINT: 'a complaint', THEFT: 'a theft', LOST: 'lost', PHONE: 'my phone',
  TOKEN: 'the token', WINDOW: 'the window',
}

const WH_ENGLISH: Record<string, string> = {
  WHAT: 'What', WHERE: 'Where', WHEN: 'When', WHY: 'Why', 'HOW-MANY': 'How many',
}

const TIME_ENGLISH: Record<string, string> = {
  TODAY: 'Today', TOMORROW: 'Tomorrow', YESTERDAY: 'Yesterday',
  NOW: 'Right now', MORNING: 'This morning', TIME: '',
}

export function glossToEnglish(glosses: string[]): { text: string; templated: boolean } {
  if (!glosses.length) return { text: '', templated: false }
  for (const [seq, out] of TEMPLATES) {
    if (seq.length === glosses.length && seq.every((g, i) => g === glosses[i])) {
      return { text: out, templated: true }
    }
  }

  const g = [...glosses]
  const wh = g.find(x => WH_ENGLISH[x])
  const time = g.find(x => TIME_ENGLISH[x] !== undefined)
  const neg = g.includes('NO')
  const rest = g.filter(x => !WH_ENGLISH[x] && TIME_ENGLISH[x] === undefined && x !== 'NO')
  const politeness = rest.includes('PLEASE')
  const body = rest.filter(x => x !== 'PLEASE')
  const verbs = body.filter(x => ['NEED', 'SEE', 'COME', 'GO', 'WAIT', 'PAY', 'HELP', 'UNDERSTAND', 'NOT-UNDERSTAND', 'FINISH', 'OPEN', 'CLOSED', 'DELAY', 'SIGNATURE'].includes(x))
  const nouns = body.filter(x => !verbs.includes(x))
  const np = nouns.map(n => NOUN_PHRASE[n] ?? (SIGN_BY_ID[n]?.en ?? n.toLowerCase())).join(' and ')
  let clause: string
  if (verbs.includes('NEED')) clause = `I need ${np || 'help'}`
  else if (verbs.includes('SEE')) clause = `I would like to see ${np || 'someone'}`
  else if (verbs.includes('WAIT')) clause = `wait${np ? ' for ' + np : ''}`
  else if (verbs.includes('COME')) clause = `${np || 'someone'} should come`
  else if (verbs.includes('GO')) clause = `I need to go to ${np || 'the counter'}`
  else if (verbs.includes('PAY')) clause = `I need to pay ${np || 'the fee'}`
  else if (verbs.includes('HELP')) clause = `I need help${np ? ' with ' + np : ''}`
  else if (verbs.includes('NOT-UNDERSTAND')) clause = 'I did not understand'
  else if (verbs.includes('UNDERSTAND')) clause = 'I understand'
  else if (verbs.includes('FINISH')) clause = `${np || 'it'} is finished`
  else if (verbs.includes('DELAY')) clause = `${np || 'it'} is delayed`
  else if (verbs.includes('OPEN')) clause = `${np || 'it'} is open`
  else if (verbs.includes('CLOSED')) clause = `${np || 'it'} is closed`
  else if (verbs.includes('SIGNATURE')) clause = `I need to sign ${np || 'the form'}`
  else clause = np || (SIGN_BY_ID[body[0]]?.en ?? '')

  let out: string
  if (wh) {
    const obj = np || 'it'
    out = wh === 'WHERE' ? `Where is ${obj}?`
      : wh === 'WHEN' ? `When is ${obj}?`
      : wh === 'WHY' ? `Why is ${obj} needed?`
      : wh === 'HOW-MANY' ? `How many ${nouns.length ? np : 'are there'}?`
      : `What about ${obj}?`
  } else {
    out = clause + (neg ? ' — no' : '') + '.'
  }

  const prefix = time && TIME_ENGLISH[time] ? TIME_ENGLISH[time] + ', ' : ''
  let full = prefix + out
  if (politeness) full = 'Please, ' + full.charAt(0).toLowerCase() + full.slice(1)
  full = full.charAt(0).toUpperCase() + full.slice(1)
  return { text: full.replace(/\s+/g, ' ').replace(' .', '.'), templated: false }
}

export const isKnownGloss = (g: string) => !!SIGN_BY_ID[g]
export const glossLabel = (id: string) =>
  isLetterId(id) ? (LETTER_BY_ID[id]?.letter ?? id.slice(3)) : id

export function readGlosses(ids: string[]): string[] {
  const out: string[] = []
  let run: string[] = []
  const flush = () => { if (run.length) { out.push(run.join('-')); run = [] } }
  for (const id of ids) {
    if (isLetterId(id)) run.push(glossLabel(id))
    else { flush(); out.push(SIGN_BY_ID[id]?.en ?? id.toLowerCase()) }
  }
  flush()
  return out
}

export type GlossRun = { label: string; ids: string[]; spelled: boolean; from: number }
export function groupGlosses(ids: string[]): GlossRun[] {
  const out: GlossRun[] = []
  let run: string[] = []
  let from = 0
  const flush = () => {
    if (!run.length) return
    out.push({ label: run.map(glossLabel).join('-'), ids: [...run], spelled: true, from })
    run = []
  }
  ids.forEach((id, i) => {
    if (isLetterId(id)) { if (!run.length) from = i; run.push(id) }
    else { flush(); out.push({ label: id, ids: [id], spelled: false, from: i }) }
  })
  flush()
  return out
}
