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
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + "px";
  c.style.height = h + "px";
  // @ts-ignore
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export type TrailOptions = {
  trails?: number;

  size?: number;

  lineWidth?: number;

  alpha?: number;
  saturation?: number;
  lightness?: number;
};

const DEFAULTS: Required<TrailOptions> = {
  trails: 44,
  size: 55,
  lineWidth: 7.8,
  alpha: 0.0234,
  saturation: 100,
  lightness: 55,
};

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

export const renderCanvas = function (options?: TrailOptions): () => void {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvas) return () => {};

  cfg = { ...DEFAULTS, ...options };
  E.trails = cfg.trails;
  E.size = cfg.size;

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
