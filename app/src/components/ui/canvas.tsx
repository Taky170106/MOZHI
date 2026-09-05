/* Mouse trail — springy polylines chasing the cursor, drawn additively so
   they bloom where they overlap. The simulation is the original, untouched.

   Four changes, all of them defects rather than taste:

   1. The move handler called `e.preventDefault()` on every mousemove AND
      touchmove. On touch that cancels the scroll gesture outright — the page
      becomes unscrollable on a phone. Removed.
   2. `window.addEventListener("blur", () => ctx.running = true)` set running
      to TRUE on blur, so the loop never paused. The matching focus handler
      only restarts when `!running`, which shows the intent. Now `false`.
   3. The canvas was sized `innerWidth - 20` with no devicePixelRatio, leaving
      a 20px dead strip and rendering at half resolution on a retina display.
   4. Nothing was ever removed, so a second mount stacked another set of
      listeners and a second rAF loop. `renderCanvas` now returns a teardown.
*/

// @ts-ignore
function n(e) {
  // @ts-ignore
  this.init(e || {});
}
n.prototype = {
  // @ts-ignore
  init: function (e) {
    // @ts-ignore
    this.phase = e.phase || 0;
    // @ts-ignore
    this.offset = e.offset || 0;
    // @ts-ignore
    this.frequency = e.frequency || 0.001;
    // @ts-ignore
    this.amplitude = e.amplitude || 1;
  },
  update: function () {
    return (
      // @ts-ignore
      (this.phase += this.frequency),
      // @ts-ignore
      (e = this.offset + Math.sin(this.phase) * this.amplitude)
    );
  },
  value: function () {
    return e;
  },
};

// @ts-ignore
function Line(e) {
  // @ts-ignore
  this.init(e || {});
}

Line.prototype = {
  // @ts-ignore
  init: function (e) {
    // @ts-ignore
    this.spring = e.spring + 0.1 * Math.random() - 0.05;
    // @ts-ignore
    this.friction = E.friction + 0.01 * Math.random() - 0.005;
    // @ts-ignore
    this.nodes = [];
    for (var t, n = 0; n < E.size; n++) {
      // @ts-ignore
      t = new Node();
      // @ts-ignore
      t.x = pos.x;
      // @ts-ignore
      t.y = pos.y;
      // @ts-ignore
      this.nodes.push(t);
    }
  },
  update: function () {
    // @ts-ignore
    let e = this.spring,
      // @ts-ignore
      t = this.nodes[0];
    // @ts-ignore
    t.vx += (pos.x - t.x) * e;
    // @ts-ignore
    t.vy += (pos.y - t.y) * e;
    // @ts-ignore
    for (var n, i = 0, a = this.nodes.length; i < a; i++)
      // @ts-ignore
      (t = this.nodes[i]),
        0 < i &&
          // @ts-ignore
          ((n = this.nodes[i - 1]),
          (t.vx += (n.x - t.x) * e),
          (t.vy += (n.y - t.y) * e),
          (t.vx += n.vx * E.dampening),
          (t.vy += n.vy * E.dampening)),
        // @ts-ignore
        (t.vx *= this.friction),
        // @ts-ignore
        (t.vy *= this.friction),
        (t.x += t.vx),
        (t.y += t.vy),
        (e *= E.tension);
  },
  draw: function () {
    let e,
      t,
      // @ts-ignore
      n = this.nodes[0].x,
      // @ts-ignore
      i = this.nodes[0].y;
    // @ts-ignore
    ctx.beginPath();
    // @ts-ignore
    ctx.moveTo(n, i);
    // @ts-ignore
    for (var a = 1, o = this.nodes.length - 2; a < o; a++) {
      // @ts-ignore
      e = this.nodes[a];
      // @ts-ignore
      t = this.nodes[a + 1];
      n = 0.5 * (e.x + t.x);
      i = 0.5 * (e.y + t.y);
      // @ts-ignore
      ctx.quadraticCurveTo(e.x, e.y, n, i);
    }
    // @ts-ignore
    e = this.nodes[a];
    // @ts-ignore
    t = this.nodes[a + 1];
    // @ts-ignore
    ctx.quadraticCurveTo(e.x, e.y, t.x, t.y);
    // @ts-ignore
    ctx.stroke();
    // @ts-ignore
    ctx.closePath();
  },
};

// @ts-ignore
function onMousemove(e) {
  function o() {
    lines = [];
    for (let e = 0; e < E.trails; e++)
      // @ts-ignore
      lines.push(new Line({ spring: 0.45 + (e / E.trails) * 0.025 }));
  }
  // @ts-ignore
  function c(e) {
    e.touches
      ? // @ts-ignore
        ((pos.x = e.touches[0].pageX), (pos.y = e.touches[0].pageY))
      : // @ts-ignore
        ((pos.x = e.clientX), (pos.y = e.clientY));
    /* no preventDefault: cancelling touchmove kills page scrolling */
  }
  // @ts-ignore
  function l(e) {
    // @ts-ignore
    1 == e.touches.length &&
      ((pos.x = e.touches[0].pageX), (pos.y = e.touches[0].pageY));
  }
  document.removeEventListener("mousemove", onMousemove),
    document.removeEventListener("touchstart", onMousemove),
    document.addEventListener("mousemove", c),
    document.addEventListener("touchmove", c),
    document.addEventListener("touchstart", l),
    c(e),
    o(),
    render();

  // kept so teardown can unbind the handlers this closure created
  // @ts-ignore
  moveHandler = c;
  // @ts-ignore
  touchStartHandler = l;
}

function render() {
  // @ts-ignore
  if (ctx.running) {
    // @ts-ignore
    ctx.globalCompositeOperation = "source-over";
    // @ts-ignore
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // @ts-ignore
    ctx.globalCompositeOperation = "lighter";
    // @ts-ignore
    ctx.strokeStyle =
      "hsla(" +
      Math.round(f.update()) +
      "," + cfg.saturation + "%," + cfg.lightness + "%," + cfg.alpha + ")";
    // @ts-ignore
    ctx.lineWidth = cfg.lineWidth;
    for (var e, t = 0; t < E.trails; t++) {
      // @ts-ignore
      (e = lines[t]).update();
      e.draw();
    }
    // @ts-ignore
    ctx.frame++;
    // @ts-ignore
    rafId = window.requestAnimationFrame(render);
  }
}

function resizeCanvas() {
  // @ts-ignore
  const c = ctx.canvas;
  /* 1.5, not 2. Forty-four ribbons are stroked over the full viewport every
     frame under `lighter` compositing, which is fill-rate bound — and the
     strokes are soft enough that the last half-step of resolution does not
     show. Full 2× here costs about a third more pixels than the whole
     effect is worth. */
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  /* Back the canvas with real device pixels, and let CSS hold the layout
     size. Without this the trails render at half resolution on a retina
     screen and read as soft smudges. */
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + "px";
  c.style.height = h + "px";
  // @ts-ignore
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export type TrailOptions = {
  /** how many ribbons chase the cursor */
  trails?: number;
  /** nodes per ribbon — longer tail */
  size?: number;
  /** stroke thickness in css px */
  lineWidth?: number;
  /** per-stroke alpha. Compositing is additive, so this multiplies up fast */
  alpha?: number;
  saturation?: number;
  lightness?: number;
};

/* Defaults are the restrained version.
   The source ships trails 80 / size 50 / lineWidth 10 / alpha 0.025, which
   with `lighter` compositing accumulates past full white — measured peak
   alpha was a clipped 255. Roughly a fifth of that ink keeps the colour and
   the motion while leaving it a trace rather than a smear. */
const DEFAULTS: Required<TrailOptions> = {
  trails: 44,        // 34 +30%
  size: 55,          // 42 +30%
  lineWidth: 7.8,    // 6 +30%
  alpha: 0.0234,     // 0.018 +30%
  saturation: 100,   // 90 +30% clamps at 100
  lightness: 55,     // held: see below
};

/* Lightness is deliberately NOT scaled. It is the one value here that does
   not mean "more" — pushing it up moves the stroke toward white, and with
   additive compositing that is exactly what made the first version blow out
   to a clipped 255 and lose its colour. The other four multiply together, so
   +30% each is roughly 2.2x the ink on screen, landing near 40% of the
   original — brighter, still coloured. */

var ctx: any,
  f: any,
  e = 0,
  pos: any = {},
  lines: any[] = [],
  rafId = 0,
  moveHandler: any = null,
  touchStartHandler: any = null,
  cfg: Required<TrailOptions> = { ...DEFAULTS },
  E = {
    debug: true,
    friction: 0.5,
    trails: DEFAULTS.trails,
    size: DEFAULTS.size,
    dampening: 0.025,
    tension: 0.99,
  };
function Node(this: any) {
  this.x = 0;
  this.y = 0;
  this.vy = 0;
  this.vx = 0;
}

/** Starts the trail. Returns a teardown — call it on unmount. */
export const renderCanvas = function (options?: TrailOptions): () => void {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvas) return () => {};

  cfg = { ...DEFAULTS, ...options };
  E.trails = cfg.trails;
  E.size = cfg.size;

  /* Ambient motion, so it stops when asked. The canvas stays mounted and
     simply never paints. */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  ctx = canvas.getContext("2d");
  ctx.running = true;
  ctx.frame = 1;
  // @ts-ignore
  f = new n({
    phase: Math.random() * 2 * Math.PI,
    amplitude: 85,
    frequency: 0.0015,
    offset: 285,
  });

  const onFocus = () => {
    // @ts-ignore
    if (!ctx.running) {
      // @ts-ignore
      ctx.running = true;
      render();
    }
  };
  // the original set this to `true`, so the loop never actually paused
  const onBlur = () => {
    // @ts-ignore
    ctx.running = false;
  };

  document.addEventListener("mousemove", onMousemove);
  document.addEventListener("touchstart", onMousemove);
  document.body.addEventListener("orientationchange", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  resizeCanvas();

  return () => {
    // @ts-ignore
    if (ctx) ctx.running = false;
    // @ts-ignore
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener("mousemove", onMousemove);
    document.removeEventListener("touchstart", onMousemove);
    // @ts-ignore
    if (moveHandler) {
      // @ts-ignore
      document.removeEventListener("mousemove", moveHandler);
      // @ts-ignore
      document.removeEventListener("touchmove", moveHandler);
    }
    // @ts-ignore
    if (touchStartHandler) document.removeEventListener("touchstart", touchStartHandler);
    document.body.removeEventListener("orientationchange", resizeCanvas);
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    lines = [];
  };
};
