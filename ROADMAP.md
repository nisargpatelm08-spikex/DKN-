# DKN — Feature Roadmap

This file is our shared wishlist. Completed work is listed first, then ideas for the future.
Every future feature request starts here, so nothing gets forgotten.

## ✅ Done — v1.1.0 (latest)

- **Visual 2D Board** (top-bar *Editor ⇄ Board* switch): draggable scene cards, coloured draggable chapter zones (drag a zone to move its scenes, drop a card on another zone to re-chapter it)
- **Typed plugs & links**: 7 link types (time order, storyline, character, cause & effect, theme, inspiration, research), multiple plugs per scene on any edge, free-text labels, drag dot-to-dot to draw labelled bezier links
- **Story Timeline** (top-bar *Timeline* view): build your story's calendar from scratch — years with months and days per month, custom month names; drag scene chips onto days, day picker to assign/remove scenes
- **Dark theme** across the whole app (warm charcoal palette) for comfortable long writing sessions
- Board and timeline changes persist in `.dknproj`; every change flows through the 10-step undo; old project files open cleanly (automatic layout when board data is missing)

## ✅ Done (MVP — v1.0.0)

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
- [ ] **Scene tags & search** — label scenes (fight, romance, flashback, …) and search across the whole story
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