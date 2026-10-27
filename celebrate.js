"use strict";
// A confetti burst, drawn on a canvas that lies over the whole page. Written
// here rather than pulled from a library: a few dozen rounded pieces with
// gravity, drag and spin, gone in about two seconds.
//
// Used in three places: a phone that answered correctly, the winner's podium on
// the host screen, and the same podium on the projector.
(() => {
  const COLORS = ["#9a5ee8", "#6f34c0", "#f6c542", "#3ecb95", "#ff8aa2", "#4a8df0"];
  let canvas = null;
  let ctx = null;
  let pieces = [];
  let raf = 0;

  function size() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensure() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "confetti-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    size();
    window.addEventListener("resize", size);
  }

  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    pieces = pieces.filter((p) => p.life > 0 && p.y < window.innerHeight + 60);
    for (const p of pieces) {
      p.vy += 0.24;
      p.vx *= 0.994;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      p.life -= 0.007;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (pieces.length) raf = window.requestAnimationFrame(tick);
    else {
      raf = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  // A burst from a point on the page. Nothing is thrown when the phone (or the
  // projector) has asked for less motion.
  function burst(x, y, count = 90) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    ensure();
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2.6 + Math.random() * 7;
      pieces.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4.5,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.32,
        life: 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  // A burst from the middle of an element, or from the middle of the screen.
  function from(el, count = 90) {
    const rect = el?.getBoundingClientRect?.();
    if (rect && rect.width) return burst(rect.left + rect.width / 2, rect.top + rect.height / 2, count);
    return burst(window.innerWidth / 2, window.innerHeight * 0.38, count);
  }

  window.QuizzesCelebrate = { burst, from };
})();
