# DKN — Feature Roadmap

This file is our shared wishlist. Completed work is listed first, then ideas for the future.
Every future feature request starts here, so nothing gets forgotten.

## ✅ Done — v1.1.0 (latest)

- **Wire & scene tool menus** — press **W** (wire tools) or **S** (scene tools) on the Board and
  Timeline; each item is numbered so 1–9 picks it; Esc / the same key closes
  - ✂ cut-knife (drag a line across wires to cut them), delete selected wire, disconnect scene
  - ⇢ connect to next scene, ⤳ insert a scene into a wire (A → C becomes A → B → C)
  - ⛓ auto sequence (whole story / one chapter / in time order — keeps existing wires)
  - ✨ beautify wires (own port per wire, ordered top → bottom; drops duplicates & unused ports;
    on the Timeline rebuilds one clean chain by date)
  - ▦ arrange cards by wire flow (every wire runs left → right, chapters on their own rows)
  - 🗑 remove all wires
- **Adjustable shortcut keys** — W and S can be changed in *Settings → Shortcut keys*; keys never
  fire while typing and Ctrl+S always saves; digit keys are reserved for the numbered menus
- **Visual Board as a story graph** — cards auto-place beside the scene you're viewing; the card
  layout + wire graph persists with the story
- **Board wiring is ＋/− ports, not plugs** — wires flow from a scene's **− negative** (right) into
  another scene's **＋ positive** (left); every wire gets its own port; direction chevrons;
  wires fixed (previously invisible) and pixel-exact to the dots
- **Thread bend** — Settings slider (0% straight … 100% curvy, Blender-noodle style)
- **Timeline rebuilt around scene dates** — each scene: **Year · Month · Day · Time** on a
  calendar you invent (year/month/day counts and month names are all yours)
- **Time gaps** — every Timeline wire shows the time between scenes (`+7 h 30 min`,
  `+2 mo 2 d 14 h`); neighbour gaps on the axis; **⏳ Chapters in time** panel
- **Undated strip & flashbacks** — scenes with no date wait in "Not dated yet"; earlier-than-
  neighbours scenes draw as dashed orange **⟲ back …** wires below the track
- **⇢ Connect in time order** button and in-time-order tool-menu actions
- **Colorful threaded wires** (cause, theme, character, …) keep working with the board graph
- **In-app Help desk (❔)** — plain-English guide to every feature, live search with highlights,
  quick-jump chips, try-it navigation buttons
- **News tab (📣)** — per-version What's New, version history, "Check for updates" link, unread
  red dot (remembered)
- **Translate improvements** — keep-English loanwords (Hindi + others) fixed, automatic fallback
  when a free service is rate-limited, provider note in the panel
- **Translate tool** (🌐) — scene or whole-story translation into 15+ languages, Hinglish
  detection, Devanagari ⇄ Roman toggle, language-mix meter under the prose editor
- **Dark theme** (warm charcoal) across the whole app for comfortable long writing sessions
- Old project files open cleanly (automatic layout when board data is missing, ports added on
  demand); everything flows through the 10-step undo; `.dknproj` holds story, board, timeline
  and calendar together

## ✅ Done — v1.0.0

- Story → Chapters → Scenes structure
- Add / rename / delete / reorder chapters and scenes
- Drag-and-drop scene reordering + up/down arrow buttons
- Prose editor per scene
- Artwork per scene: upload image, drag image onto the frame, or draw freehand (pen / colors / sizes / eraser)
- Undo the last 10 changes (button + Ctrl+Z)
- Save / Save As / Open `.dknproj` files (Ctrl+S / Ctrl+O)
- Automatic session recovery (autosave ~1s after changes, restored on launch)
- Export the whole story to a print-ready A4 PDF (cover page, chapter page breaks, embedded artwork)
- Windows installer (electron-builder)

## 💡 Wishlist — ideas sorted roughly by size

### Nice to have soon
- [ ] **Word / scene counters** in the top bar (words per scene, per chapter, total)
- [ ] **Chapter summaries** (a short synopsis box per chapter)
- [ ] **Story stats** (reading time estimate, progress bar)
- [ ] **Grid view** of all scene frames (storyboard wall)
- [ ] **Pin / favorite scenes** (flag important scenes — e.g. "climax", "must rewrite")

### Bigger features
- [ ] **Character sheets & classes** — dedicated pages describing characters, with links to scenes they appear in
- [ ] **Templates** — starter story structures (hero's journey, three-act, romance, mystery…) plus blank
- [x] **Scene tags** — label scenes from the S menu (fight, romance, flashback, …)
- [ ] **Search scenes by tag or text** across the whole story
- [ ] **Undo extended to 50 steps + redo** (Ctrl+Shift+Z)

### Later / stretch
- [ ] **Export to other formats** (Microsoft Word .docx, plain text, or HTML folder for web publishing)
- [ ] **Autosave history** — keep the last several autosaves so you can recover older versions
- [ ] **Optional AI-assisted art / text generation** (free/local models only — no paid APIs)
- [ ] **Cloud sync or file backups** for peace of mind

## 📝 Process notes

- New features are added in the same way each time:
  1. Edit the source in `src/`
  2. Test in dev mode (`npm run dev`)
  3. Bump the version in `package.json`
  4. Rebuild the installer (`npm run build:win`)
  5. Install the new setup over the old one — your `.dknproj` stories and autosave are never touched