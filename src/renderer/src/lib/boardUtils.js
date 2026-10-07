// Board (2D plan) data helpers for DKN — pure functions on story objects.
//
// The linking system works like this (no "plugs" anymore):
//   • Every scene carries ports: POSITIVE ports on its LEFT edge, NEGATIVE
//     ports on its RIGHT edge.
//   • A wire always flows NEGATIVE → POSITIVE: one scene's negative port
//     (right side) connects into another scene's positive port (left side).
//   • Storyline wires live in story.board.links; the Timeline's actual-story
//     wires live in story.timeline.links — both saved in the .dknproj file.

export const CARD_W = 200
export const CARD_H = 122
export const GAP_X = 26
export const GAP_Y = 34
export const ZONE_PAD = 24
export const TITLE_H = 30

// Port dots sit just off the card edges, stacked from the top.
export const PORT_Y0 = 30
export const PORT_STEP = 24

// ---------- wire/link type catalog (colour + dash of a thread) ----------

export const PLUG_TYPES = [
  { id: 'storyline', label: 'Storyline', color: '#43b581', dash: '10 6' },
  { id: 'timeorder', label: 'Time order', color: '#4a9de8', dash: null },
  { id: 'character', label: 'Character', color: '#b07bd6', dash: '4 4' },
  { id: 'cause', label: 'Cause & effect', color: '#e8595a', dash: '14 5' },
  { id: 'theme', label: 'Theme', color: '#e8a23c', dash: '12 5 3 5' },
  { id: 'inspiration', label: 'Inspiration', color: '#35ccc9', dash: '3 5' },
  { id: 'research', label: 'Research', color: '#99939f', dash: '2 5' }
]

export const PLUG_TYPE_MAP = Object.fromEntries(PLUG_TYPES.map((t) => [t.id, t]))
export const DEFAULT_LINK_TYPE = 'storyline'

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
  const row = Math.max(
    0,
    chapter.scenes.findIndex((s) => s.id === scene.id)
  )
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
  if (
    z &&
    Number.isFinite(z.x) &&
    Number.isFinite(z.y) &&
    Number.isFinite(z.w) &&
    Number.isFinite(z.h)
  ) {
    return { ...z }
  }
  return computeZone(chapter, chapterIndex, scenes)
}

// Anchor points (world coords) for every port of one scene.
// POSITIVE on the LEFT edge, NEGATIVE on the RIGHT edge.
export function effPorts(scene, chapter, chapterIndex) {
  const pos = effScenePos(scene, chapter, chapterIndex)
  const b = scene.board || {}
  const posIds = Array.isArray(b.pos) && b.pos.length ? b.pos : [scene.id + ':p1']
  const negIds = Array.isArray(b.neg) && b.neg.length ? b.neg : [scene.id + ':n1']
  const out = []
  posIds.forEach((id, i) => {
    out.push({
      sceneId: scene.id,
      portId: id,
      pole: 'pos',
      side: 'left',
      x: pos.x - 7,
      y: pos.y + PORT_Y0 + i * PORT_STEP
    })
  })
  negIds.forEach((id, i) => {
    out.push({
      sceneId: scene.id,
      portId: id,
      pole: 'neg',
      side: 'right',
      x: pos.x + CARD_W + 7,
      y: pos.y + PORT_Y0 + i * PORT_STEP
    })
  })
  return out
}

export function normalOf(side) {
  if (side === 'left') return { x: -1, y: 0 }
  if (side === 'right') return { x: 1, y: 0 }
  if (side === 'top') return { x: 0, y: -1 }
  return { x: 0, y: 1 }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Wire geometry — modelled on Blender's node "noodles" (drawnode.cc).
// A wire leaves its port along the port's side normal (like a socket) and
// arrives along the other port's normal. The handle length comes from the
// user-facing `curve` setting (Thread bend, 0..1 — Blender's "Noodle
// Curving"). Like Blender, handles are clamped short when the two ports sit
// nearly in line, so wires never hump; curving 0 draws a perfectly straight
// wire. `bend` then fans parallel wires into separate lanes.
function threadCtrlPoints(from, to, bend, curve) {
  const n1 = normalOf(from.side || 'right')
  const n2 = normalOf(to.side || 'left')
  const curving = clamp01(curve ?? 0.5)

  let c1, c2
  if (curving === 0) {
    // Straight wire: control points land at 1/3 and 2/3 of the way across.
    const dx = to.x - from.x
    const dy = to.y - from.y
    c1 = { x: from.x + dx / 3, y: from.y + dy / 3 }
    c2 = { x: from.x + (dx * 2) / 3, y: from.y + (dy * 2) / 3 }
  } else {
    // Distance along the exit direction against the distance across it
    // (Blender's dist_x / dist_y, generalized for ports on any side).
    const along = (to.x - from.x) * n1.x + (to.y - from.y) * n1.y
    const acrossLen = Math.abs(-(to.x - from.x) * n1.y + (to.y - from.y) * n1.x)
    const distAlong = Math.max(1, Math.abs(along))
    // Near-parallel ports keep short handles so the wire stays flat.
    const slope = acrossLen / distAlong
    const clampFactor = Math.min(1, slope * (4.5 - 0.25 * curving))
    // Blender: handle_offset = curving * 0.1 * dist_x * clamp_factor. A small
    // floor keeps even tiny wires gently bowed — a wire never becomes a
    // paper-thin hard line.
    const handle = Math.max(14, curving * 0.1 * distAlong * clampFactor)
    c1 = { x: from.x + n1.x * handle, y: from.y + n1.y * handle }
    c2 = { x: to.x + n2.x * handle, y: to.y + n2.y * handle }
  }

  if (bend) {
    // Shift both control points sideways so the whole wire bows into its
    // lane while both ends stay glued to their ports.
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

// The point halfway along the wire (t = 0.5 of the cubic), so a link's label
// chip always sits on its own wire — not shared with a parallel one.
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

// Which pole does this port belong to ('pos', 'neg', or null if unknown)?
export function poleOfPort(story, sceneId, portId) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return null
  const b = loc.scene.board || {}
  if ((b.pos || []).includes(portId)) return 'pos'
  if ((b.neg || []).includes(portId)) return 'neg'
  return null
}

// The rule of the wires: NEGATIVE always connects INTO POSITIVE.
// Given two endpoints, returns the canonical link ends with `from` = the
// negative port's scene and `to` = the positive port's scene, or null when the
// two ports share the same polarity (the link would be invalid).
export function normalizeEnds(story, aSceneId, aPortId, bSceneId, bPortId) {
  if (!aSceneId || !bSceneId || aSceneId === bSceneId || !aPortId || !bPortId) return null
  const pa = poleOfPort(story, aSceneId, aPortId)
  const pb = poleOfPort(story, bSceneId, bPortId)
  if (!pa || !pb || pa === pb) return null
  return pa === 'neg'
    ? { fromSceneId: aSceneId, fromPortId: aPortId, toSceneId: bSceneId, toPortId: bPortId }
    : { fromSceneId: bSceneId, fromPortId: bPortId, toSceneId: aSceneId, toPortId: aPortId }
}

function setScene(story, sceneId, patch) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s))
    }))
  }
}

function setBoardOf(story, sceneId, fn) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) =>
        s.id === sceneId ? { ...s, board: fn({ ...(s.board || {}) }) } : s
      )
    }))
  }
}

// ---------- mutations (pure) ----------

export function setScenePos(story, sceneId, x, y) {
  return setBoardOf(story, sceneId, (b) => ({ ...b, x, y }))
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

// Add one more port (positive on the left, negative on the right).
export function addPort(story, sceneId, pole) {
  const key = pole === 'neg' ? 'neg' : 'pos'
  const id = uid()
  return setBoardOf(story, sceneId, (b) => ({ ...b, [key]: [...(b[key] || []), id] }))
}

// Add a wire between two endpoints. Polarity is normalized inside, so passing
// either order works — the stored link always flows negative → positive.
export function addLink(story, link) {
  const ends = normalizeEnds(
    story,
    link.aSceneId ?? link.fromSceneId,
    link.aPortId ?? link.fromPortId,
    link.bSceneId ?? link.toSceneId,
    link.bPortId ?? link.toPortId
  )
  if (!ends) return story
  const id = link.id || uid()
  return {
    ...story,
    board: {
      ...(story.board || {}),
      links: [
        ...(story.board?.links || []),
        {
          id,
          fromSceneId: ends.fromSceneId,
          fromPortId: ends.fromPortId,
          toSceneId: ends.toSceneId,
          toPortId: ends.toPortId,
          type: link.type || DEFAULT_LINK_TYPE,
          label: link.label || '',
          note: link.note || ''
        }
      ]
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
    board: {
      ...(story.board || {}),
      links: (story.board?.links || []).filter((l) => l.id !== linkId)
    }
  }
}

// ---------- tags ----------

export function addTag(story, sceneId, tag) {
  const t = String(tag || '').trim()
  if (!t) return story
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return story
  const tags = loc.scene.tags || []
  if (tags.includes(t)) return story
  return setScene(story, sceneId, { tags: [...tags, t] })
}

export function removeTag(story, sceneId, tag) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return story
  return setScene(story, sceneId, { tags: (loc.scene.tags || []).filter((t) => t !== tag) })
}

// ---------- zones / layout ----------

export function moveZone(story, chapterId, dx, dy, origZone, origin) {
  const zone = {
    x: Math.round(origZone.x + dx),
    y: Math.round(origZone.y + dy),
    w: origZone.w,
    h: origZone.h
  }
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

// ---------- pruning & upgrades ----------

// Remove every wire (storyline and timeline) that touches this scene.
export function pruneLinksForScene(story, sceneId) {
  const keepB = (story.board?.links || []).filter(
    (l) => l.fromSceneId !== sceneId && l.toSceneId !== sceneId
  )
  const keepT = (story.timeline?.links || []).filter(
    (l) => l.fromSceneId !== sceneId && l.toSceneId !== sceneId
  )
  return {
    ...story,
    board: { ...(story.board || {}), links: keepB },
    timeline: { ...(story.timeline || {}), links: keepT }
  }
}

// Bring any older .dknproj file up to the positive/negative wiring model:
//  • every scene gets at least one positive and one negative port (old plugs
//    on the left become extra positive ports, any others extra negative ones),
//  • old plug-anchored wires are re-created as negative → positive wires,
//  • the timeline's "actual story" wire list exists.
export function upgradeBoard(story) {
  let s = {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((scn) => {
        const b = scn.board || {}
        const plugs = Array.isArray(b.plugs) ? b.plugs : []
        const pos = Array.isArray(b.pos) ? [...b.pos] : []
        const neg = Array.isArray(b.neg) ? [...b.neg] : []
        const oldLeft = plugs.filter((p) => p && p.side === 'left').length
        const oldRight = plugs.length - oldLeft
        while (pos.length < 1 + oldLeft) pos.push(uid())
        while (neg.length < 1 + oldRight) neg.push(uid())
        const board = { ...b, pos, neg }
        delete board.plugs
        return { ...scn, board }
      })
    })),
    timeline: { ...(story.timeline || {}), links: [...(story.timeline?.links || [])] }
  }

  // Re-create old plug wires as polarity wires.
  const oldLinks = Array.isArray(story.board?.links) ? story.board.links : []
  const rebuilt = []
  for (const l of oldLinks) {
    if (!l || !l.from || !l.to) continue
    const fromSceneId = l.from.sceneId
    const toSceneId = l.to.sceneId
    if (!fromSceneId || !toSceneId || fromSceneId === toSceneId) continue
    const negId = ensurePort(s, fromSceneId, 'neg')
    const posId = ensurePort(s, toSceneId, 'pos')
    if (negId && posId) {
      rebuilt.push({
        id: l.id || uid(),
        fromSceneId,
        fromPortId: negId,
        toSceneId,
        toPortId: posId,
        type: l.type || DEFAULT_LINK_TYPE,
        label: l.label || '',
        note: l.note || ''
      })
    }
  }
  if (rebuilt.length || !Array.isArray(story.board?.links)) {
    s = { ...s, board: { ...(s.board || {}), links: rebuilt } }
  }
  return s
}

function ensurePort(story, sceneId, pole) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return null
  const arr = pole === 'neg' ? loc.scene.board?.neg : loc.scene.board?.pos
  if (arr && arr.length) return arr[0]
  const next = addPort(story, sceneId, pole)
  const nl = findSceneLoc(next, sceneId)
  const nArr = pole === 'neg' ? nl.scene.board.neg : nl.scene.board.pos
  return nArr && nArr.length ? nArr[nArr.length - 1] : null
}

// Full sanity pass: upgrade old files, then drop any wire whose ports are
// gone or whose polarity no longer holds.
export function sanitizeBoard(story) {
  const upgraded = upgradeBoard(story)
  const links = (upgraded.board?.links || []).filter((l) => {
    const pa = poleOfPort(upgraded, l.fromSceneId, l.fromPortId)
    const pb = poleOfPort(upgraded, l.toSceneId, l.toPortId)
    return pa === 'neg' && pb === 'pos'
  })
  const tlLinks = (upgraded.timeline?.links || []).filter(
    (l) =>
      l.fromSceneId &&
      l.toSceneId &&
      l.fromSceneId !== l.toSceneId &&
      findSceneLoc(upgraded, l.fromSceneId) &&
      findSceneLoc(upgraded, l.toSceneId)
  )
  return {
    ...upgraded,
    board: { ...(upgraded.board || {}), links },
    timeline: { ...(upgraded.timeline || {}), links: tlLinks }
  }
}

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
