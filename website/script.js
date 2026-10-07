/* ============================================================
   DKN site — interactions
   1. hero particle canvas (mouse-reactive story-graph)
   2. scroll reveal
   3. header state + scroll-spy nav
   4. 3D tilt cards
   5. cursor glow + card spotlights
   ============================================================ */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------------------------
     1 · HERO PARTICLE CANVAS
     ------------------------------------------------------------ */
  const canvas = document.getElementById("heroCanvas");

  if (canvas) {
    const ctx = canvas.getContext("2d");
    const hero = canvas.parentElement;

    const AMBER = "255, 157, 35";
    const CYAN = "69, 224, 255";

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = null;
    let visible = true;

    const mouse = { x: -9999, y: -9999, active: false };

    const LINK_DIST = 152;
    const MOUSE_LINK = 225;

    function particleCount() {
      const area = width * height;
      return Math.max(60, Math.min(260, Math.round(area / 8200)));
    }

    function spawn() {
      particles = Array.from({ length: particleCount() }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.44,
        vy: (Math.random() - 0.5) * 0.44,
        r: Math.random() * 1.8 + 0.7,
        hue: Math.random() < 0.18 ? CYAN : AMBER,
        tw: Math.random() * Math.PI * 2,
      }));
    }

    function resize() {
      const rect = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawn();
      if (reduceMotion) drawFrame(false);
    }

    function drawFrame(animate) {
      ctx.clearRect(0, 0, width, height);

      // links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.42;
            const hue = a.hue === CYAN || b.hue === CYAN ? CYAN : AMBER;
            ctx.strokeStyle = `rgba(${hue}, ${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        // links to cursor — the "live wire" effect
        if (mouse.active) {
          const dx = a.x - mouse.x;
          const dy = a.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_LINK) {
            const alpha = (1 - dist / MOUSE_LINK) * 0.75;
            ctx.strokeStyle = `rgba(${AMBER}, ${alpha})`;
            ctx.lineWidth = 1.05;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const p of particles) {
        if (animate) {
          p.x += p.vx;
          p.y += p.vy;
          p.tw += 0.02;

          if (p.x < -12) p.x = width + 12;
          if (p.x > width + 12) p.x = -12;
          if (p.y < -12) p.y = height + 12;
          if (p.y > height + 12) p.y = -12;

          // gentle drift toward cursor
          if (mouse.active) {
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d < 240 && d > 1) {
              p.x += (dx / d) * 0.24;
              p.y += (dy / d) * 0.24;
            }
          }
        }

        const glow = 0.5 + Math.sin(p.tw) * 0.28;
        ctx.fillStyle = `rgba(${p.hue}, ${glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // cursor node
      if (mouse.active) {
        ctx.fillStyle = `rgba(${AMBER}, 0.9)`;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 2.6, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 74);
        grad.addColorStop(0, `rgba(${AMBER}, 0.16)`);
        grad.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 74, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop() {
      drawFrame(true);
      raf = visible && !reduceMotion ? requestAnimationFrame(loop) : null;
    }

    function start() {
      if (raf === null && visible && !reduceMotion) raf = requestAnimationFrame(loop);
    }

    // pointer
    hero.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    });

    hero.addEventListener("pointerleave", () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    });

    // pause when off-screen (battery friendly)
    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
      },
      { threshold: 0.02 }
    );
    heroObserver.observe(hero);

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });

    resize();
    if (!reduceMotion) start();
  }

  /* ------------------------------------------------------------
     2 · SCROLL REVEAL
     ------------------------------------------------------------ */
  const revealEls = document.querySelectorAll("[data-reveal]");

  if (revealEls.length) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("in"));
    } else {
      const revealObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            // stagger siblings inside the same section
            const siblings = [...el.parentElement.querySelectorAll(":scope > [data-reveal]")];
            const idx = Math.max(0, siblings.indexOf(el));
            el.style.setProperty("--d", `${Math.min(idx, 5) * 90}ms`);
            el.classList.add("in");
            obs.unobserve(el);
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
      );
      revealEls.forEach((el) => revealObserver.observe(el));
    }
  }

  /* ------------------------------------------------------------
     3 · HEADER STATE + SCROLL SPY
     ------------------------------------------------------------ */
  const header = document.querySelector(".site-header");
  const navLinks = [...document.querySelectorAll(".main-nav a")];

  const onScroll = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (navLinks.length && "IntersectionObserver" in window) {
    const sections = navLinks
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((link) =>
            link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id)
          );
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach((section) => spy.observe(section));
  }

  /* ------------------------------------------------------------
     4 · 3D TILT CARDS (hero deck windows follow the cursor)
     ------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    document
      .querySelectorAll("[data-tilt], .deck-card .app-window")
      .forEach((card) => {
        const maxTilt = 6;

        card.addEventListener("pointermove", (e) => {
          const rect = card.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width;
          const py = (e.clientY - rect.top) / rect.height;
          const rx = (0.5 - py) * maxTilt * 2;
          const ry = (px - 0.5) * maxTilt * 2;
          card.style.transform = `translateY(-6px) rotateX(${rx.toFixed(
            2
          )}deg) rotateY(${ry.toFixed(2)}deg) translateZ(8px)`;
        });

        card.addEventListener("pointerleave", () => {
          card.style.transform = "";
        });
      });
  }

  /* ------------------------------------------------------------
     5 · CURSOR GLOW + CARD SPOTLIGHTS
     ------------------------------------------------------------ */
  const glow = document.querySelector(".cursor-glow");

  if (glow && finePointer && !reduceMotion) {
    let gx = -500;
    let gy = -500;
    let tx = -500;
    let ty = -500;
    let shown = false;

    window.addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
        if (!shown) {
          shown = true;
          gx = tx;
          gy = ty;
          glow.style.opacity = "1";
        }
      },
      { passive: true }
    );

    document.addEventListener("pointerleave", () => {
      glow.style.opacity = "0";
      shown = false;
    });

    const follow = () => {
      gx += (tx - gx) * 0.14;
      gy += (ty - gy) * 0.14;
      glow.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }

  // spotlight hover position on contact cards
  document.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener(
      "pointermove",
      (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
      },
      { passive: true }
    );
  });

  /* ------------------------------------------------------------
     6 · SHOWCASE CARD DECK (tap · swipe · arrows · dots)
     ------------------------------------------------------------ */
  const deck = document.getElementById("deck");

  if (deck) {
    const cards = [...deck.querySelectorAll(".deck-card")];
    const slides = [...document.querySelectorAll(".slide-text")];
    const dots = [...document.querySelectorAll(".deck-dot")];
    const counter = document.querySelector(".deck-counter b");
    const total = cards.length;
    let idx = 0;
    let suppressClick = false;

    function render() {
      cards.forEach((card, i) => {
        const depth = (i - idx + total) % total;
        card.classList.remove("pos-0", "pos-1", "pos-2", "pos-3", "live");
        card.classList.add("pos-" + depth);
        card.classList.toggle("live", depth === 0);
      });

      slides.forEach((slide, i) => slide.classList.toggle("active", i === idx));

      dots.forEach((dot, i) => {
        const on = i === idx;
        dot.classList.toggle("on", on);
        dot.setAttribute("aria-pressed", String(on));
      });

      if (counter) counter.textContent = String(idx + 1).padStart(2, "0");
    }

    function go(dir) {
      idx = (idx + dir + total) % total;
      render();
    }

    // tap anywhere on the stack → next card
    deck.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      go(1);
    });

    // swipe / drag
    let startX = 0;
    let startY = 0;
    let down = false;

    deck.addEventListener("pointerdown", (e) => {
      down = true;
      startX = e.clientX;
      startY = e.clientY;
    });

    deck.addEventListener("pointerup", (e) => {
      if (!down) return;
      down = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        suppressClick = true;
        go(dx < 0 ? 1 : -1);
      }
    });

    deck.addEventListener("pointercancel", () => {
      down = false;
    });

    // keyboard
    deck.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      }
    });

    // arrows + dots
    document.querySelectorAll(".ctrl").forEach((btn) => {
      btn.addEventListener("click", () => go(Number(btn.dataset.dir) || 1));
    });

    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        idx = i;
        render();
      });
    });

    render();
  }
})();
