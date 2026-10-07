# DKN — website

The one-page marketing site for **DKN — Storyboard for Novelists**.
Plain HTML/CSS/JS — no build step, no dependencies.

```
website/
├── index.html      # the whole site (hero → ticker → deck → versions → roadmap → download → contact)
├── styles.css      # design system + every mockup, all custom properties live at the top
├── script.js       # particle canvas, card deck, scroll reveals, tilt, cursor glow, scroll-spy
├── 404.html        # styled GitHub Pages 404
├── icon.png        # favicon + social-share image (copied from ../resources/icon.png)
├── robots.txt
├── sitemap.xml
└── README.md       # this file
```

## Preview locally

Any static server works. From the repo root:

```bash
# Python
python -m http.server 8123 --directory website

# …or Node
npx serve website
```

Then open <http://localhost:8123>.

> Fonts load from Google Fonts, so an internet connection is needed for the exact typography
> (it degrades to system fonts offline).

## Deploy to GitHub Pages (free)

1. Push this repository to GitHub — the site assumes the repo
   `https://github.com/nisargpatelm08-spikex/DKN-`.
2. Repo **Settings → Pages**.
3. Under *Build and deployment*: **Source: Deploy from a branch**.
4. Branch: `main`, folder: **`/website`** → **Save**.
5. ~30 seconds later the site is live at
   `https://nisargpatelm08-spikex.github.io/DKN-/`

Any other host works too (Netlify, Cloudflare Pages, itch.io doesn't host static sites) —
point it at this folder as the publish directory.

## Pre-launch checklist (things that are still placeholders)

- [ ] **GitHub repository must be public.** The download buttons point to
      `https://github.com/nisargpatelm08-spikex/DKN-/releases/tag/v1.1.0`
      (currently 404 while the repo is private).
- [ ] **Base URL** — appears in 4 places if you ever use a custom domain:
      `index.html` (canonical, og:url, og:image, twitter:image), `robots.txt`, `sitemap.xml`,
      and the `/DKN-/` paths inside `404.html`.
- [ ] **`og:image`** currently reuses `icon.png`. For a nicer link preview, drop a
      1200×630 PNG in this folder and point the og/twitter image tags at it.
- [ ] macOS / Linux / iOS buttons are intentionally marked *coming soon* — flip them to real
      links in `index.html` when those builds exist.

## Editing the design

Everything is driven by custom properties at the top of `styles.css`:

```css
--bg: #0c0a09;        /* warm charcoal page */
--amber: #ff9d23;      /* primary accent */
--cyan: #45e0ff;       /* secondary wire colour */
--font-display: …;     /* headings (Space Grotesk) */
--win-h: 340px;        /* mockup window height → also sizes the card deck */
```

- **Hero particles** — tuning lives in `script.js` (`particleCount`, `LINK_DIST`, `MOUSE_LINK`).
- **Card deck behaviour** — `script.js`, section *6 · SHOWCASE CARD DECK*.
- **App mockups** — pure CSS/HTML in `index.html`, styles under *editor / board / timeline / tool menu*.
