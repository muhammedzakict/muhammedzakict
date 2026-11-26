const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------
   Preloader: hide once fonts are ready (the hero name is the
   largest paint, so waiting on images would delay LCP).
   Never block longer than 1.5s.
   ------------------------------------------------------------ */
const finishLoading = () => root.classList.remove('is-loading');
(document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(finishLoading, reduceMotion ? 0 : 200));
setTimeout(finishLoading, 1500);

/* ------------------------------------------------------------
   Menu overlay
   ------------------------------------------------------------ */
const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menuBtn');
const menuClose = document.getElementById('menuClose');

const openMenu = () => {
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('open'));
  menuBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  menuClose.focus();
};
const closeMenu = (returnFocus = true) => {
  if (menu.hidden) return;
  menu.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  setTimeout(() => { menu.hidden = true; }, reduceMotion ? 0 : 350);
  if (returnFocus) menuBtn.focus();
};
menuBtn.addEventListener('click', openMenu);
menuClose.addEventListener('click', () => closeMenu());
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => closeMenu(false)));
document.addEventListener('keydown', (e) => {
  if (menu.hidden) return;
  if (e.key === 'Escape') closeMenu();
  if (e.key === 'Tab') { // keep focus inside the dialog
    const items = menu.querySelectorAll('button, a');
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* ------------------------------------------------------------
   Hero dot field: a CRT dot grid that ripples and lights up
   around the pointer. Pauses when off screen.
   ------------------------------------------------------------ */
(() => {
  const canvas = document.getElementById('dotfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const gap = 16;
  let w = 0, h = 0, dpr = 1, running = false, visible = true;
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduceMotion) draw(0);
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, w, h);
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    const time = t * 0.0006;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        const wave = Math.sin(x * 0.012 + time) * Math.cos(y * 0.016 - time * 0.8);
        const dx = x - pointer.x, dy = y - pointer.y;
        const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 220);
        const a = 0.06 + Math.max(0, wave) * 0.16 + near * 0.75;
        const r = 0.8 + near * 1.4 + Math.max(0, wave) * 0.4;
        ctx.fillStyle = `rgba(205,231,233,${a.toFixed(3)})`;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }
  };

  const loop = (t) => {
    if (!visible) { running = false; return; }
    draw(t);
    requestAnimationFrame(loop);
  };
  const start = () => { if (!running && !reduceMotion) { running = true; requestAnimationFrame(loop); } };

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = e.clientX - rect.left; pointer.ty = e.clientY - rect.top;
  }, { passive: true });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(canvas);

  resize();
  start();
})();

/* ------------------------------------------------------------
   Work: scroll-driven 3D fly-through. The camera moves forward
   through space as you scroll; the nearest project fills the
   info bar. Falls back to a plain grid with reduced motion.
   ------------------------------------------------------------ */
(() => {
  const section = document.getElementById('work');
  const space = document.getElementById('space');
  if (!section || !space || reduceMotion || !CSS.supports('transform-style', 'preserve-3d')) return;

  section.classList.add('fly');
  const cards = [...space.querySelectorAll('.card')];
  const n = cards.length;
  section.style.setProperty('--n', n);

  const info = {
    bar: document.getElementById('infobar'),
    index: document.getElementById('infoIndex'),
    total: document.getElementById('infoTotal'),
    stack: document.getElementById('infoStack'),
    title: document.getElementById('infoTitle'),
    desc: document.getElementById('infoDesc'),
    link: document.getElementById('infoLink'),
  };
  const progressBar = document.getElementById('progressBar');
  info.total.textContent = String(n).padStart(2, '0');

  // Scatter cards left/right of the flight path so they pass the camera.
  const layout = cards.map((card, i) => ({
    card,
    x: (i % 2 ? 1 : -1) * (0.55 + (i * 37 % 5) * 0.05),
    y: ((i * 53) % 7 - 3) * 0.035,
    rot: (i % 2 ? -1 : 1) * 8,
    data: {
      title: card.querySelector('.card-title').textContent,
      desc: card.querySelector('.card-desc').textContent,
      stack: card.querySelector('.card-stack').textContent,
      go: card.querySelector('.card-go').textContent,
      href: card.querySelector('.card-link').href,
    },
  }));

  let depth = 1400, current = 0, target = 0, active = -1, running = false, inView = false;

  const measure = () => {
    depth = clamp(window.innerWidth * 1.1, 900, 1600);
  };

  const readScroll = () => {
    const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    const t = clamp(-rect.top / total, 0, 1);
    target = t * (n - 1);
    progressBar.style.transform = `scaleX(${t})`;
  };

  const setActive = (i) => {
    if (i === active) return;
    active = i;
    const d = layout[i].data;
    info.index.textContent = String(i + 1).padStart(2, '0');
    info.stack.textContent = d.stack;
    info.title.textContent = d.title;
    info.desc.textContent = d.desc;
    info.link.textContent = d.go;
    info.link.href = d.href;
    info.bar.classList.remove('info-swap');
    void info.bar.offsetWidth; // restart the swap animation
    info.bar.classList.add('info-swap');
  };

  const render = () => {
    const vw = window.innerWidth;
    const spread = vw < 640 ? 0.42 : 0.5;
    layout.forEach(({ card, x, y, rot }, i) => {
      const rel = current - i;            // 0 = at the focal plane, <0 = ahead, >0 = passed
      const z = rel * depth;
      const tx = x * vw * spread * Math.min(1, 0.35 + Math.abs(rel) * 0.65);
      const ty = y * window.innerHeight;
      let opacity;
      if (rel < 0) opacity = clamp(1 + (rel + 1) / 3, 0, 1);  // fade in from far away
      else opacity = clamp(1 - rel / 0.55, 0, 1);              // fade out quickly once passed
      card.style.transform = `translate3d(${tx}px, ${ty}px, ${z}px) rotateY(${rot * clamp(-rel, -1, 1)}deg)`;
      card.style.opacity = opacity.toFixed(3);
      card.style.pointerEvents = Math.abs(rel) < 0.5 ? 'auto' : 'none';
      card.style.zIndex = String(100 - Math.round(Math.abs(rel) * 10));
    });
    setActive(clamp(Math.round(current), 0, n - 1));
  };

  const loop = () => {
    current += (target - current) * 0.09;
    if (Math.abs(target - current) < 0.0005) current = target;
    render();
    if (inView || current !== target) requestAnimationFrame(loop);
    else running = false;
  };
  const kick = () => { if (!running) { running = true; requestAnimationFrame(loop); } };

  window.addEventListener('scroll', () => { readScroll(); kick(); }, { passive: true });
  window.addEventListener('resize', () => { measure(); readScroll(); kick(); });
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) kick(); }).observe(section);

  // Pointer tilt for depth on desktop.
  if (finePointer) {
    const stage = document.getElementById('stage');
    stage.addEventListener('pointermove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      space.style.setProperty('--ry', `${(nx * 6).toFixed(2)}deg`);
      space.style.setProperty('--rx', `${(-ny * 4).toFixed(2)}deg`);
    });
    stage.addEventListener('pointerleave', () => {
      space.style.setProperty('--ry', '0deg');
      space.style.setProperty('--rx', '0deg');
    });
  }

  // Keyboard users: focusing a project scrolls the camera to it.
  cards.forEach((card, i) => {
    card.querySelector('.card-link').addEventListener('focus', () => {
      const total = section.offsetHeight - window.innerHeight;
      const top = section.offsetTop + (i / (n - 1)) * total;
      window.scrollTo({ top, behavior: 'instant' });
      target = current = i;
      render();
    });
  });

  measure();
  readScroll();
  current = target;
  render();
})();

/* ------------------------------------------------------------
   Contact form: validates locally, then opens the email app.
   ------------------------------------------------------------ */
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');
const emailAddress = 'zakic.t9876@gmail.com';

contactForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;

  const data = new FormData(contactForm);
  const name = String(data.get('name') || '').trim();
  const email = String(data.get('email') || '').trim();
  const subject = String(data.get('subject') || '').trim();
  const message = String(data.get('message') || '').trim();
  const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
  const mailto = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  formNote.textContent = 'Opening your email app. Check the message and press Send there.';
  window.location.href = mailto;
});

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
