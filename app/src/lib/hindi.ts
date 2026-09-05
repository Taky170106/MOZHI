import { ALL_SIGNS, SIGN_BY_ID } from './lexicon'
import { englishToGloss, glossToEnglish, groupGlosses, type GlossResult } from './glossing'
import { isLetterId } from './alphabet'
import { toDevanagari, toLatin } from './translit'
import type { CaptionLang } from './settings'

/* ============================================================
   hindi.ts — the second half of every caption.

   Two directions, and they are not the same problem.

   OUT (`glossToHindi`) is safe: the counter already knows the gloss
   sequence, and a gloss is a language-neutral id. Hindi is composed from
   that sequence by the same kind of rules `glossToEnglish` uses for
   English — the same 60 signs, a template table for the sentences the
   counter actually says, and a compositional fallback under it. Nothing
   here translates free English text; it renders a sign sequence.

   IN (`hindiToGloss`) maps Devanagari words onto the vocabulary and then
   hands the result to the English pipeline, so clause ordering, dropping
   and fingerspelling stay in one place and cannot drift between the two
   languages.

   What this file deliberately does NOT do is translate arbitrary staff
   prose. A sentence with no sign sequence behind it gets no Hindi line —
   `glossToHindi` returns null and the caption stays English rather than
   inventing a translation at a hospital counter.
   ============================================================ */

/* The sentences the counter actually produces, keyed by gloss sequence so
   both lanes hit them: an inbound read resolves to the same ids the staff
   composer resolves to. Mirrors TEMPLATES in glossing.ts one for one. */
const HI_TEMPLATES: [string[], string][] = [
  [['DOCTOR', 'SEE', 'NEED'], 'मुझे जल्दी डॉक्टर से मिलना है।'],
  [['MORNING', 'TRAIN', 'DELAY'], 'सुबह की ट्रेन देरी से थी।'],
  [['MEETING', 'FINISH', 'GOOD'], 'बैठक अच्छे से पूरी हुई।'],
  [['PLEASE', 'WAIT', 'DOCTOR', 'SEE', 'YOU'], 'कृपया प्रतीक्षा कीजिए, डॉक्टर आपको जल्दी देखेंगे।'],
  /* The same sentence in the order the composer actually produces — the
     verb goes last in ISL, so this is the sequence that reaches the avatar. */
  [['PLEASE', 'DOCTOR', 'SEE', 'YOU', 'WAIT'], 'कृपया प्रतीक्षा कीजिए, डॉक्टर आपको जल्दी देखेंगे।'],
  [['MY', 'HEAD', 'PAIN'], 'मेरे सिर में दर्द है।'],
  [['MY', 'STOMACH', 'PAIN'], 'मेरे पेट में दर्द है।'],
  [['TODAY', 'DOCTOR', 'ROOM', 'WHERE'], 'आज डॉक्टर का कमरा कहाँ है?'],
  [['MEDICINE', 'MONEY', 'HOW-MANY'], 'दवा का कितना पैसा लगेगा?'],
  [['REPORT', 'READY', 'WHEN'], 'रिपोर्ट कब मिलेगी?'],
  [['TEST', 'REPORT', 'WHEN'], 'जाँच की रिपोर्ट कब मिलेगी?'],
  [['APPOINTMENT', 'TOMORROW', 'NEED'], 'मुझे कल के लिए अपॉइंटमेंट चाहिए।'],
  [['TOMORROW', 'APPOINTMENT', 'NEED'], 'मुझे कल के लिए अपॉइंटमेंट चाहिए।'],
  [['MY', 'NAME', 'WHAT'], 'मेरा नाम क्या है?'],
  [['FEVER', 'MEDICINE', 'NEED'], 'मुझे बुखार है, दवा चाहिए।'],
  [['TICKET', 'MONEY', 'HOW-MANY'], 'टिकट का कितना पैसा लगेगा?'],
  [['FORM', 'SIGNATURE', 'WHERE'], 'फ़ॉर्म पर हस्ताक्षर कहाँ करने हैं?'],
  [['EMERGENCY', 'DOCTOR', 'NEED'], 'यह आपातकाल है — मुझे डॉक्टर चाहिए।'],
  [['TOMORROW', 'MORNING', 'REPORT', 'COME'], 'रिपोर्ट के लिए कल सुबह आइए।'],
  [['FORM', 'SIGNATURE'], 'कृपया यहाँ फ़ॉर्म पर हस्ताक्षर कीजिए।'],
  [['PLEASE', 'FORM', 'SIGNATURE'], 'कृपया यहाँ फ़ॉर्म पर हस्ताक्षर कीजिए।'],
  [['MEDICINE', 'ROOM', 'NUMBER'], 'दवा कमरा नंबर में मिलेगी।'],
  [['ROOM', 'NUMBER', 'GO'], 'बताए गए कमरा नंबर में जाइए।'],
  [['YOU', 'HELP', 'NEED'], 'क्या आपको मदद चाहिए?'],
  [['HELP', 'NEED', 'YOU'], 'क्या आपको मदद चाहिए?'],
  [['NO', 'BAD', 'APPOINTMENT', 'OPEN'], 'कोई बात नहीं, आपका अपॉइंटमेंट अब भी खुला है।'],
  [['NOT-UNDERSTAND'], 'समझ नहीं आया।'],
]

/* Two nouns that name one thing. Hindi joins these with a space; anything
   else in the sequence is a genuine list and takes 'और'. */
const COMPOUND = new Set(['ROOM>NUMBER', 'TEST>REPORT', 'BLOOD>TEST', 'TRAIN>TICKET'])

/* A noun as it sits inside a Hindi clause. Kept separate from the lexicon's
   `hi` field, which is the citation form shown on a vocabulary card. */
const HI_NOUN: Record<string, string> = {
  DOCTOR: 'डॉक्टर', HOSPITAL: 'अस्पताल', MEDICINE: 'दवा', REPORT: 'रिपोर्ट',
  TEST: 'जाँच', APPOINTMENT: 'अपॉइंटमेंट', FORM: 'फ़ॉर्म', ROOM: 'कमरा',
  CARD: 'कार्ड', MONEY: 'पैसा', TICKET: 'टिकट', TRAIN: 'ट्रेन',
  NUMBER: 'नंबर', SIGNATURE: 'हस्ताक्षर', INJECTION: 'इंजेक्शन',
  MEETING: 'बैठक', NAME: 'नाम', BLOOD: 'ख़ून की जाँच', TIME: 'समय',
  HEAD: 'सिर', STOMACH: 'पेट', PAIN: 'दर्द', FEVER: 'बुखार',
  EMERGENCY: 'आपातकाल', HELP: 'मदद', YOU: 'आप', MY: 'मेरा',
  SICK: 'बीमार', GOOD: 'अच्छा', BAD: 'ख़राब', MORE: 'और',
}

const HI_TIME: Record<string, string> = {
  TODAY: 'आज', TOMORROW: 'कल', YESTERDAY: 'बीते कल',
  NOW: 'अभी', MORNING: 'सुबह', TIME: '',
}

const HI_WH: Record<string, string> = {
  WHAT: 'क्या', WHERE: 'कहाँ', WHEN: 'कब', WHY: 'क्यों', 'HOW-MANY': 'कितने',
}

const VERBS = [
  'NEED', 'SEE', 'COME', 'GO', 'WAIT', 'PAY', 'HELP', 'UNDERSTAND',
  'NOT-UNDERSTAND', 'FINISH', 'OPEN', 'CLOSED', 'DELAY', 'SIGNATURE',
]

/**
 * Hindi for a gloss sequence.
 *
 * `templated` says whether the sentence came out of the table above or was
 * composed. The distinction matters on screen: a composed line is correct
 * ISL-order Hindi but it is machine-built, and the caption marks it as such
 * rather than passing it off as authored copy.
 */
export function glossToHindi(
  glosses: string[],
  /* The words those FS letters came from, in order. The gloss stream has no
     word boundary — FS-A FS-M FS-A FS-N FS-D FS-I FS-X FS-I FS-T is one run —
     so without this 'aman dixit' transliterates as one word. */
  spelledWords: string[] = [],
): { text: string; templated: boolean } | null {
  const known = glosses.filter(g => SIGN_BY_ID[g])
  if (!known.length) return null

  for (const [seq, out] of HI_TEMPLATES) {
    if (seq.length === glosses.length && seq.every((g, i) => g === glosses[i])) {
      return { text: out, templated: true }
    }
  }

  /* A fingerspelled run is a word the vocabulary does not have — a room
     number, a name. The hands spell it in Latin letters because the manual
     alphabet is Latin, but the caption is Hindi, so the word is written in
     Devanagari: the sentence stays one language even though the sign is
     spelled. Digits are the same in both scripts and pass through. */
  const queue = [...spelledWords]
  const seq: { id: string | null; text: string }[] = groupGlosses(glosses).map(run => {
    if (!run.spelled) return { id: run.label, text: '' }

    /* Take source words off the queue until they account for the letters in
       this run, so each one is transliterated on its own and the space
       between them survives: अमन दीक्षित, not अमन्दिक्सित. */
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
      ? words.map(w => toDevanagari(w)).join(' ')
      : toDevanagari(run.label.split('-').join(''))
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
     place — the sequence is the sentence's spine and reordering it here
     would say something the avatar did not sign. */
  /* 'मुझे' is already in the NEED and SEE frames, so a leading MY would say
     it twice — the pronoun is carried by the verb, exactly as ISL carries it
     by where the sign is made. */
  const owned = verbs.includes('NEED') || verbs.includes('SEE') || verbs.includes('HELP')
  const parts = seq.filter(
    p =>
      p.id === null ||
      (!HI_WH[p.id] && HI_TIME[p.id] === undefined && p.id !== 'NO' && p.id !== 'PLEASE'
        && !VERBS.includes(p.id) && !!SIGN_BY_ID[p.id]
        && !(owned && p.id === 'MY')),
  )
  let np = ''
  parts.forEach((p, i) => {
    const word = p.id ? HI_NOUN[p.id] ?? SIGN_BY_ID[p.id]?.hi ?? p.id : p.text
    if (!i) { np = word; return }
    const prev = parts[i - 1]
    /* A possessive or an address is not a list item: 'मेरा सिर', never
       'मेरा और सिर'. */
    const glue =
      !p.id || !prev.id || prev.id === 'MY' || prev.id === 'YOU'
        || COMPOUND.has(`${prev.id}>${p.id}`)
        ? ' '
        : ' और '
    np += glue + word
  })

  let clause: string
  if (verbs.includes('NEED')) clause = `मुझे ${np || 'मदद'} चाहिए`
  else if (verbs.includes('SEE')) clause = `मुझे ${np || 'किसी'} से मिलना है`
  else if (verbs.includes('WAIT')) clause = `${np ? np + ' के लिए ' : ''}प्रतीक्षा कीजिए`
  else if (verbs.includes('COME')) clause = `${np ? np + ' के लिए ' : ''}आइए`
  else if (verbs.includes('GO')) clause = `${np || 'काउंटर'} में जाइए`
  else if (verbs.includes('PAY')) clause = `${np || 'शुल्क'} का भुगतान करना है`
  else if (verbs.includes('HELP')) clause = `मदद चाहिए${np && np !== 'मदद' ? ' — ' + np : ''}`
  else if (verbs.includes('NOT-UNDERSTAND')) clause = 'समझ नहीं आया'
  else if (verbs.includes('UNDERSTAND')) clause = 'समझ गया'
  else if (verbs.includes('FINISH')) clause = `${np || 'यह'} हो गया`
  else if (verbs.includes('DELAY')) clause = `${np || 'यह'} देरी से है`
  else if (verbs.includes('OPEN')) clause = `${np || 'यह'} खुला है`
  else if (verbs.includes('CLOSED')) clause = `${np || 'यह'} बंद है`
  else if (verbs.includes('SIGNATURE')) clause = `${np || 'फ़ॉर्म'} पर हस्ताक्षर करना है`
  else clause = np || SIGN_BY_ID[body[0]]?.hi || ''

  let out: string
  if (wh) {
    const obj = np || 'यह'
    out = wh === 'WHERE' ? `${obj} कहाँ है?`
      : wh === 'WHEN' ? `${obj} कब मिलेगा?`
      : wh === 'WHY' ? `${obj} क्यों चाहिए?`
      : wh === 'HOW-MANY' ? `${obj} कितने हैं?`
      : `${obj} क्या है?`
  } else {
    out = clause + (neg ? ' — नहीं' : '') + '।'
  }

  const prefix = time && HI_TIME[time] ? HI_TIME[time] + ' ' : ''
  const full = (polite ? 'कृपया ' : '') + prefix + out
  return { text: full.replace(/\s+/g, ' ').trim(), templated: false }
}

/* ---- inbound: Devanagari → the vocabulary ------------------------------ */

/* Hindi words that carry grammar rather than content. They are mapped onto
   the English function words the gloss pipeline already knows how to drop,
   so a spoken sentence does not come back covered in "cannot be signed". */
const HI_FUNCTION: Record<string, string> = {
  है: 'is', हैं: 'are', था: 'was', थी: 'was', थे: 'were', हूँ: 'am',
  का: 'of', की: 'of', के: 'of', को: 'to', में: 'in', पर: 'on',
  से: 'from', लिए: 'for', तक: 'to', ही: 'just', भी: 'so',
  यह: 'this', वह: 'that', ये: 'these', वो: 'that', कोई: 'a', एक: 'a',
  और: 'and', या: 'and', तो: 'then', जी: 'just',
  करना: 'do', करें: 'do', कीजिए: 'do', कर: 'do', गया: 'did', गयी: 'did',
  हो: 'be', होगा: 'will', होगी: 'will', मिलेगा: 'will', मिलेगी: 'will',
  लगेगा: 'will', सकता: 'can', सकती: 'can', रहा: 'is', रही: 'is',
}

/* Content words. The lexicon's own `hi` field is the spine; the extra
   entries are the forms a person at a counter actually says — inflections
   and the everyday synonym the citation form does not cover. */
const HI_LEX: Record<string, string> = {}
const hiAdd = (en: string, ...words: string[]) => words.forEach(w => { HI_LEX[w] = en })

ALL_SIGNS.forEach(s => {
  /* 'कल (बीता)' and friends carry a disambiguating note in brackets — the
     spoken word is what is in front of it. */
  const head = s.hi.replace(/\s*\(.*\)\s*/, '').trim()
  if (head) HI_LEX[head] = s.en
})

hiAdd('hello', 'नमस्ते', 'नमस्कार', 'हैलो')
hiAdd('thank you', 'धन्यवाद', 'शुक्रिया')
hiAdd('please', 'कृपया', 'प्लीज़')
hiAdd('sorry', 'माफ़', 'माफ़ी', 'क्षमा')
hiAdd('yes', 'हाँ', 'हां', 'जी हाँ')
hiAdd('no', 'नहीं', 'ना')
hiAdd('you', 'आप', 'तुम', 'आपको', 'आपका')
hiAdd('my', 'मेरा', 'मेरी', 'मेरे', 'मुझे', 'मुझको')
hiAdd('help', 'मदद', 'सहायता')
hiAdd('understand', 'समझ', 'समझा', 'समझी')
hiAdd('need', 'चाहिए', 'ज़रूरत', 'जरूरत', 'चाहिये')
hiAdd('see', 'देखना', 'मिलना', 'दिखाना', 'देखें')
hiAdd('come', 'आना', 'आइए', 'आइये', 'आओ')
hiAdd('go', 'जाना', 'जाइए', 'जाइये', 'जाओ')
hiAdd('wait', 'रुकिए', 'रुकिये', 'इंतज़ार', 'इंतजार', 'प्रतीक्षा')
hiAdd('doctor', 'डॉक्टर', 'डाक्टर', 'चिकित्सक')
hiAdd('hospital', 'अस्पताल', 'हॉस्पिटल')
hiAdd('medicine', 'दवा', 'दवाई', 'दवाइयाँ')
hiAdd('pain', 'दर्द', 'पीड़ा')
hiAdd('fever', 'बुखार', 'बुख़ार')
hiAdd('head', 'सिर', 'सर')
hiAdd('stomach', 'पेट')
hiAdd('blood', 'ख़ून', 'खून', 'रक्त')
hiAdd('test', 'जाँच', 'जांच', 'टेस्ट')
hiAdd('report', 'रिपोर्ट')
hiAdd('appointment', 'अपॉइंटमेंट', 'अपॉइंटमेण्ट', 'मुलाक़ात')
hiAdd('emergency', 'आपातकाल', 'इमरजेंसी', 'आपात')
hiAdd('injection', 'इंजेक्शन', 'सुई')
hiAdd('sick', 'बीमार', 'तबीयत')
hiAdd('form', 'फ़ॉर्म', 'फॉर्म', 'पर्चा')
hiAdd('signature', 'हस्ताक्षर', 'दस्तख़त', 'साइन')
hiAdd('money', 'पैसा', 'पैसे', 'रुपये', 'शुल्क', 'फ़ीस')
hiAdd('pay', 'भुगतान', 'जमा')
hiAdd('card', 'कार्ड')
hiAdd('number', 'नंबर', 'नम्बर', 'संख्या')
hiAdd('room', 'कमरा', 'कमरे', 'रूम')
hiAdd('open', 'खुला', 'खुली')
hiAdd('closed', 'बंद', 'बन्द')
hiAdd('meeting', 'बैठक', 'मीटिंग')
hiAdd('train', 'ट्रेन', 'गाड़ी', 'रेल')
hiAdd('delay', 'देरी', 'देर', 'लेट')
hiAdd('ticket', 'टिकट')
hiAdd('today', 'आज')
hiAdd('now', 'अभी', 'अब')
hiAdd('tomorrow', 'कल')
hiAdd('yesterday', 'बीते')
hiAdd('morning', 'सुबह', 'प्रातः')
hiAdd('time', 'समय', 'टाइम', 'वक़्त')
hiAdd('what', 'क्या')
hiAdd('where', 'कहाँ', 'कहां', 'किधर')
hiAdd('when', 'कब')
hiAdd('why', 'क्यों', 'क्यूँ')
hiAdd('how many', 'कितने', 'कितना', 'कितनी')
hiAdd('name', 'नाम')
hiAdd('good', 'अच्छा', 'ठीक')
hiAdd('bad', 'ख़राब', 'खराब')
hiAdd('finished', 'पूरा', 'ख़त्म', 'खत्म')
hiAdd('again', 'फिर', 'दोबारा')
hiAdd('more', 'ज़्यादा', 'अधिक')

/* 'समझ नहीं आया' is one sign, not two, so it is matched before the words
   inside it are read separately and turned into UNDERSTAND + NO. */
const HI_PHRASES: [string[], string][] = [
  [['समझ', 'नहीं', 'आया'], 'I don’t understand'],
  [['समझ', 'नहीं', 'आ', 'रहा'], 'I don’t understand'],
  [['नहीं', 'समझा'], 'I don’t understand'],
  [['धन्यवाद'], 'thank you'],
]

export const isDevanagari = (text: string) => /[ऀ-ॿ]/.test(text)

/**
 * Hindi text to the same GlossResult the English composer produces.
 *
 * Every Devanagari token is rewritten as the English word for its sign and
 * the sentence is then handed to `englishToGloss`, so clause splitting, ISL
 * ordering, dropping and fingerspelling are shared rather than reimplemented
 * — the two languages cannot disagree about grammar because only one of them
 * implements it.
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
    /* Not a sign and not grammar: a name, a place, a number. Romanised so
       the alphabet can spell it — 'अमन' is fingerspellable as A-M-A-N and
       is not out of vocabulary just because it was said in Hindi. */
    out.push(known ?? toLatin(w))
    i++
  }
  return englishToGloss(out.join(' ') + (/[?？]\s*$/.test(text) ? '?' : ''))
}

/** English or Hindi in, one gloss sequence out — whichever was typed or said. */
export const textToGloss = (text: string): GlossResult =>
  isDevanagari(text) ? hindiToGloss(text) : englishToGloss(text)

/* ---- what a caption shows ---------------------------------------------- */

export type Caption = {
  primary: string
  /** Null unless the setting asks for both scripts and Hindi exists. */
  secondary: string | null
  /** True when the Hindi shown was composed rather than taken from a table. */
  composed: boolean
}

/**
 * One sentence, rendered for the caption-language setting.
 *
 * `text` is the English the counter already holds; `glosses` is what it was
 * signed as. Hindi is derived from the glosses, never from the English — so
 * when there is no sign sequence there is no Hindi line, and the caption
 * falls back to English rather than showing an empty box or a guess.
 */
export function caption(text: string, glosses: string[], lang: CaptionLang): Caption {
  if (lang === 'en') return { primary: text, secondary: null, composed: false }

  /* Recover the word boundaries the gloss stream dropped, but only when the
     sentence actually contains a spelled run. */
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
