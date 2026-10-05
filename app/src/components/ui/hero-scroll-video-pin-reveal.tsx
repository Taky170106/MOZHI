'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(ScrollTrigger, SplitText);

export interface TagItem {
  id?: string;
  text: string;
  background: string;
  color?: string;
}

export interface HeroScrollVideoRevealProps {
  topText?: React.ReactNode;
  headingText?: React.ReactNode;
  tags?: TagItem[];
  subText?: string;
  videoSrc?: string;
  bottomText?: React.ReactNode;
  badgeImgSrc?: string;
  className?: string;
}

const DEFAULT_TAGS: TagItem[] = [
  { text: 'Quiet peaks', background: '#1B211A', color: '#ffffff' },
  { text: 'Pure air energy', background: '#628141', color: '#ffffff' },
  { text: 'Endlessly renewable', background: '#EBD5AB', color: '#444444' },
  { text: 'Clean as alpine snow', background: '#2F5755', color: '#ffffff' },
];

export const HeroScrollVideoReveal: React.FC<HeroScrollVideoRevealProps> = ({
  topText = (
    <>
      Built to flow with your story,
      <br />
      not fight it
    </>
  ),
  headingText = (
    <>
      Step into mountain calm <br />
      Nature tells the story.
    </>
  ),
  tags = DEFAULT_TAGS,
  subText = 'And the journey continues beyond the summit...',
  videoSrc = '/media/mozhi-film.mp4',
  bottomText = (
    <>
      Where every scroll feels
      <br />
      intentional
    </>
  ),
  badgeImgSrc,
  className = '',
}) => {
  const benefitRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const paraRef = useRef<HTMLParagraphElement>(null);
  const tagRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* The film runs silent on its own so the section is never a dead
     rectangle, and the badge is the only thing that turns sound on. One
     click starts it from the top with audio; when it finishes it drops
     back to the silent loop it came from. */
  const [withSound, setWithSound] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = withSound;

  /* The silent loop only runs while the section is on screen, and leaving
     it takes the sound with it — nobody should hear the film play from a
     part of the page they have already scrolled past. */
  useEffect(() => {
    const v = videoRef.current;
    const box = videoBoxRef.current;
    if (!v || !box) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
          if (soundRef.current) {
            v.muted = true;
            v.loop = true;
            setWithSound(false);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(box);
    return () => io.disconnect();
  }, []);

  const toggleSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (withSound) {
      v.muted = true;
      v.loop = true;
      setWithSound(false);
      v.play().catch(() => {});
    } else {
      v.muted = false;
      v.loop = false;
      v.currentTime = 0;
      setWithSound(true);
      v.play().catch(() => {
        v.muted = true;
        v.loop = true;
        setWithSound(false);
      });
    }
  }, [withSound]);

  const onEnded = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    setWithSound(false);
    v.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
    }

    let lenis: any = null;
    let lenisTicker: ((time: number) => void) | null = null;
    let disposed = false;

    import('lenis')
      .then(({ default: Lenis }) => {
        if (disposed) return;
        lenis = new Lenis({ smooth: true } as any);
        lenis.on('scroll', ScrollTrigger.update);
        lenisTicker = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(lenisTicker);
        gsap.ticker.lagSmoothing(0);
      })
      .catch(() => {});

    let split: any = null;
    let words: Element[] = [];
    try {
      split = new SplitText(paraRef.current, {
        type: 'words',
        wordsClass: 'reveal-word inline-block origin-left mr-[0.25em] will-change-transform',
      });
      words = split.words;
    } catch {
      if (paraRef.current) {
        words = Array.from(paraRef.current.querySelectorAll('.reveal-word'));
      }
    }

    if (words && words.length > 0) {
      gsap.set(words, { opacity: 0, rotate: 8, yPercent: 30 });
    }

    const revealTl = gsap.timeline({
      scrollTrigger: {
        trigger: benefitRef.current,
        start: 'top 70%',
        end: 'top -10%',
        scrub: 1.5,
      },
    });

    if (words && words.length > 0) {
      revealTl.to(words, {
        stagger: { amount: 1.4 },
        opacity: 1,
        rotate: 0,
        yPercent: 0,
        ease: 'power1.inOut',
      });
    }

    tagRefs.current.forEach((tagEl) => {
      if (tagEl) {
        revealTl.to(
          tagEl,
          {
            duration: 1,
            opacity: 1,
            clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
            ease: 'circ.out',
          },
          '>-0.4'
        );
      }
    });

    const mm = gsap.matchMedia();
    mm.add('(max-width: 639.9px)', () => {
      gsap.set(videoBoxRef.current, { clipPath: 'circle(18% at 50% 50%)' });

      const vpTl = gsap.timeline({
        scrollTrigger: {
          trigger: videoWrapperRef.current,
          start: 'top top',
          end: '+=1500',
          scrub: 1.2,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          onRefresh: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
          onToggle: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
        },
      });

      vpTl.fromTo(
        videoBoxRef.current,
        { clipPath: 'circle(18% at 50% 50%)' },
        { clipPath: 'circle(150% at 50% 50%)', ease: 'none' }
      );
    });

    mm.add('(min-width: 640px) and (max-width: 1023.9px)', () => {
      gsap.set(videoBoxRef.current, { clipPath: 'circle(12% at 50% 50%)' });

      const vpTl = gsap.timeline({
        scrollTrigger: {
          trigger: videoWrapperRef.current,
          start: 'top top',
          end: '+=2000',
          scrub: 1.3,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          onRefresh: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
          onToggle: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
        },
      });

      vpTl.fromTo(
        videoBoxRef.current,
        { clipPath: 'circle(12% at 50% 50%)' },
        { clipPath: 'circle(150% at 50% 50%)', ease: 'none' }
      );
    });

    mm.add('(min-width: 1024px)', () => {
      gsap.set(videoBoxRef.current, { clipPath: 'circle(8% at 50% 50%)' });

      const vpTl = gsap.timeline({
        scrollTrigger: {
          trigger: videoWrapperRef.current,
          start: 'top top',
          end: '+=2500',
          scrub: 1.5,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          onRefresh: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
          onToggle: (self: any) => {
            if (self.spacer) self.spacer.style.backgroundColor = 'transparent';
            if (self.pin) self.pin.style.backgroundColor = 'transparent';
          },
        },
      });

      vpTl.fromTo(
        videoBoxRef.current,
        { clipPath: 'circle(8% at 50% 50%)' },
        { clipPath: 'circle(150% at 50% 50%)', ease: 'none' }
      );
    });

    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 100);
    return () => {
      clearTimeout(refreshId);
      disposed = true;
      if (split && split.revert) split.revert();
      revealTl.kill();
      mm.revert();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      if (lenis && lenisTicker) {
        gsap.ticker.remove(lenisTicker);
        lenis.destroy();
      }
    };
  }, []);

  return (
    <div
      /* clip, not hidden: `overflow-x: hidden` makes this div a scroll
         container, and a sticky descendant then sticks to THIS box instead
         of the viewport — which silently disables the rarity field's hold.
         `clip` trims the same overflow without becoming a scrollport. */
      className={`w-full min-h-screen bg-transparent text-[#f3f4f6] font-sans overflow-x-clip ${className}`}
      style={{ backgroundColor: 'transparent', color: '#f3f4f6' }}
    >
      {}

      {}
      <section
        className="w-full min-h-screen flex justify-center items-center text-center px-4 sm:px-8 py-8 text-[clamp(1.8rem,4.5vw,4.5rem)] font-bold tracking-tight leading-tight text-white relative z-10 bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      >
        {topText}
      </section>

      {}
      <section
        ref={benefitRef}
        className="relative w-full min-h-[140vh] md:min-h-[160vh] pb-16 md:pb-20 bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      >
        <div
          className="max-w-5xl mx-auto px-4 sm:px-6 py-16 md:py-24 flex flex-col items-center text-center relative z-10 bg-transparent"
          style={{ backgroundColor: 'transparent' }}
        >
          {}
          <div className="w-full mb-8 sm:mb-12 md:mb-14">
            <p
              ref={paraRef}
              className="text-[clamp(2rem,5vw,5rem)] font-extrabold tracking-tight leading-tight text-white overflow-visible"
            >
              {headingText}
            </p>
          </div>

          {}
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-4 max-w-4xl mx-auto my-4 sm:my-6 mb-8 sm:mb-14">
            {tags.map((tag, idx) => (
              <div
                key={tag.id || `tag-${idx}`}
                ref={(el) => {
                  tagRefs.current[idx] = el;
                }}
                className="px-5 sm:px-8 py-2.5 sm:py-4 rounded-full text-[clamp(0.95rem,2vw,1.8rem)] font-semibold tracking-tight opacity-0 shadow-2xl will-change-[clip-path,opacity]"
                style={{
                  backgroundColor: tag.background,
                  color: tag.color || '#ffffff',
                  clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)',
                }}
              >
                {tag.text}
              </div>
            ))}
          </div>

          {subText && (
            <p className="text-[clamp(0.95rem,1.5vw,1.35rem)] text-zinc-400 font-normal max-w-xl mt-2 sm:mt-4 px-4">
              {subText}
            </p>
          )}
        </div>

        {}
        <div className="relative w-full bg-transparent" style={{ backgroundColor: 'transparent' }}>
          <div
            ref={videoWrapperRef}
            className="w-full h-screen flex justify-center items-center relative overflow-hidden bg-transparent"
            style={{ backgroundColor: 'transparent' }}
          >
            {}
            <div
              className="absolute inset-0 w-full h-full pointer-events-none bg-transparent"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'transparent',
                zIndex: 1,
              }}
            />

            <div
              ref={videoBoxRef}
              className="relative w-full h-full overflow-hidden flex justify-center items-center bg-transparent will-change-[clip-path]"
              style={{ backgroundColor: 'transparent', zIndex: 2 }}
            >
              {}
              {}
              <div
                aria-hidden="true"
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 z-20 pointer-events-none animate-[spin_18s_linear_infinite] select-none transition-opacity duration-500 ${withSound ? 'opacity-0' : 'opacity-90'}`}
              >
                {badgeImgSrc ? (
                  <img src={badgeImgSrc} alt="" className="w-full h-full" />
                ) : (
                  <svg viewBox="0 0 200 200" className="w-full h-full">
                    <defs>
                      <path
                        id="sanket-play-ring"
                        d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"
                        fill="none"
                      />
                    </defs>
                    <text
                      fill="currentColor"
                      className="text-white"
                      style={{
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        fontSize: '15px',
                        letterSpacing: '0.34em',
                      }}
                    >
                      <textPath href="#sanket-play-ring" startOffset="0">
                        PLAY VIDEO · PLAY VIDEO · PLAY VIDEO ·
                      </textPath>
                    </text>
                  </svg>
                )}
              </div>

              {}
              {/* No autoPlay and no eager preload: the file is 32 MB, and
                  both of those start pulling it the moment the landing page
                  opens, three sections before anyone can see it. The
                  IntersectionObserver above already calls play() when the
                  section arrives, which is the right moment to spend it. */}
              <video
                ref={videoRef}
                muted
                loop
                playsInline
                preload="metadata"
                onEnded={onEnded}
                className="w-full h-full object-cover bg-transparent"
                style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: 'transparent' }}
              >
                <source src={videoSrc} type="video/mp4" />
              </video>

              {}
              <button
                type="button"
                onClick={toggleSound}
                aria-label={withSound ? 'Pause the film' : 'Play the film with sound'}
                className="group absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <span
                  className={`flex w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/40 shadow-xl transition-all duration-300 group-hover:bg-white/30 group-hover:scale-105 ${withSound ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                >
                  {withSound ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 fill-white">
                      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
                      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 translate-x-[1px] fill-white">
                      <path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.2-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {}
      <section
        className="w-full min-h-screen flex justify-center items-center text-center px-4 sm:px-8 py-8 text-[clamp(1.8rem,4.5vw,4.5rem)] font-bold tracking-tight leading-tight text-white relative z-10 bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      >
        {bottomText}
      </section>
    </div>
  );
};

export default HeroScrollVideoReveal;
