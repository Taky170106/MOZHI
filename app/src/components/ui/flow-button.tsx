'use client';

import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * FlowButton
 *
 * Structure and motion are unchanged from the source: an arrow slides in from
 * the left, the label shifts right, a circle scales up from the centre to fill
 * the pill, and the trailing arrow exits right.
 *
 * The only change is that the two hardcoded colours are now custom properties.
 * The original is written for a light ground — `#111111` text on transparent,
 * with a near-black circle expanding behind white text — which is invisible on
 * a black hero. Defaults below reproduce the original exactly, and a dark
 * ground just flips the pair:
 *
 *     style={{ '--flow-ink': '#fff', '--flow-on': '#000' }}
 */
interface FlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

export function FlowButton({
  text = 'Modern Button',
  className,
  style,
  ...props
}: FlowButtonProps) {
  return (
    <button
      style={
        {
          '--flow-ink': '#111111',
          '--flow-on': '#ffffff',
          /* Mirrors the heading's from-white / via-white-90 / to-white-30,
             expressed against --flow-ink so it inverts with the button. */
          /* Flat, not graded. On a black hero the fade read as a smudge
             behind the label; the button is two colours and nothing else. */
          /* Still an image, because it is applied as background-image — a bare
             colour there is invalid and the circle silently never paints,
             leaving black text on a black hero. */
          '--flow-fill': 'linear-gradient(var(--flow-ink), var(--flow-ink))',
          ...style,
        } as CSSProperties
      }
      className={cn(
        'group relative flex cursor-pointer items-center gap-1 overflow-hidden rounded-[100px]',
        'border-[1.5px] border-[color-mix(in_srgb,var(--flow-ink)_40%,transparent)] bg-transparent',
        'px-8 py-3 text-sm font-semibold text-[var(--flow-ink)]',
        'transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)]',
        // roundness stays put on hover — the pill morphing to a soft rect
        // reads as the button changing shape mid-press
        'hover:border-transparent hover:text-[var(--flow-on)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--flow-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        'active:scale-[0.95]',
        className,
      )}
      {...props}
    >
      {/* Left arrow (arr-2) */}
      <ArrowRight className="absolute left-[-25%] z-[9] h-4 w-4 fill-none stroke-[var(--flow-ink)] transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:left-4 group-hover:stroke-[var(--flow-on)]" />

      {/* Text */}
      <span className="relative z-[1] -translate-x-3 transition-all duration-[800ms] ease-out group-hover:translate-x-3">
        {text}
      </span>

      {/* Circle.
          The gradient is sized to the pill's own height rather than the
          circle's. The circle swells to 220px while the button is ~3.2em
          tall, so a full-height gradient would leave only its flat middle
          visible — the fade has to be packed into the band that actually
          shows, and centred so it lines up with the button. */}
      <span
        className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-no-repeat opacity-0 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:h-[220px] group-hover:w-[220px] group-hover:opacity-100"
        style={{
          backgroundImage: 'var(--flow-fill)',
          backgroundSize: '100% 3.2em',
          backgroundPosition: 'center',
        }}
      />

      {/* Right arrow (arr-1) */}
      <ArrowRight className="absolute right-4 z-[9] h-4 w-4 fill-none stroke-[var(--flow-ink)] transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:right-[-25%] group-hover:stroke-[var(--flow-on)]" />
    </button>
  );
}

export default FlowButton;
