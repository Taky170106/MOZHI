import { useEffect, useMemo, useState } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import SigningAvatar from '@/components/SigningAvatar'
import { useSignPlayer } from '@/lib/hooks'
import { ALPHABET, DIGITS } from '@/lib/alphabet'
import { ALL_SIGNS } from '@/lib/lexicon'
import { useLocal } from '@/lib/hooks'
import '@/styles/counter.css'
import '@/styles/settings.css'
import '@/styles/console.css'

type Group = 'letters' | 'digits' | 'words'
type Verdict = 'pass' | 'fail'

type Item = {
  id: string
  label: string
  hands: 1 | 2
  note: string
  reference: string | null
}

export default function Review() {
  const [group, setGroup] = useState<Group>('letters')
  const [i, setI] = useState(0)
  const [marks, setMarks] = useLocal<Record<string, Verdict>>('sanket.review', {})

  const items: Item[] = useMemo(() => {
    if (group === 'words') {
      return ALL_SIGNS.map(s => ({
        id: s.id,
        label: s.en,
        hands: s.hands,
        note: `${s.handshape} · ${s.location} · ${s.movement}`,
        reference: null,
      }))
    }
    const src = group === 'letters' ? ALPHABET : DIGITS
    return src.map(l => ({
      id: l.id,
      label: l.letter,
      hands: l.hands,
      note: `${l.confidence} · ${l.samples} frames · deviation ${l.mad.toFixed(3)} rad`,
      reference: `/corpus/img/${l.letter}/1.jpg`,
    }))
  }, [group])

  const item = items[Math.min(i, items.length - 1)]
  const player = useSignPlayer(item ? [item.id] : [], {
    autoplay: true, loop: true, speed: 0.7, idle: true,
  })

  useEffect(() => { setI(0) }, [group])

  const mark = (v: Verdict) => {
    setMarks({ ...marks, [item.id]: v })
    setI(n => Math.min(items.length - 1, n + 1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI(n => Math.min(items.length - 1, n + 1))
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1))
      if (e.key === 'y' || e.key === 'Y') mark('pass')
      if (e.key === 'n' || e.key === 'N') mark('fail')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const done = items.filter(x => marks[x.id]).length
  const passed = items.filter(x => marks[x.id] === 'pass').length

  if (!item) return null

  return (
    <>
      <div className="counter-grid" aria-hidden="true" />
      <RandomLetterSwapNav />

      <main id="main" className="set-shell">
        <header className="set-head">
          <p className="set-eyebrow">Review against the reference</p>
          <h1 className="set-title">Is this the right sign?</h1>
          <p className="set-sub">
            The avatar on the left is playing what the data says. Compare it with the
            reference on the right, then mark it. Nothing is called verified until it
            passes here. <b>Y</b> to pass, <b>N</b> to fail, arrow keys to move.
          </p>
        </header>

        <div className="con-bar">
          <div className="seg" role="group" aria-label="What to review">
            {(['letters', 'digits', 'words'] as Group[]).map(g => (
              <button key={g} className={group === g ? 'is-on' : ''}
                aria-pressed={group === g} onClick={() => setGroup(g)}>
                {g === 'letters' ? `Letters ${ALPHABET.length}`
                  : g === 'digits' ? `Digits ${DIGITS.length}`
                  : `Words ${ALL_SIGNS.length}`}
              </button>
            ))}
          </div>
          <div className="rev-count">
            {done}/{items.length} reviewed · {passed} passed
          </div>
        </div>

        <section className="rev">
          <div className="rev-stage">
            <div className="rev-pane">
              <span className="rev-pane-tag">Avatar</span>
              <SigningAvatar frame={player.frame} className="absolute inset-0" label={`${item.label} signed`} />
            </div>
            <div className="rev-pane">
              <span className="rev-pane-tag">Reference</span>
              {item.reference
                ? <img src={item.reference} alt={`Reference for ${item.label}`} className="rev-ref" />
                : <p className="rev-none">
                    No recorded reference for this sign. It is authored notation,
                    not measured — judge it against the ISLRTC dictionary.
                  </p>}
            </div>
          </div>

          <div className="rev-bar">
            <div className="rev-id">
              <strong>{item.label}</strong>
              <span>{item.hands === 2 ? 'two-handed' : 'one-handed'} · {item.note}</span>
            </div>
            <div className="rev-actions">
              <button onClick={() => setI(n => Math.max(0, n - 1))} disabled={i === 0}>←</button>
              <button className="rev-fail" onClick={() => mark('fail')}>Wrong (N)</button>
              <button className="rev-pass" onClick={() => mark('pass')}>Correct (Y)</button>
              <button onClick={() => setI(n => Math.min(items.length - 1, n + 1))}
                disabled={i >= items.length - 1}>→</button>
            </div>
          </div>

          <ul className="rev-strip">
            {items.map((x, n) => (
              <li key={x.id}>
                <button
                  className={`${n === i ? 'is-on' : ''} ${marks[x.id] ? `is-${marks[x.id]}` : ''}`}
                  onClick={() => setI(n)}
                >
                  {x.label.length > 6 ? x.label.slice(0, 6) : x.label}
                </button>
              </li>
            ))}
          </ul>

          <details className="rev-out">
            <summary>Export the verdicts</summary>
            <pre>{JSON.stringify(marks, null, 2)}</pre>
          </details>
        </section>
      </main>
    </>
  )
}
