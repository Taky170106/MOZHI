import { ALL_SIGNS, SIGN_BY_ID } from './lexicon'
import { englishToGloss, glossToEnglish, groupGlosses, type GlossResult } from './glossing'
import { isLetterId } from './alphabet'
import type { CaptionLang } from './settings'

/* ============================================================
   hindi.ts — the second half of every caption.

   Despite the filename (kept so the rest of the app's imports do not have to
   change), the second language rendered here is **Tamil**. This terminal is
   configured for a Tamil-speaking counter — a police station front desk — so
   every caption's second line is Tamil, composed from the sign sequence.

   Two directions, and they are not the same problem.

   OUT (`glossToHindi`) is safe: the counter already knows the gloss sequence,
   and a gloss is a language-neutral id. Tamil is composed from that sequence
   by the same kind of rules `glossToEnglish` uses for English — a template
   table for the sentences the counter actually says, and a compositional
   fallback under it. Nothing here translates free English text; it renders a
   sign sequence.

   IN (`hindiToGloss`) maps Tamil words onto the vocabulary and then hands the
   result to the English pipeline, so clause ordering, dropping and
   fingerspelling stay in one place and cannot drift between the languages.

   What this file deliberately does NOT do is translate arbitrary staff prose.
   A sentence with no sign sequence behind it gets no Tamil line —
   `glossToHindi` returns null and the caption stays English rather than
   inventing a translation at a police counter.
   ============================================================ */

/* The sentences the counter actually produces, keyed by gloss sequence so
   both lanes hit them: an inbound read resolves to the same ids the staff
   composer resolves to. Mirrors TEMPLATES in glossing.ts one for one. */
const HI_TEMPLATES: [string[], string][] = [
  /* Police front desk — the phrases this station's counter uses. */
  [['COMPLAINT', 'NEED'], 'நான் ஒரு புகார் பதிவு செய்ய வேண்டும்.'],
  [['MY', 'PHONE', 'THEFT'], 'என் தொலைபேசி திருடப்பட்டது.'],
  [['HELP', 'NEED'], 'எனக்கு உதவி தேவை.'],
  [['OFFICER', 'SEE', 'NEED'], 'நான் ஒரு அதிகாரியை பார்க்க வேண்டும்.'],
  [['TOKEN', 'NUMBER', 'WHAT'], 'டோக்கன் எண் என்ன?'],
  [['MY', 'CARD', 'LOST'], 'என் அடையாள அட்டை தொலைந்தது.'],
  [['FORM', 'SIGNATURE', 'WHERE'], 'படிவத்தில் எங்கே கையொப்பம் இட வேண்டும்?'],
  [['NOT-UNDERSTAND'], 'புரியவில்லை.'],
  /* Staff replies, keyed by the order the composer produces. */
  [['PLEASE', 'OFFICER', 'WAIT'], 'தயவுசெய்து ஒரு அதிகாரிக்காக காத்திருங்கள்.'],
  [['PLEASE', 'COMPLAINT', 'SIGNATURE'], 'தயவுசெய்து இங்கே புகாரில் கையொப்பம் இடுங்கள்.'],
  [['PLEASE', 'WINDOW', 'GO'], 'தயவுசெய்து சாளரத்திற்கு செல்லுங்கள்.'],
  [['YOU', 'HELP', 'NEED'], 'உங்களுக்கு உதவி வேண்டுமா?'],
  [['TOMORROW', 'MORNING', 'COME'], 'நாளை காலை வாருங்கள்.'],
  [['WINDOW', 'NUMBER', 'GO'], 'சாளரத்திற்கு செல்லுங்கள்.'],
  /* A few kept from the general counter set, in case they are exercised. */
  [['MY', 'NAME', 'WHAT'], 'என் பெயர் என்ன?'],
  [['PLEASE', 'WAIT', 'YOU'], 'தயவுசெய்து காத்திருங்கள்.'],
]

/* Two nouns that name one thing. Tamil joins these with a space; anything
   else in the sequence is a genuine list and takes 'மற்றும்'. */
const COMPOUND = new Set(['ROOM>NUMBER', 'TEST>REPORT', 'TOKEN>NUMBER', 'CARD>NUMBER'])

/* A noun as it sits inside a Tamil clause. Kept separate from the lexicon's
   `hi` field, which is the citation form shown on a vocabulary card. */
const HI_NOUN: Record<string, string> = {
  POLICE: 'காவல்துறை', STATION: 'நிலையம்', OFFICER: 'அதிகாரி', COMPLAINT: 'புகார்',
  THEFT: 'திருட்டு', LOST: 'தொலைந்தது', PHONE: 'தொலைபேசி', CARD: 'அட்டை',
  FORM: 'படிவம்', SIGNATURE: 'கையொப்பம்', TOKEN: 'டோக்கன்', WINDOW: 'சாளரம்',
  NUMBER: 'எண்', NAME: 'பெயர்', ADDRESS: 'முகவரி', MONEY: 'பணம்',
  DOCTOR: 'மருத்துவர்', HOSPITAL: 'மருத்துவமனை', MEDICINE: 'மருந்து', REPORT: 'அறிக்கை',
  ROOM: 'அறை', HELP: 'உதவி', YOU: 'நீங்கள்', MY: 'என்',
  HEAD: 'தலை', STOMACH: 'வயிறு', PAIN: 'வலி', FEVER: 'காய்ச்சல்',
  EMERGENCY: 'அவசரம்', MEETING: 'கூட்டம்', TRAIN: 'ரயில்', TICKET: 'டிக்கெட்',
  TIME: 'நேரம்', GOOD: 'நல்லது', BAD: 'மோசம்', MORE: 'மேலும்',
}

const HI_TIME: Record<string, string> = {
  TODAY: 'இன்று', TOMORROW: 'நாளை', YESTERDAY: 'நேற்று',
  NOW: 'இப்போது', MORNING: 'காலை', TIME: '',
}

const HI_WH: Record<string, string> = {
  WHAT: 'என்ன', WHERE: 'எங்கே', WHEN: 'எப்போது', WHY: 'ஏன்', 'HOW-MANY': 'எத்தனை',
}

const VERBS = [
  'NEED', 'SEE', 'COME', 'GO', 'WAIT', 'PAY', 'HELP', 'UNDERSTAND',
  'NOT-UNDERSTAND', 'FINISH', 'OPEN', 'CLOSED', 'DELAY', 'SIGNATURE',
  'THEFT', 'LOST',
]

/**
 * Tamil for a gloss sequence.
 *
 * `templated` says whether the sentence came out of the table above or was
 * composed. The distinction matters on screen: a composed line is correct
 * word-order Tamil but it is machine-built, and the caption marks it as such
 * rather than passing it off as authored copy.
 */
export function glossToHindi(
  glosses: string[],
  /* The words those FS letters came from, in order. The gloss stream has no
     word boundary, so without this a spelled name loses its spaces. */
  spelledWords: string[] = [],
): { text: string; templated: boolean } | null {
  const known = glosses.filter(g => SIGN_BY_ID[g])
  if (!known.length && !glosses.some(isLetterId)) return null

  for (const [seq, out] of HI_TEMPLATES) {
    if (seq.length === glosses.length && seq.every((g, i) => g === glosses[i])) {
      return { text: out, templated: true }
    }
  }

  /* A fingerspelled run is a word the vocabulary does not have — a name, a
     number. The Tamil caption keeps the spelled word in Latin letters, since
     the manual alphabet is Latin and there is no reliable Tamil
     transliteration for an arbitrary name. Digits pass through unchanged. */
  const queue = [...spelledWords]
  const seq: { id: string | null; text: string }[] = groupGlosses(glosses).map(run => {
    if (!run.spelled) return { id: run.label, text: '' }

    const letters = run.ids.length
    const words: string[] = []
    let taken = 0
    while (queue.length && taken < letters) {
      const w = queue[0].replace(/[^a-z0-9]/gi, '')
      if (taken + w.length > letters) break
      words.push(queue.shift()!)
      taken += w.length
    }

    const text = taken === letters && words.length
      ? words.join(' ')
      : run.label.split('-').join('')
    return { id: null, text }
  })

  const wh = known.find(x => HI_WH[x])
  const time = known.find(x => HI_TIME[x] !== undefined)
  const neg = known.includes('NO')
  const rest = known.filter(x => !HI_WH[x] && HI_TIME[x] === undefined && x !== 'NO')
  const polite = rest.includes('PLEASE')
  const body = rest.filter(x => x !== 'PLEASE')
  const verbs = body.filter(x => VERBS.includes(x))

  /* The noun phrase, in the order it was signed, with spelled runs kept in
     place — the sequence is the sentence's spine. */
  const parts = seq.filter(
    p =>
      p.id === null ||
      (!HI_WH[p.id] && HI_TIME[p.id] === undefined && p.id !== 'NO' && p.id !== 'PLEASE'
        && !VERBS.includes(p.id) && !!SIGN_BY_ID[p.id]),
  )
  let np = ''
  parts.forEach((p, i) => {
    const word = p.id ? HI_NOUN[p.id] ?? SIGN_BY_ID[p.id]?.hi ?? p.id : p.text
    if (!i) { np = word; return }
    const prev = parts[i - 1]
    const glue =
      !p.id || !prev.id || prev.id === 'MY' || prev.id === 'YOU'
        || COMPOUND.has(`${prev.id}>${p.id}`)
        ? ' '
        : ' மற்றும் '
    np += glue + word
  })

  let clause: string
  if (verbs.includes('NEED')) clause = `${np || 'உதவி'} தேவை`
  else if (verbs.includes('SEE')) clause = `${np || 'யாரையாவது'} பார்க்க வேண்டும்`
  else if (verbs.includes('WAIT')) clause = `${np ? np + 'க்காக ' : ''}காத்திருங்கள்`
  else if (verbs.includes('COME')) clause = `${np ? np + 'க்கு ' : ''}வாருங்கள்`
  else if (verbs.includes('GO')) clause = `${np || 'சாளரத்தி'}ற்கு செல்லுங்கள்`
  else if (verbs.includes('PAY')) clause = `${np || 'கட்டணம்'} செலுத்த வேண்டும்`
  else if (verbs.includes('HELP')) clause = `உதவி தேவை${np && np !== 'உதவி' ? ' — ' + np : ''}`
  else if (verbs.includes('THEFT')) clause = `${np || 'அது'} திருடப்பட்டது`
  else if (verbs.includes('LOST')) clause = `${np || 'அது'} தொலைந்தது`
  else if (verbs.includes('NOT-UNDERSTAND')) clause = 'புரியவில்லை'
  else if (verbs.includes('UNDERSTAND')) clause = 'புரிந்தது'
  else if (verbs.includes('FINISH')) clause = `${np || 'அது'} முடிந்தது`
  else if (verbs.includes('DELAY')) clause = `${np || 'அது'} தாமதமாகிறது`
  else if (verbs.includes('OPEN')) clause = `${np || 'அது'} திறந்துள்ளது`
  else if (verbs.includes('CLOSED')) clause = `${np || 'அது'} மூடப்பட்டது`
  else if (verbs.includes('SIGNATURE')) clause = `${np || 'படிவத்தில்'} கையொப்பம் இடுங்கள்`
  else clause = np || SIGN_BY_ID[body[0]]?.hi || ''

  let out: string
  if (wh) {
    const obj = np || 'அது'
    out = wh === 'WHERE' ? `${obj} எங்கே?`
      : wh === 'WHEN' ? `${obj} எப்போது?`
      : wh === 'WHY' ? `${obj} ஏன்?`
      : wh === 'HOW-MANY' ? `${obj} எத்தனை?`
      : `${obj} என்ன?`
  } else {
    out = clause + (neg ? ' — இல்லை' : '') + '.'
  }

  const prefix = time && HI_TIME[time] ? HI_TIME[time] + ' ' : ''
  const full = (polite ? 'தயவுசெய்து ' : '') + prefix + out
  return { text: full.replace(/\s+/g, ' ').trim(), templated: false }
}

/* ---- inbound: Tamil → the vocabulary ----------------------------------- */

/* Tamil words that carry grammar rather than content. Mapped onto the English
   function words the gloss pipeline already knows how to drop. */
const HI_FUNCTION: Record<string, string> = {
  ஆகும்: 'is', உள்ளது: 'is', இருக்கிறது: 'is', இருந்தது: 'was',
  ஒரு: 'a', இந்த: 'this', அந்த: 'that', மற்றும்: 'and',
  செய்: 'do', செய்ய: 'do', இடு: 'do', இடுங்கள்: 'do', வேண்டும்: 'need',
}

/* Content words. The lexicon's own `hi` field (now Tamil) is the spine; the
   extra entries are the everyday forms a person at a counter actually says. */
const HI_LEX: Record<string, string> = {}
const hiAdd = (en: string, ...words: string[]) => words.forEach(w => { HI_LEX[w] = en })

ALL_SIGNS.forEach(s => {
  const head = s.hi.replace(/\s*\(.*\)\s*/, '').trim()
  if (head) HI_LEX[head] = s.en
})

hiAdd('hello', 'வணக்கம்')
hiAdd('thank you', 'நன்றி')
hiAdd('please', 'தயவுசெய்து', 'தயவு')
hiAdd('sorry', 'மன்னிக்கவும்', 'மன்னியுங்கள்')
hiAdd('yes', 'ஆம்', 'சரி')
hiAdd('no', 'இல்லை', 'வேண்டாம்')
hiAdd('you', 'நீங்கள்', 'உங்கள்', 'உங்களுக்கு')
hiAdd('my', 'என்', 'எனது', 'எனக்கு', 'நான்')
hiAdd('help', 'உதவி', 'உதவுங்கள்')
hiAdd('need', 'தேவை', 'வேண்டும்')
hiAdd('see', 'பார்', 'பார்க்க', 'சந்திக்க')
hiAdd('come', 'வா', 'வாருங்கள்')
hiAdd('go', 'செல்', 'செல்லுங்கள்', 'போ')
hiAdd('wait', 'காத்திருங்கள்', 'பொறுங்கள்')
hiAdd('police', 'காவல்துறை', 'போலீஸ்', 'காவலர்')
hiAdd('station', 'நிலையம்', 'தானா')
hiAdd('officer', 'அதிகாரி', 'இன்ஸ்பெக்டர்')
hiAdd('complaint', 'புகார்', 'புகார்கள்')
hiAdd('theft', 'திருட்டு', 'திருடப்பட்டது', 'திருடன்')
hiAdd('lost', 'தொலைந்தது', 'காணவில்லை')
hiAdd('phone', 'தொலைபேசி', 'போன்', 'மொபைல்')
hiAdd('card', 'அட்டை', 'அடையாள')
hiAdd('form', 'படிவம்')
hiAdd('signature', 'கையொப்பம்', 'கையெழுத்து')
hiAdd('name', 'பெயர்')
hiAdd('address', 'முகவரி')
hiAdd('token', 'டோக்கன்')
hiAdd('window', 'சாளரம்', 'ஜன்னல்')
hiAdd('number', 'எண்', 'நம்பர்')
hiAdd('money', 'பணம்', 'கட்டணம்')
hiAdd('report', 'அறிக்கை')
hiAdd('today', 'இன்று')
hiAdd('now', 'இப்போது')
hiAdd('tomorrow', 'நாளை')
hiAdd('yesterday', 'நேற்று')
hiAdd('morning', 'காலை')
hiAdd('time', 'நேரம்')
hiAdd('what', 'என்ன')
hiAdd('where', 'எங்கே', 'எங்கு')
hiAdd('when', 'எப்போது')
hiAdd('why', 'ஏன்')
hiAdd('how many', 'எத்தனை', 'எவ்வளவு')
hiAdd('good', 'நல்லது', 'நன்று')
hiAdd('bad', 'மோசம்', 'கெட்டது')
hiAdd('again', 'மீண்டும்', 'மறுபடியும்')

/* Multi-word phrases matched before their parts are read separately. */
const HI_PHRASES: [string[], string][] = [
  [['புரியவில்லை'], 'I don’t understand'],
  [['நன்றி'], 'thank you'],
]

/** True for Tamil text (also tolerant of Devanagari, so either script works). */
export const isDevanagari = (text: string) => /[஀-௿ऀ-ॿ]/.test(text)

/**
 * Tamil text to the same GlossResult the English composer produces.
 *
 * Every Tamil token is rewritten as the English word for its sign and the
 * sentence is then handed to `englishToGloss`, so clause splitting, ISL
 * ordering, dropping and fingerspelling are shared rather than reimplemented.
 * A token that is neither a sign nor a function word is dropped rather than
 * guessed at — Tamil cannot be fingerspelled on a Latin manual alphabet.
 */
export function hindiToGloss(text: string): GlossResult {
  const words = text
    .replace(/[।.!?,;"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  const out: string[] = []
  let i = 0
  outer: while (i < words.length) {
    for (const [seq, en] of HI_PHRASES) {
      if (seq.every((x, k) => words[i + k] === x)) { out.push(en); i += seq.length; continue outer }
    }
    const w = words[i]
    const known = HI_LEX[w] ?? HI_FUNCTION[w]
    if (known) out.push(known)
    else if (/^[a-z0-9]+$/i.test(w)) out.push(w)
    i++
  }
  return englishToGloss(out.join(' ') + (/[?？]\s*$/.test(text) ? '?' : ''))
}

/** English or Tamil in, one gloss sequence out — whichever was typed or said. */
export const textToGloss = (text: string): GlossResult =>
  isDevanagari(text) ? hindiToGloss(text) : englishToGloss(text)

/* ---- what a caption shows ---------------------------------------------- */

export type Caption = {
  primary: string
  /** Null unless the setting asks for both scripts and Tamil exists. */
  secondary: string | null
  /** True when the Tamil shown was composed rather than taken from a table. */
  composed: boolean
}

/**
 * One sentence, rendered for the caption-language setting.
 *
 * `text` is the English the counter already holds; `glosses` is what it was
 * signed as. Tamil is derived from the glosses, never from the English — so
 * when there is no sign sequence there is no Tamil line, and the caption falls
 * back to English rather than showing an empty box or a guess.
 */
export function caption(
  text: string,
  glosses: string[],
  lang: CaptionLang,
  clauses?: string[][],
): Caption {
  if (lang === 'en') return { primary: text, secondary: null, composed: false }

  if (clauses && clauses.length > 1) {
    const parts = clauses.map(g => glossToHindi(g)).filter(Boolean)
    if (!parts.length) return { primary: text, secondary: null, composed: false }
    const joined = parts.map(p => p!.text).join(' ')
    const composed = parts.some(p => !p!.templated)
    if (lang === 'hi') return { primary: joined, secondary: null, composed }
    return { primary: text, secondary: joined, composed }
  }

  const spelled = glosses.some(isLetterId)
    ? textToGloss(text).tokens.filter(t => t.kind === 'fingerspell').map(t => t.source)
    : []
  const hi = glossToHindi(glosses, spelled)
  if (!hi) return { primary: text, secondary: null, composed: false }
  if (lang === 'hi') return { primary: hi.text, secondary: null, composed: !hi.templated }
  return { primary: text, secondary: hi.text, composed: !hi.templated }
}

/** The same, for a sentence the counter knows only as glosses. */
export function captionFromGlosses(glosses: string[], lang: CaptionLang): Caption {
  return caption(glossToEnglish(glosses).text, glosses, lang)
}
