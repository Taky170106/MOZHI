import { useEffect } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { ParticleTextEffect, type Word } from '@/components/ui/particle-text-effect'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import { renderCanvas } from '@/components/ui/canvas'
import { DotPattern } from '@/components/ui/dot-pattern'
import HeroScrollVideoReveal from '@/components/ui/hero-scroll-video-pin-reveal'
import { CinematicFooter } from '@/components/ui/motion-footer'
const TAGLINE: Word[] = [
  { text: 'SIGN BECOMES WORD', color: '--cool-lit' },
  { text: 'WORD BECOMES SIGN', color: '--warm-mid' },
  { text: 'BARRIER DISAPPEARS', color: ['--cool-lit', '--warm-mid'] },
  { text: 'CONVERSATION BEGINS', color: '--warm-lit' },
  { text: 'SANKET.', color: '#ffffff' },
]

export default function Landing() {
  useEffect(() => renderCanvas(), [])

  return (
    <>
      <RandomLetterSwapNav />

      {}
      <DotPattern
        cr={1}
        cy={1}
        className="fixed inset-0 z-0 h-screen fill-white/20 md:fill-white/25"
      />

      {}
      <canvas
        id="canvas"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[5] h-full w-full"
      />

      <main id="main">
        <section className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-black">
          {}
          <h1 className="sr-only">
            Sign becomes word. Word becomes sign. Barrier disappears.
            Conversation begins. Sanket.
          </h1>

          {}
          <ParticleTextEffect
            words={TAGLINE}
            className="absolute inset-0 z-30 h-full w-full"
          />
        </section>

        {}
        <section className="relative z-10 flex flex-col overflow-hidden">
          <ContainerScroll
            titleComponent={
              <>
                <h2 className="text-4xl font-semibold text-white">
                  A deaf visitor and a clerk, one screen <br />
                  <span className="mt-1 text-4xl font-bold leading-none md:text-[6rem]">
                    The Counter
                  </span>
                </h2>
              </>
            }
          >
            {}
            <div className="mx-auto flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-zinc-900 text-center">
              <p className="mono text-xs tracking-[0.14em] text-white/40 uppercase">
                Counter screenshot goes here
              </p>
            </div>
          </ContainerScroll>
        </section>

        {}
        <HeroScrollVideoReveal
          topText={
            <>
              One certified interpreter
              <br />
              for every 60,000 deaf people.
            </>
          }
          headingText={
            <>
              Being understood is half a conversation. <br />
              Sanket closes the loop.
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
