// Board (2D plan) data helpers for DKN — pure functions on story objects.

export const CARD_W = 200
export const CARD_H = 122
export const GAP_X = 26
export const GAP_Y = 34
export const ZONE_PAD = 24
export const TITLE_H = 30

// ---------- plug/link catalog ----------

export const PLUG_TYPES = [
  { id: 'timeorder', label: 'Time order', color: '#4a9de8', dash: null },
  { id: 'storyline', label: 'Storyline', color: '#43b581', dash: '10 6' },
  { id: 'character', label: 'Character', color: '#b07bd6', dash: '4 4' },
  { id: 'cause', label: 'Cause & effect', color: '#e8595a', dash: '14 5' },
  { id: 'theme', label: 'Theme', color: '#e8a23c', dash: '12 5 3 5' },
  { id: 'inspiration', label: 'Inspiration', color: '#35ccc9', dash: '3 5' },
  { id: 'research', label: 'Research', color: '#99939f', dash: '2 5' }
]

export const PLUG_TYPE_MAP = Object.fromEntries(PLUG_TYPES.map((t) => [t.id, t]))
export const DEFAULT_PLUG_TYPE = 'timeorder'

export const SIDES = ['left', 'right', 'top', 'bottom']
export const SIDE_LABELS = {
  left: 'Left side',
  right: 'Right side',
  top: 'Top edge',
  bottom: 'Bottom edge'
}

export const ZONE_COLORS = [
  '#e0a23c',
  '#4a9de8',
  '#43b581',
  '#b07bd6',
  '#e8595a',
  '#e8873c',
  '#35ccc9',
  '#a89a7a'
]

export function zoneColor(ci) {
  return ZONE_COLORS[ci % ZONE_COLORS.length]
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2)
}

export function hasPos(board) {
  return !!board && Number.isFinite(board.x) && Number.isFinite(board.y)
}

// ---------- effective (derived) geometry ----------
// Scenes that were never touched on the board get automatic positions so old
// .dknproj files open nicely without any stored board data.

export function effScenePos(scene, chapter, chapterIndex) {
  if (hasPos(scene.board)) return { x: scene.board.x, y: scene.board.y }
  const withPos = chapter.scenes.filter((s) => hasPos(s.board) && s.id !== scene.id)
  if (withPos.length) {
    const last = withPos[withPos.length - 1]
    return { x: last.board.x, y: last.board.y + CARD_H + GAP_Y }
  }
  const row = Math.max(0, chapter.scenes.findIndex((s) => s.id === scene.id))
  return { x: 90 + chapterIndex * 270, y: 110 + row * (CARD_H + GAP_Y) }
}

export function computeZone(chapter, chapterIndex, scenes) {
  const pts = scenes.map((s) => effScenePos(s, chapter, chapterIndex))
  if (!pts.length) {
    return {
      x: 90 + chapterIndex * 270 - ZONE_PAD,
      y: 70,
      w: CARD_W + ZONE_PAD * 2,
      h: 190
    }
  }
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxX = Math.max(...pts.map((p) => p.x + CARD_W))
  const maxY = Math.max(...pts.map((p) => p.y + CARD_H))
  return {
    x: minX - ZONE_PAD,
    y: minY - TITLE_H - 14,
    w: maxX - minX + ZONE_PAD * 2,
    h: maxY - minY + TITLE_H + 14
  }
}

export function effZone(chapter, chapterIndex, scenes) {
  const z = chapter.zone
  if (z && Number.isFinite(z.x) && Number.isFinite(z.y) && Number.isFinite(z.w) && Number.isFinite(z.h)) {
    return { ...z }
  }
  return computeZone(chapter, chapterIndex, scenes)
}

// Plug anchor points in world coords for one scene.
export function plugPoints(scene, chapter, chapterIndex) {
  const pos = effScenePos(scene, chapter, chapterIndex)
  const boards = scene.board || {}
  const plugs = boards.plugs || []
  const bySide = { left: [], right: [], top: [], bottom: [] }
  for (const p of plugs) {
    const side = SIDES.includes(p.side) ? p.side : 'left'
    bySide[side].push(p)
  }
  const out = []
  for (const side of SIDES) {
    bySide[side].forEach((p, i) => {
      let x = pos.x
      let y = pos.y
      if (side === 'left') {
        x = pos.x - 7
        y = pos.y + 34 + i * 24
      } else if (side === 'right') {
        x = pos.x + CARD_W + 7
        y = pos.y + 34 + i * 24
      } else if (side === 'top') {
        x = pos.x + 34 + i * 30
        y = pos.y - 7
      } else {
        x = pos.x + 34 + i * 30
        y = pos.y + CARD_H + 7
      }
      out.push({ ...p, sceneId: scene.id, side, index: i, x, y })
    })
  }
  return out
}

export function localPlugOffset(plug, cardX, cardY) {
  return { x: plug.x - cardX, y: plug.y - cardY }
}

export function normalOf(side) {
  if (side === 'left') return { x: -1, y: 0 }
  if (side === 'right') return { x: 1, y: 0 }
  if (side === 'top') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Thread geometry — modelled on Blender's node "noodles" (drawnode.cc).
// A thread leaves its plug along that plug's side normal (like a socket) and
// arrives along the other plug's normal. The handle length comes from the
// user-facing `curve` setting (Thread bend, 0..1 — Blender's "Noodle
// Curving"). Like Blender, handles are clamped short when the two plugs sit
// nearly in line, so threads never hump; curving 0 draws a perfectly straight
// thread. `bend` then fans parallel threads into separate lanes.
function threadCtrlPoints(from, to, bend, curve) {
  const n1 = normalOf(from.side || 'right')
  const n2 = normalOf(to.side || 'left')
  const curving = clamp01(curve ?? 0.5)

  let c1, c2
  if (curving === 0) {
    // Straight thread: control points land at 1/3 and 2/3 of the way across.
    const dx = to.x - from.x
    const dy = to.y - from.y
    c1 = { x: from.x + dx / 3, y: from.y + dy / 3 }
    c2 = { x: from.x + (dx * 2) / 3, y: from.y + (dy * 2) / 3 }
  }
  else {
    // Distance along the exit direction against the distance across it
    // (Blender's dist_x / dist_y, generalized for plugs on any side).
    const along = (to.x - from.x) * n1.x + (to.y - from.y) * n1.y
    const acrossLen = Math.abs(-(to.x - from.x) * n1.y + (to.y - from.y) * n1.x)
    const distAlong = Math.max(1, Math.abs(along))
    // Near-parallel plugs keep short handles so the thread stays flat.
    const slope = acrossLen / distAlong
    const clampFactor = Math.min(1, slope * (4.5 - 0.25 * curving))
    // Blender: handle_offset = curving * 0.1 * dist_x * clamp_factor. A small
    // floor keeps even tiny threads gently bowed — a wire never becomes a
    // paper-thin hard line.
    const handle = Math.max(14, curving * 0.1 * distAlong * clampFactor)
    c1 = { x: from.x + n1.x * handle, y: from.y + n1.y * handle }
    c2 = { x: to.x + n2.x * handle, y: to.y + n2.y * handle }
  }

  if (bend) {
    // Shift both control points sideways so the whole thread bows into its
    // lane while both ends stay glued to their plugs.
    const tx = to.x - from.x
    const ty = to.y - from.y
    const len = Math.hypot(tx, ty) || 1
    const px = -ty / len
    const py = tx / len
    c1.x += px * bend
    c1.y += py * bend
    c2.x += px * bend
    c2.y += py * bend
  }
  return { c1, c2 }
}

export function linkPath(from, to, bend = 0, curve = 0.5) {
  const { c1, c2 } = threadCtrlPoints(from, to, bend, curve)
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
}

// The point halfway along the thread (t = 0.5 of the cubic), so a link's label
// chip always sits on its own thread — not shared with a parallel one.
export function midOf(from, to, bend = 0, curve = 0.5) {
  const { c1, c2 } = threadCtrlPoints(from, to, bend, curve)
  const t = 0.5
  const u = 1 - t
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y
  }
}

// ---------- lookups ----------

export function findSceneLoc(story, sceneId) {
  for (let ci = 0; ci < story.chapters.length; ci++) {
    const chapter = story.chapters[ci]
    const idx = chapter.scenes.findIndex((s) => s.id === sceneId)
    if (idx >= 0) {
      return { chapter, scene: chapter.scenes[idx], chapterIndex: ci, sceneIndex: idx }
    }
  }
  return null
}

// ---------- mutations (pure) ----------

export function setScenePos(story, sceneId, x, y) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) =>
        s.id === sceneId ? { ...s, board: { ...(s.board || {}), x, y } } : s
      )
    }))
  }
}

export function moveSceneToChapter(story, sceneId, targetChapterId) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc || loc.chapter.id === targetChapterId) return story
  const scene = loc.scene
  let chapters = story.chapters.map((c) => ({
    ...c,
    scenes: c.id === loc.chapter.id ? c.scenes.filter((s) => s.id !== sceneId) : [...c.scenes]
  }))
  chapters = chapters.map((c) =>
    c.id === targetChapterId ? { ...c, scenes: [...c.scenes, scene] } : c
  )
  return { ...story, chapters }
}

export function addPlug(story, sceneId, plug) {
  const id = plug.id || uid()
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              board: {
                ...(s.board || {}),
                plugs: [...(s.board?.plugs || []), { ...plug, id }]
              }
            }
          : s
      )
    }))
  }
}

export function updatePlug(story, sceneId, plugId, patch) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              board: {
                ...(s.board || {}),
                plugs: (s.board?.plugs || []).map((p) => (p.id === plugId ? { ...p, ...patch } : p))
              }
            }
          : s
      )
    }))
  }
}

export function removePlug(story, sceneId, plugId) {
  const linked = (l) =>
    (l.from?.sceneId === sceneId && l.from?.plugId === plugId) ||
    (l.to?.sceneId === sceneId && l.to?.plugId === plugId)
  const links = (story.board?.links || []).filter((l) => !linked(l))
  return {
    ...story,
    board: { ...(story.board || {}), links },
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              board: {
                ...(s.board || {}),
                plugs: (s.board?.plugs || []).filter((p) => p.id !== plugId)
              }
            }
          : s
      )
    }))
  }
}

export function addLink(story, link) {
  const id = link.id || uid()
  return {
    ...story,
    board: {
      ...(story.board || {}),
      links: [...(story.board?.links || []), { ...link, id }]
    }
  }
}

export function updateLink(story, linkId, patch) {
  return {
    ...story,
    board: {
      ...(story.board || {}),
      links: (story.board?.links || []).map((l) => (l.id === linkId ? { ...l, ...patch } : l))
    }
  }
}

export function removeLink(story, linkId) {
  return {
    ...story,
    board: { ...(story.board || {}), links: (story.board?.links || []).filter((l) => l.id !== linkId) }
  }
}

export function moveZone(story, chapterId, dx, dy, origZone, origin) {
  const zone = { x: Math.round(origZone.x + dx), y: Math.round(origZone.y + dy), w: origZone.w, h: origZone.h }
  return {
    ...story,
    chapters: story.chapters.map((c) => {
      if (c.id !== chapterId) return c
      const scenes = c.scenes.map((s) => {
        const o = origin[s.id]
        return o ? { ...s, board: { ...(s.board || {}), x: o.x + dx, y: o.y + dy } } : s
      })
      return { ...c, zone, scenes }
    })
  }
}

// Flows the whole story: chapter rows laid left-to-right, scenes in order.
export function arrangeTimeline(story) {
  let y = 90
  const chapters = story.chapters.map((chapter) => {
    const x0 = 80
    const scenes = chapter.scenes.map((s, i) => ({
      ...s,
      board: { ...(s.board || {}), x: x0 + i * (CARD_W + GAP_X), y }
    }))
    const zone = {
      x: x0 - 22,
      y: y - 58,
      w: Math.max(CARD_W + 44, chapter.scenes.length * (CARD_W + GAP_X) - GAP_X + 44),
      h: CARD_H + 38
    }
    y += CARD_H + 80
    return { ...chapter, scenes, zone }
  })
  return { ...story, chapters }
}

// Re-draws each chapter zone tightly around its cards (keeps positions).
export function fitZones(story) {
  return {
    ...story,
    chapters: story.chapters.map((chapter, ci) => ({
      ...chapter,
      zone: computeZone(chapter, ci, chapter.scenes)
    }))
  }
}

export function boundsOf(story) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  story.chapters.forEach((chapter, ci) => {
    chapter.scenes.forEach((s) => {
      const p = effScenePos(s, chapter, ci)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + CARD_W)
      maxY = Math.max(maxY, p.y + CARD_H)
    })
    const z = effZone(chapter, ci, chapter.scenes)
    minX = Math.min(minX, z.x)
    minY = Math.min(minY, z.y)
    maxX = Math.max(maxX, z.x + z.w)
    maxY = Math.max(maxY, z.y + z.h)
  })
  if (minX === Infinity) return { x: 0, y: 0, w: 800, h: 500 }
  const M = 90
  return { x: minX - M, y: minY - M, w: maxX - minX + M * 2, h: maxY - minY + M * 2 }
}

// ---------- pruning ----------

export function pruneLinksForScene(story, sceneId) {
  const links = story.board?.links || []
  const keep = links.filter((l) => l.from?.sceneId !== sceneId && l.to?.sceneId !== sceneId)
  if (keep.length === links.length) return story
  return { ...story, board: { ...(story.board || {}), links: keep } }
}

// Removes any link whose anchor plugs no longer exist.
export function sanitizeBoard(story) {
  const links = story.board?.links || []
  const plugs = new Map()
  story.chapters.forEach((c) =>
    c.scenes.forEach((s) => {
      plugs.set(s.id, new Set((s.board?.plugs || []).map((p) => p.id)))
    })
  )
  const keep = links.filter((l) => {
    const a = l.from
    const b = l.to
    return (
      a && b && plugs.get(a.sceneId)?.has(a.plugId) && plugs.get(b.sceneId)?.has(b.plugId)
    )
  })
  if (keep.length === links.length) return story
  return { ...story, board: { ...(story.board || {}), links: keep } }
}

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}