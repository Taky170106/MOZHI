import RandomLetterSwapNav from '@/components/ui/m-random-letter-swap-1'

/**
 * The stand-in for a surface the nav lists but that is not built yet.
 *
 * It keeps the nav, so the product's shape stays visible and a visitor who
 * lands here can leave in one click. It says what the screen will be rather
 * than only that it is missing — a bare "coming soon" reads as an oversight,
 * a named surface reads as a plan.
 */

const COPY: Record<string, { title: string; line: string }> = {
  vocabulary: {
    title: 'Vocabulary',
    line: 'Every sign the counter can read and produce — handshape, location, movement, and what each one is most often confused with.',
  },
  archive: {
    title: 'Archive',
    line: 'The turn log for this counter, including the turns that went badly: low confidence, repeat requests, and replies that could only be sent as text.',
  },
  settings: {
    title: 'Settings',
    line: 'Caption language and size, avatar speed, the landmark overlay, and how long a shift’s transcript is kept.',
  },
}

export default function InDevelopment({ surface }: { surface: string }) {
  const copy = COPY[surface] ?? { title: 'This screen', line: '' }

  return (
    <>
      <RandomLetterSwapNav />

      <main id="main" className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-[34rem] text-center">
          <p className="m mb-5 text-[0.68rem] uppercase tracking-[0.18em] text-white/35">
            In development
          </p>

          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            {copy.title}
          </h1>

          {copy.line && (
            <p className="mx-auto mt-5 max-w-[30rem] text-[0.98rem] leading-relaxed text-white/45">
              {copy.line}
            </p>
          )}

          <a
            href="#/counter"
            className="mt-9 inline-block rounded-full border border-white/15 px-6 py-2.5 text-[0.82rem] text-white/70 transition-colors hover:border-white/35 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Open the Counter
          </a>
        </div>
      </main>
    </>
  )
}
