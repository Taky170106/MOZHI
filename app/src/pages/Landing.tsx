import { useEffect, useRef } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { ParticleTextEffect, type Word } from '@/components/ui/particle-text-effect'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import { DotPattern } from '@/components/ui/dot-pattern'
import HeroScrollVideoReveal from '@/components/ui/hero-scroll-video-pin-reveal'
import { CinematicFooter } from '@/components/ui/motion-footer'
import { RarityField } from '@/components/ui/rarity-field'
import { VaniPanel } from '@/components/ui/vani-stage'
import { FlowButton } from '@/components/ui/flow-button'
const TAGLINE: Word[] = [
  { text: 'SIGN BECOMES WORD', color: '--cool-lit' },
  { text: 'WORD BECOMES SIGN', color: '--warm-mid' },
  { text: 'BARRIER DISAPPEARS', color: ['--cool-lit', '--warm-mid'] },
  { text: 'CONVERSATION BEGINS', color: '--warm-lit' },
  { text: 'MOZHI.', color: '#ffffff' },
]

export default function Landing() {
  /* The dot field runs the whole page, but it starts held back: under the
     hero it is a texture behind the tagline, and by the time the first
     section arrives it has come up to full strength. One field, two jobs,
     no seam between them. */
  const dots = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = dots.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1'
      return
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = Math.min(1, Math.max(0, scrollY / (innerHeight * 0.85)))
      el.style.opacity = String(0.72 + p * 0.28)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <RandomLetterSwapNav />

      {}
      <div ref={dots} className="landing-dots fixed inset-0 z-0" style={{ opacity: 0.72 }}>
        <DotPattern
          width={38}
          height={38}
          cx={1}
          cy={1}
          cr={1}
          className="h-screen fill-white/12 md:fill-white/[0.14]"
        />
      </div>

      <main id="main">
        <section className="relative flex h-screen w-full items-center justify-center overflow-hidden">
          {}
          <h1 className="sr-only">
            Sign becomes word. Word becomes sign. Barrier disappears.
            Conversation begins. Mozhi.
          </h1>

          {}
          <ParticleTextEffect
            words={TAGLINE}
            className="absolute inset-0 z-30 h-full w-full"
          />

          {}
          <div className="start-cta">
            <FlowButton
              text="Start"
              onClick={() => { window.location.hash = '#/counter' }}
              style={{ '--flow-ink': '#ffffff', '--flow-on': '#000000' } as React.CSSProperties}
            />
          </div>
        </section>

        {}
        <section className="relative z-10 flex flex-col overflow-hidden">
          <ContainerScroll
            titleComponent={
              <h2 className="get-gist">get the gist</h2>
            }
          >
            <VaniPanel />
          </ContainerScroll>
        </section>

        {}
        <HeroScrollVideoReveal
          topText={<RarityField className="mx-auto max-w-6xl" />}
          headingText={
            <>
              Being understood is half a conversation. <br />
              Mozhi closes the loop.
            </>
          }
          tags={[
            { text: 'Signs back', background: '#FFFFFF', color: '#0A0A0A' },
            { text: 'Runs offline', background: '#2B4FD8', color: '#FFFFFF' },
            { text: 'Nothing recorded', background: '#C2334B', color: '#FFFFFF' },
            { text: 'Reads the face', background: '#17A0B4', color: '#04121A' },
          ]}
          subText="Every frame becomes 543 coordinates. Nothing else is kept."
          bottomText={
            <>
              The answer arrives
              <br />
              while they are still looking.
            </>
          }
        />
      </main>

      {}
      <CinematicFooter />
    </>
  )
}
