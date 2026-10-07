// Wire & scene tools for the Board (the W and S menus). Pure functions on
// story objects — every one returns a NEW story (or the same one when there
// is nothing to do), so they plug straight into commit() and undo.
//
// Wire rule everywhere: a wire leaves a scene's NEGATIVE port (right edge)
// and enters another scene's POSITIVE port (left edge).

import {
  CARD_W,
  CARD_H,
  DEFAULT_LINK_TYPE,
  addLink,
  effScenePos,
  findSceneLoc,
  fitZones,
  uid
} from './boardUtils'

// ---------- small helpers ----------

const linksOf = (story) => story.board?.links || []

const withLinks = (story, links) => ({ ...story, board: { ...(story.board || {}), links } })

function mapScene(story, sceneId, fn) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) => (s.id === sceneId ? fn(s) : s))
    }))
  }
}

// Make sure a scene has real (stored) port ids on both sides.
export function ensurePorts(story, sceneId) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return story
  const b = loc.scene.board || {}
  const hasPos = Array.isArray(b.pos) && b.pos.length
  const hasNeg = Array.isArray(b.neg) && b.neg.length
  if (hasPos && hasNeg) return story
  return mapScene(story, sceneId, (s) => ({
    ...s,
    board: {
      ...(s.board || {}),
      pos: hasPos ? b.pos : [uid()],
      neg: hasNeg ? b.neg : [uid()]
    }
  }))
}

// A port on this side with no wire on it yet — or a brand-new one, so every
// wire gets its own dot and wires never pile onto one port.
function freePort(story, sceneId, pole) {
  let next = ensurePorts(story, sceneId)
  const ids = findSceneLoc(next, sceneId).scene.board[pole]
  const used = new Set(
    linksOf(next)
      .filter((l) => (pole === 'neg' ? l.fromSceneId === sceneId : l.toSceneId === sceneId))
      .map((l) => (pole === 'neg' ? l.fromPortId : l.toPortId))
  )
  const free = ids.find((id) => !used.has(id))
  if (free) return { story: next, portId: free }
  const portId = uid()
  next = mapScene(next, sceneId, (s) => ({
    ...s,
    board: { ...s.board, [pole]: [...s.board[pole], portId] }
  }))
  return { story: next, portId }
}

export function areConnected(story, fromId, toId) {
  return linksOf(story).some((l) => l.fromSceneId === fromId && l.toSceneId === toId)
}

// Every scene in reading order: chapter by chapter, scene by scene.
export function sceneOrder(story) {
  return story.chapters.flatMap((c) => c.scenes.map((s) => ({ id: s.id, chapterId: c.id })))
}

export function nextSceneId(story, sceneId) {
  const order = sceneOrder(story)
  const i = order.findIndex((o) => o.id === sceneId)
  return i >= 0 && i < order.length - 1 ? order[i + 1].id : null
}

// ---------- connecting ----------

// Wire scene A (negative) → scene B (positive) using free ports. Does nothing
// if A already flows into B.
export function connectScenes(story, fromId, toId, opts = {}) {
  if (!fromId || !toId || fromId === toId) return story
  if (!findSceneLoc(story, fromId) || !findSceneLoc(story, toId)) return story
  if (areConnected(story, fromId, toId)) return story
  const a = freePort(story, fromId, 'neg')
  const b = freePort(a.story, toId, 'pos')
  return addLink(b.story, {
    fromSceneId: fromId,
    fromPortId: a.portId,
    toSceneId: toId,
    toPortId: b.portId,
    type: opts.type || DEFAULT_LINK_TYPE,
    label: opts.label || ''
  })
}

// Auto sequence: wire every scene to the next one in reading order (the whole
// story, or one chapter). Pairs that are already wired are left alone.
export function autoSequence(story, opts = {}) {
  const order = sceneOrder(story).filter((o) => !opts.chapterId || o.chapterId === opts.chapterId)
  let next = story
  for (let i = 0; i < order.length - 1; i++) {
    next = connectScenes(next, order[i].id, order[i + 1].id, opts)
  }
  return next
}

// Put a scene INTO an existing wire: A → C becomes A → B → C (keeps the
// wire's type and label on both halves).
export function insertSceneIntoLink(story, linkId, sceneId) {
  const link = linksOf(story).find((l) => l.id === linkId)
  if (!link || link.fromSceneId === sceneId || link.toSceneId === sceneId) return story
  if (!findSceneLoc(story, sceneId)) return story
  let next = withLinks(
    story,
    linksOf(story).filter((l) => l.id !== linkId)
  )
  const opts = { type: link.type, label: link.label }
  next = connectScenes(next, link.fromSceneId, sceneId, opts)
  next = connectScenes(next, sceneId, link.toSceneId, opts)
  return next
}

// ---------- cutting ----------

export function removeLinks(story, ids) {
  const set = new Set(ids)
  if (!set.size) return story
  return withLinks(
    story,
    linksOf(story).filter((l) => !set.has(l.id))
  )
}

export function disconnectScene(story, sceneId) {
  return withLinks(
    story,
    linksOf(story).filter((l) => l.fromSceneId !== sceneId && l.toSceneId !== sceneId)
  )
}

export function removeAllLinks(story) {
  return withLinks(story, [])
}

// Do segments p1-p2 and p3-p4 cross?
export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  // Touching counts as crossing (a knife passing exactly through a sample
  // point must still cut); fully collinear segments don't.
  if ((d1 === 0 && d2 === 0) || (d3 === 0 && d4 === 0)) return false
  return d1 * d2 <= 0 && d3 * d4 <= 0
}

// Does the knife line a-b cross the polyline (a sampled wire)?
export function lineCutsPolyline(a, b, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentsIntersect(a, b, pts[i], pts[i + 1])) return true
  }
  return false
}

// ---------- beautify ----------

// Tidy the wiring without moving any card:
//  • drop duplicate wires (same scenes, same type)
//  • give every wire its own port, ordered top → bottom by where the other
//    end sits, so wires leaving / entering a card never cross each other
//  • remove ports nobody uses (each side keeps at least one)
// Returns { story, removed, reordered } so the UI can say what changed.
export function beautifyWires(story) {
  const seen = new Set()
  const unique = []
  for (const l of linksOf(story)) {
    const key = l.fromSceneId + '>' + l.toSceneId + '>' + (l.type || '')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(l)
  }
  const removed = linksOf(story).length - unique.length

  const centreY = new Map()
  const centreX = new Map()
  story.chapters.forEach((c, ci) =>
    c.scenes.forEach((s) => {
      const p = effScenePos(s, c, ci)
      centreY.set(s.id, p.y + CARD_H / 2)
      centreX.set(s.id, p.x + CARD_W / 2)
    })
  )
  const byOther = (otherOf) => (p, q) =>
    (centreY.get(otherOf(p)) ?? 0) - (centreY.get(otherOf(q)) ?? 0) ||
    (centreX.get(otherOf(p)) ?? 0) - (centreX.get(otherOf(q)) ?? 0) ||
    String(p.id).localeCompare(String(q.id))

  const links = unique.map((l) => ({ ...l }))
  let reordered = 0
  const boards = new Map()
  for (const c of story.chapters) {
    for (const s of c.scenes) {
      const b = s.board || {}
      const plan = (pole) => {
        const mine = links
          .filter((l) => (pole === 'neg' ? l.fromSceneId === s.id : l.toSceneId === s.id))
          .sort(byOther((l) => (pole === 'neg' ? l.toSceneId : l.fromSceneId)))
        const old = Array.isArray(b[pole]) ? b[pole] : []
        const ids = []
        for (let i = 0; i < Math.max(1, mine.length); i++) ids.push(old[i] || uid())
        mine.forEach((l, i) => {
          const key = pole === 'neg' ? 'fromPortId' : 'toPortId'
          if (l[key] !== ids[i]) reordered++
          l[key] = ids[i]
        })
        return ids
      }
      boards.set(s.id, { ...b, pos: plan('pos'), neg: plan('neg') })
    }
  }
  const next = withLinks(
    {
      ...story,
      chapters: story.chapters.map((c) => ({
        ...c,
        scenes: c.scenes.map((s) => ({ ...s, board: boards.get(s.id) }))
      }))
    },
    links
  )
  return { story: next, removed, reordered }
}

// ---------- arrange by wire flow ----------

// Lay the cards out so every wire flows left → right: each scene's column is
// one step to the right of the scene that feeds it (cycles are broken in
// reading order). Chapters stay on their own rows so their zones never
// overlap; unwired scenes keep reading order at the end of their row.
export function arrangeByWires(story, opts = {}) {
  const colW = opts.colW || CARD_W + 130
  const rowGap = opts.rowGap || 40
  const order = sceneOrder(story)
  const index = new Map(order.map((o, i) => [o.id, i]))
  const edges = []
  const seen = new Set()
  for (const l of linksOf(story)) {
    if (!index.has(l.fromSceneId) || !index.has(l.toSceneId)) continue
    const key = l.fromSceneId + '>' + l.toSceneId
    if (seen.has(key) || l.fromSceneId === l.toSceneId) continue
    seen.add(key)
    edges.push([l.fromSceneId, l.toSceneId])
  }
  const wired = new Set(edges.flat())

  // Kahn's topological sort; when stuck on a cycle, release the earliest
  // remaining scene (in reading order).
  const indeg = new Map(order.map((o) => [o.id, 0]))
  edges.forEach(([, v]) => indeg.set(v, indeg.get(v) + 1))
  const rank = new Map(order.map((o) => [o.id, 0]))
  const done = new Set()
  const remaining = order.map((o) => o.id)
  while (done.size < remaining.length) {
    let ready = remaining.filter((id) => !done.has(id) && indeg.get(id) === 0)
    if (!ready.length) {
      ready = [remaining.find((id) => !done.has(id))]
    }
    for (const u of ready) {
      done.add(u)
      for (const [a, v] of edges) {
        if (a !== u || done.has(v)) continue
        rank.set(v, Math.max(rank.get(v), rank.get(u) + 1))
        indeg.set(v, indeg.get(v) - 1)
      }
    }
  }

  const maxWiredRank = Math.max(0, ...[...wired].map((id) => rank.get(id)))
  let y = 110
  const x0 = 90
  const chapters = story.chapters.map((chapter) => {
    // column -> scenes in that column for this chapter
    const cols = new Map()
    let tail = maxWiredRank + 1
    for (const s of chapter.scenes) {
      const col = wired.has(s.id) ? rank.get(s.id) : tail++
      if (!cols.has(col)) cols.set(col, [])
      cols.get(col).push(s.id)
    }
    const stack = Math.max(1, ...[...cols.values()].map((list) => list.length))
    const pos = new Map()
    cols.forEach((list, col) =>
      list.forEach((id, i) => pos.set(id, { x: x0 + col * colW, y: y + i * (CARD_H + rowGap) }))
    )
    y += stack * (CARD_H + rowGap) + 110
    return {
      ...chapter,
      scenes: chapter.scenes.map((s) => ({
        ...s,
        board: { ...(s.board || {}), ...pos.get(s.id) }
      }))
    }
  })
  return fitZones({ ...story, chapters })
}

// ---------- scene tools ----------

// A copy of a scene right after the original (new ids, no wires).
export function duplicateScene(story, sceneId, at) {
  const loc = findSceneLoc(story, sceneId)
  if (!loc) return { story, newId: null }
  const src = loc.scene
  const newId = uid()
  const pos = effScenePos(src, loc.chapter, loc.chapterIndex)
  const copy = {
    ...src,
    id: newId,
    title: (src.title || 'Scene') + ' (copy)',
    tags: Array.isArray(src.tags) ? [...src.tags] : src.tags,
    timeline: src.timeline ? { ...src.timeline } : src.timeline,
    board: {
      x: at ? at.x : pos.x + 36,
      y: at ? at.y : pos.y + 36,
      pos: [uid()],
      neg: [uid()]
    }
  }
  const next = {
    ...story,
    chapters: story.chapters.map((c) => {
      if (c.id !== loc.chapter.id) return c
      const scenes = [...c.scenes]
      scenes.splice(loc.sceneIndex + 1, 0, copy)
      return { ...c, scenes }
    })
  }
  return { story: next, newId }
}
