/* ============================================================
   translit.ts — the same name in both scripts.

   Fingerspelling is a property of the SIGN, not of the caption. A name the
   vocabulary does not carry is spelled letter by letter on the hands, and
   the letters are Latin because the manual alphabet is Latin — but the
   Hindi caption under it must still read as Hindi. "मुझे AMAN से मिलना है"
   is two scripts in one sentence; "मुझे अमन से मिलना है" is a sentence.

   So this converts between the two scripts for DISPLAY only. What the hands
   do is untouched: the gloss sequence still carries FS-A FS-M FS-A FS-N.

   Both directions are approximate by nature — Devanagari writes sounds the
   Latin alphabet does not, and vice versa. They are good enough for a name
   or a room number at a counter, which is all they are asked for.
   ============================================================ */

/* Consonants, longest first so 'chh' is read before 'ch' before 'c'. */
const CONSONANTS: [string, string][] = [
  ['chh', 'छ'], ['sh', 'श'], ['ch', 'च'], ['kh', 'ख'], ['gh', 'घ'],
  ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'],
  ['ng', 'ंग'], ['ny', 'ञ'],
  ['k', 'क'], ['g', 'ग'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'],
  ['p', 'प'], ['f', 'फ़'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'],
  ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'],
  ['z', 'ज़'], ['x', 'क्स'], ['q', 'क़'], ['c', 'क'],
]

/* Vowels in both forms: standalone at the start of a syllable, matra after
   a consonant. The inherent 'a' is written as nothing, which is why 'aman'
   comes out अमन and not अमअनअ. */
const VOWELS: [string, string, string][] = [
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'],
  ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'],
  ['e', 'ए', 'े'], ['o', 'ओ', 'ो'],
]

const HALANT = '्'

/**
 * A Latin word as Devanagari, for a caption.
 *
 * Digits pass through unchanged — a room number is the same in both scripts,
 * and rewriting 4 as ४ would make it harder to read out, not easier.
 */
export function toDevanagari(word: string): string {
  const w = word.toLowerCase()
  if (!/[a-z]/.test(w)) return word

  let out = ''
  let i = 0
  /* True when the last thing written was a consonant carrying no vowel, so
     the next consonant has to be joined to it with a halant. */
  let pending = false

  while (i < w.length) {
    const rest = w.slice(i)

    if (!/^[a-z]/.test(rest)) {
      if (pending) { out += HALANT; pending = false }
      out += rest[0]
      i += 1
      continue
    }

    const cons = CONSONANTS.find(([lat]) => rest.startsWith(lat))
    if (cons) {
      if (pending) out += HALANT
      out += cons[1]
      i += cons[0].length
      pending = true

      const after = w.slice(i)
      const vow = VOWELS.find(([lat]) => after.startsWith(lat))
      if (vow) {
        /* A Latin word ending in 'a' is almost always the long vowel in
           Hindi — Sharma is शर्मा, not शर्म. Inside the word the same 'a'
           is the inherent one and is written as nothing. */
        out += vow[0] === 'a' && after.length === 1 ? 'ा' : vow[2]
        i += vow[0].length
        pending = false
      }
      continue
    }

    const vow = VOWELS.find(([lat]) => rest.startsWith(lat))
    if (vow) {
      if (pending) { out += HALANT; pending = false }
      out += vow[1]
      i += vow[0].length
      continue
    }

    i += 1
  }

  return out
}

/* The reverse map, built from the same table so the two cannot drift. */
const DEVA_CONS: Record<string, string> = {}
CONSONANTS.forEach(([lat, dev]) => { if (!DEVA_CONS[dev]) DEVA_CONS[dev] = lat })
Object.assign(DEVA_CONS, {
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'ऩ': 'n',
  'ङ': 'ng', 'ष': 'sh', 'ऱ': 'r', 'ळ': 'l', 'ड़': 'r', 'ढ़': 'rh',
  'ज़': 'z', 'फ़': 'f', 'ख़': 'kh', 'ग़': 'g', 'क़': 'q',
})

const DEVA_VOWEL: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri',
}

const DEVA_MATRA: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri',
}

/**
 * A Devanagari word as Latin letters, so it can be fingerspelled.
 *
 * The manual alphabet has 26 letters and none of them is a matra, so a name
 * said in Hindi has to be romanised before it can be spelled at all. This is
 * what makes "मुझे अमन से मिलना है" spellable rather than out of vocabulary.
 */
export function toLatin(word: string): string {
  const chars = [...word]
  let out = ''
  /* Whether the LAST thing written was the unwritten inherent 'a'. That one
     is dropped word-finally ('अमन' is Aman); a matra's vowel is not
     ('शर्मा' is Sharma, never Sharm). */
  let inherent = false

  chars.forEach((ch, i) => {
    const next = chars[i + 1]
    if (ch === HALANT) { inherent = false; return }
    if (ch === 'ं' || ch === 'ँ') { out += 'n'; inherent = false; return }
    if (DEVA_MATRA[ch]) { out += DEVA_MATRA[ch]; inherent = false; return }
    if (DEVA_VOWEL[ch]) { out += DEVA_VOWEL[ch]; inherent = false; return }
    if (DEVA_CONS[ch]) {
      out += DEVA_CONS[ch]
      /* The inherent 'a' is only there when nothing else claims the slot —
         a matra writes its own vowel and a halant deletes it outright. */
      const claimed = next !== undefined && (!!DEVA_MATRA[next] || next === HALANT)
      if (!claimed) out += 'a'
      inherent = !claimed
      return
    }
    if (/[a-z0-9]/i.test(ch)) { out += ch; inherent = false }
  })

  return inherent ? out.replace(/a$/, '') : out
}
