# Changelog

All notable changes to DKN are listed here, newest first.
Installer naming follows the package version (e.g. `DKN-1.1.0-setup.exe`).

## [1.1.0] — 2026-10

### Added
- **Wire tools menu (press W)** on the Board and Timeline: ✂ cut-knife (drag a line across wires to
  cut them), delete selected wire, disconnect scene, ⇢ connect to next scene, ⤳ insert a scene into
  a wire (A → C becomes A → B → C), ⛓ auto sequence (whole story / one chapter / time order),
  ✨ beautify, ▦ arrange cards by wire flow, 🗑 remove all. Items are numbered — press 1–9.
- **Scene tools menu (press S)** over a scene card: ✎ edit, 🖼 add photo, add ＋/− ports, tag,
  move to chapter, ⧉ duplicate, ✕ delete; on the Timeline also set/clear date & time.
- **Shortcut keys you can change** — Settings > Shortcut keys (stored per computer; never fire
  while typing; Ctrl+S still saves).
- **Timeline rebuilt around scene dates**: each scene has Year · Month · Day · Time on a calendar
  you invent; scene cards sit in story time; wires show the time gap between scenes
  (`+7 h 30 min`, `+2 mo 2 d 14 h`); *⏳ Chapters in time* panel; *Not dated yet* strip; orange
  dashed flashback wires (`⟲ back …`); *⇢ Connect in time order* button.
- **In-app Help desk (❔)** — plain-English guide to every feature with live search, quick-jump
  chips and try-it buttons.
- **News tab (📣)** — What's new per version, earlier releases, *Check for updates* link, and a
  red dot until the newest item has been read.

### Changed
- Board wiring moved from *plugs* to **＋/− ports**: a wire flows from a scene's **− negative**
  (right) into another scene's **＋ positive** (left); every wire gets its own port dot.
- Board layout works as a **story graph**: new scenes auto-place beside the current scene, and the
  card layout + wire graph is saved with the story.
- Timeline redesigned from a day-grid to a **flow layout**: even-spaced cards per chapter band,
  time-gap neighbours on the axis, per-wire gap labels.
- Translate: keeps English names and everyday loanwords (Hindi + other languages), automatic
  fallback when one free service is rate-limited, provider note in the panel.

### Fixed
- **Board wires were invisible** — the wires' SVG sat at the wrong origin (~23 000 px off screen),
  so wires never appeared at the card dots; wires now start and end exactly on the ports.
- Timeline no longer blanks or crashes on a brand-new story (no timeline data yet).
- Timeline chips clipped by a CSS name clash with the Translate panel (renamed to `tlx-*`).
- Knife cut missed wires whose sample point lay exactly on the cut line (touching now counts).

## [1.0.0] — 2026

- Story → chapters → scenes; add / rename / delete / reorder scenes (drag-and-drop + buttons)
- Prose editor per scene; artwork per scene (upload, drag-drop, freehand drawing pad)
- Undo last 10 changes (button + Ctrl+Z)
- Save / Save As / Open `.dknproj` (Ctrl+S / Ctrl+O); automatic session-recovery autosave
- Whole-story PDF export (cover page, chapter page breaks, embedded artwork)
- Visual 2D Board with typed links, and a story Timeline with a custom calendar
- Dark theme; Windows installer