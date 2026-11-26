/* ============================================================
   Scroll + illustration animations.
   Everything here is skipped when the visitor prefers reduced
   motion; the CSS falls back to the finished state.
   ============================================================ */
(() => {
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ----------------------------------------------------------
     Split the contact title into words so each can light up
     as you scroll. Runs with or without motion (text stays).
     ---------------------------------------------------------- */
  const splitWords = (el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', i);
      span.textContent = word;
      el.append(span, i < words.length - 1 ? ' ' : '');
    });
    el.style.setProperty('--n', words.length);
  };
  document.querySelectorAll('[data-words]').forEach(splitWords);

  if (!motionOK) {
    document.querySelectorAll('.flow svg').forEach((svg) => svg.pauseAnimations?.());
    drawGlobe(false);
    return;
  }
  document.documentElement.classList.add('anim');

  /* ----------------------------------------------------------
     Scroll scrub: writes --p (0..1) on every [data-scrub].
       exit  = 0 while the element fills the screen, 1 once scrolled past
       enter = 0 as it enters at the bottom, 1 by the time it nears the top
     ---------------------------------------------------------- */
  const scrubs = [...document.querySelectorAll('[data-scrub]')];
  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    scrubs.forEach((el) => {
      const rect = el.getBoundingClientRect();
      let p;
      if (el.dataset.scrub === 'exit') {
        p = clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
      } else {
        const start = vh * 0.95;
        const end = vh * (parseFloat(el.dataset.end) || 0.35);
        p = clamp((start - rect.top) / (start - end), 0, 1);
      }
      el.style.setProperty('--p', p.toFixed(4));
    });
  };
  const requestUpdate = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();

  /* ----------------------------------------------------------
     One-shot reveals: .rv gets .in when it enters the viewport.
     ---------------------------------------------------------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealIO.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
  document.querySelectorAll('.rv').forEach((el) => {
    [...el.children].forEach((child, i) => child.style.setProperty('--i', i));
    revealIO.observe(el);
  });

  /* ----------------------------------------------------------
     Decode: headings scramble through glyphs, then resolve
     left to right. Screen readers get the real text only.
     ---------------------------------------------------------- */
  const glyphs = '#%&*+=/<>?01ABCDEFXZ';
  const decode = (el) => {
    const visual = el.querySelector('.decode-txt');
    const text = el.dataset.text;
    const duration = 700 + text.length * 25;
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / duration, 0, 1);
      const settled = Math.floor(k * text.length);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out += i < settled || ch === ' ' ? ch : glyphs[(Math.random() * glyphs.length) | 0];
      }
      visual.textContent = out;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const decodeIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      decode(entry.target);
      decodeIO.unobserve(entry.target);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.decode').forEach((el) => {
    const text = el.textContent.trim();
    el.dataset.text = text;
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    const visual = document.createElement('span');
    visual.className = 'decode-txt';
    visual.setAttribute('aria-hidden', 'true');
    visual.textContent = text.replace(/\S/g, '#');
    el.append(sr, visual);
    decodeIO.observe(el);
  });

  drawGlobe(true);

  /* ----------------------------------------------------------
     Dot globe with a pulsing marker on Kozhikode. Spins faster
     while you scroll. Paused when off screen.
     ---------------------------------------------------------- */
  function drawGlobe(animate) {
    const canvas = document.getElementById('globe');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const N = 900;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const points = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = golden * i;
      points.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    const lat = 11.25 * Math.PI / 180;
    const lon = 75.78 * Math.PI / 180;
    const home = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

    let size = 0, dpr = 1;
    let rot = -lon;            // start with Kozhikode facing the viewer
    let boost = 0, lastY = window.scrollY, visible = false, running = false;
    const tilt = -0.35;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!animate) frame(0);
    };

    const project = ([x, y, z]) => {
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const x1 = x * cr + z * sr;
      const z1 = -x * sr + z * cr;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y2 = y * ct - z1 * st;
      const z2 = y * st + z1 * ct;
      return [x1, y2, z2];
    };

    const frame = (t) => {
      const R = size * 0.42, c = size / 2;
      ctx.clearRect(0, 0, size, size);
      for (const p of points) {
        const [x, y, z] = project(p);
        if (z < -0.15) continue;
        const a = 0.12 + Math.max(0, z) * 0.75;
        const s = 1 + Math.max(0, z) * 1.2;
        ctx.fillStyle = `rgba(205,231,233,${a.toFixed(3)})`;
        ctx.fillRect(c + x * R - s / 2, c - y * R - s / 2, s, s);
      }
      const [hx, hy, hz] = project(home);
      if (hz > 0) {
        const mx = c + hx * R, my = c - hy * R;
        const pulse = (t * 0.0012) % 1;
        ctx.strokeStyle = `rgba(173,250,167,${(1 - pulse) * hz})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, my, 4 + pulse * 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(173,250,167,${hz})`;
        ctx.shadowColor = '#adfaa7';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const loop = (t) => {
      if (!visible) { running = false; return; }
      const y = window.scrollY;
      boost = boost * 0.92 + Math.abs(y - lastY) * 0.0006;
      lastY = y;
      rot += 0.0035 + Math.min(boost, 0.05);
      frame(t);
      requestAnimationFrame(loop);
    };

    window.addEventListener('resize', resize);
    resize();
    if (!animate) return;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !running) { running = true; lastY = window.scrollY; requestAnimationFrame(loop); }
    }).observe(canvas);
  }
})();
