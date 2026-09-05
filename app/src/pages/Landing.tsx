import { useEffect } from 'react'
import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'
import { ParticleTextEffect, type Word } from '@/components/ui/particle-text-effect'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import { renderCanvas } from '@/components/ui/canvas'
import { DotPattern } from '@/components/ui/dot-pattern'
import HeroScrollVideoReveal from '@/components/ui/hero-scroll-video-pin-reveal'
import { CinematicFooter } from '@/components/ui/motion-footer'

/* The hero tagline. One beat per particle word, cycling forever — the loop
   closing and starting again is the argument, not a screensaver.

   Colour is the direction of travel, straight from tokens.css: COOL/violet is
   inbound (visitor → staff), WARM/magenta is outbound (staff → visitor). The
   first two beats ARE the two pipelines, one each way, so they take those two
   colours literally. The third mixes them, because a barrier disappearing is
   exactly the moment the two channels stop being separate things. Then the
   name resolves to white.

   Only the last beat takes a full stop. The four before it are the mechanism;
   the period lands once, on the product. */
const TAGLINE: Word[] = [
  { text: 'SIGN BECOMES WORD', color: '--cool-lit' },
  { text: 'WORD BECOMES SIGN', color: '--warm-mid' },
  { text: 'BARRIER DISAPPEARS', color: ['--cool-lit', '--warm-mid'] },
  { text: 'CONVERSATION BEGINS', color: '--warm-lit' },
  { text: 'SANKET.', color: '#ffffff' },
]

/**
 * The landing page — and the only place the cursor trail exists.
 *
 * The canvas and its rAF loop live here rather than in the app shell, so a
 * product screen cannot inherit them by accident. Navigating away unmounts
 * this component, the effect cleanup runs, and the loop and all six of its
 * listeners are torn down.
 */
export default function Landing() {
  useEffect(() => renderCanvas(), [])

  return (
    <>
      <RandomLetterSwapNav />

      {/* One page-wide stacking order, and everything below depends on it:
            z-0    dot field  (first in the document, so the opaque hero — which
                              is positioned but z-auto — still covers it)
            z-[5]  cursor trail
            z-10   section content, all of it transparent
            z-50   nav
          The trail was disappearing because sections below the hero painted
          their own opaque background over it. With those transparent, both
          fixed layers read through every section. */}
      <DotPattern
        cr={1}
        cy={1}
        className="fixed inset-0 z-0 h-screen fill-white/20 md:fill-white/25"
      />

      {/* Under the content and nav, so the trail reads across the page without
          ever sitting on top of type. Never takes the pointer. */}
      <canvas
        id="canvas"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[5] h-full w-full"
      />

      <main id="main">
        <section className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-black">
          {/* The page's real heading. The canvas is aria-hidden — particles
              are not text to anything that is not looking at them — so the
              tagline is stated once, here, for screen readers, for the
              document outline and for anything crawling the page. */}
          <h1 className="sr-only">
            Sign becomes word. Word becomes sign. Barrier disappears.
            Conversation begins. Sanket.
          </h1>

          {/* Fills the section rather than sitting in it: the words are the
              hero, so they get the whole frame. Above the dot field and the
              cursor trail, below the nav. */}
          <ParticleTextEffect
            words={TAGLINE}
            className="absolute inset-0 z-30 h-full w-full"
          />
        </section>

        {/* Scroll sequence. No leading padding — the demo ships with
            pt-[1000px], which would drop it a full screen below the fold; this
            starts the moment the hero ends. */}
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
            {/* Image slot — Aman is supplying the artwork. Sized and cropped
                exactly as the real one will be, so dropping it in changes
                nothing about the layout. */}
            <div className="mx-auto flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-zinc-900 text-center">
              <p className="mono text-xs tracking-[0.14em] text-white/40 uppercase">
                Counter screenshot goes here
              </p>
            </div>
          </ContainerScroll>
        </section>

        {/* Copy is passed in rather than edited into the component, so the
            component stays reusable and the page owns its words. Every claim
            below is from the brief: the interpreter ratio (§2), the one-way
            problem (§1), the three product claims (§3.3) and the corpus
            census (§3.5). The video source is deliberately left at its
            default — that swap is Aman's. */}
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
            /* Four claims, four colours taken from the hero itself: the beams
               are drawn on a red, a blue and a cyan-white channel, and the
               differentiator gets the white.

               These have to carry real luminance. The badges reveal by wiping
               a clip-path across themselves, and a near-black badge wiping
               across a black page is an animation nobody can see — which is
               exactly what happened when these were tuned down to #0D1428 and
               friends. Colour here is legibility, not decoration. */
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

      {/* Outside <main>, where a footer belongs. It reveals itself by clipping
          a fixed element to a normal-flow box, so it needs no cooperation from
          the sections above it — copy and links are placeholder for now. */}
      <CinematicFooter />
    </>
  )
}
