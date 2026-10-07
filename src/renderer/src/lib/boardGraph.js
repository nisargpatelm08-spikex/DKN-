// The board as a graph — pure functions on story objects.
//
// Scenes are NODES (each with a world position and positive/negative ports)
// and wires are directed EDGES that always flow NEGATIVE → POSITIVE. This
// module builds that graph, answers position questions ("which scene is
// here?", "where is the next free spot?"), computes every edge's direction
// vector so it can be drawn with its colour, and snapshots the whole graph
// to/from the working temp file.
//
// The temp-file flow: while the story is still being written the board graph
// lives in a small working file (see App); when the user saves the project
// the graph is committed into the real .dknproj and the temp file is cleared.

import {
  CARD_W,
  CARD_H,
  GAP_Y,
  effScenePos,
  effPorts,
  PLUG_TYPE_MAP,
  DEFAULT_LINK_TYPE,
  zoneColor
} from './boardUtils'

const typeOf = (id) => PLUG_TYPE_MAP[id] || PLUG_TYPE_MAP[DEFAULT_LINK_TYPE]

// ---------- building the graph ----------

export function buildBoardGraph(story) {
  const nodes = []
  const adjacency = new Map() // nodeId -> [{ edgeId, otherId, direction }]
  story.chapters.forEach((chapter, ci) => {
    chapter.scenes.forEach((scene, si) => {
      const pos = effScenePos(scene, chapter, ci)
      const node = {
        id: scene.id,
        title: scene.title || 'Scene',
        chapterId: chapter.id,
        chapterIndex: ci,
        sceneIndex: si,
        x: pos.x,
        y: pos.y,
        w: CARD_W,
        h: CARD_H,
        color: zoneColor(ci),
        ports: effPorts(scene, chapter, ci)
      }
      nodes.push(node)
      adjacency.set(scene.id, [])
    })
  })
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const portOf = (node, portId) => node.ports.find((p) => p.portId === portId)

  const edges = (story.board?.links || []).flatMap((link) => {
    const from = nodeById.get(link.fromSceneId)
    const to = nodeById.get(link.toSceneId)
    if (!from || !to) return []
    const pf = portOf(from, link.fromPortId)
    const pt = portOf(to, link.toPortId)
    if (!pf || pf.pole !== 'neg' || !pt || pt.pole !== 'pos') return []
    const type = typeOf(link.type)
    const dx = pt.x - pf.x
    const dy = pt.y - pf.y
    return [
      {
        id: link.id,
        fromId: from.id,
        toId: to.id,
        fromPortId: pf.portId,
        toPortId: pt.portId,
        type: type.id,
        color: type.color,
        label: link.label || '',
        note: link.note || '',
        from: { x: pf.x, y: pf.y },
        to: { x: pt.x, y: pt.y },
        vector: {
          dx,
          dy,
          len: Math.hypot(dx, dy),
          angle: Math.atan2(dy, dx)
        }
      }
    ]
  })

  for (const edge of edges) {
    adjacency.get(edge.fromId).push({ edgeId: edge.id, otherId: edge.toId, direction: 'out' })
    adjacency.get(edge.toId).push({ edgeId: edge.id, otherId: edge.fromId, direction: 'in' })
  }

  return { storyId: story.id, nodes, edges, adjacency, nodeById }
}

// ---------- position detection ----------

// Which scene card sits at this world position, if any?
export function nodeAt(graph, x, y) {
  for (const n of graph.nodes) {
    if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n
  }
  return null
}

// The nearest scene (by card centre) within maxDist, or null.
export function nearestNode(graph, x, y, maxDist = Infinity) {
  let best = null
  let bestD = maxDist
  for (const n of graph.nodes) {
    const d = Math.hypot(x - (n.x + n.w / 2), y - (n.y + n.h / 2))
    if (d <= bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

// Would a card dropped at (x, y) collide with any existing card?
export function overlaps(graph, x, y, pad = 12) {
  return graph.nodes.some(
    (n) =>
      x < n.x + n.w + pad && x + CARD_W + pad > n.x && y < n.y + n.h + pad && y + CARD_H + pad > n.y
  )
}

// Find the nearest free spot for a new card by spiralling out from a start
// point. With no start, place just below the chapter's last card. Returns
// { x, y } in world coordinates.
export function autoPlace(graph, chapterId, startX, startY) {
  const chapterNodes = graph.nodes.filter((n) => n.chapterId === chapterId)
  let sx = startX
  let sy = startY
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    if (chapterNodes.length) {
      const last = chapterNodes[chapterNodes.length - 1]
      sx = last.x
      sy = last.y + CARD_H + GAP_Y
    } else {
      sx = 90
      sy = 110
    }
  }
  if (!overlaps(graph, sx, sy)) return { x: Math.round(sx), y: Math.round(sy) }
  const step = 60
  for (let ring = 1; ring < 50; ring++) {
    const r = ring * step
    const cands = [
      [sx + r, sy],
      [sx, sy + r],
      [sx - r, sy],
      [sx, sy - r],
      [sx + r, sy + r],
      [sx + r, sy - r],
      [sx - r, sy + r],
      [sx - r, sy - r]
    ]
    for (const [cx, cy] of cands) {
      if (!overlaps(graph, cx, cy)) return { x: Math.round(cx), y: Math.round(cy) }
    }
  }
  return { x: Math.round(sx + 400), y: Math.round(sy) }
}

// ---------- working temp file: snapshot <-> merge ----------

// Write the board graph (scene positions + every wire) as a small JSON blob.
// This is the "working" copy that lives until the project is saved.
export function snapshotBoardGraph(story) {
  return {
    kind: 'dkn-board-graph',
    version: 1,
    storyId: story.id,
    savedAt: Date.now(),
    scenes: story.chapters.flatMap((c, ci) =>
      c.scenes.map((s) => {
        const b = s.board || {}
        return {
          id: s.id,
          chapterIndex: ci,
          x: Number.isFinite(b.x) ? b.x : null,
          y: Number.isFinite(b.y) ? b.y : null,
          pos: Array.isArray(b.pos) ? b.pos : [],
          neg: Array.isArray(b.neg) ? b.neg : []
        }
      })
    ),
    boardLinks: story.board?.links || [],
    timelineLinks: story.timeline?.links || []
  }
}

// Apply a snapshot back onto a story (used when recovering a session). Only
// scenes that still exist are touched, and only when the story ids match, so
// a leftover temp file never bleeds into another story.
export function mergeBoardGraph(story, snap) {
  if (!snap || snap.kind !== 'dkn-board-graph' || snap.storyId !== story.id) return story
  const recById = new Map((snap.scenes || []).map((s) => [s.id, s]))
  let out = {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) => {
        const rec = recById.get(s.id)
        if (!rec) return s
        const b = { ...(s.board || {}) }
        if (Number.isFinite(rec.x) && Number.isFinite(rec.y)) {
          b.x = rec.x
          b.y = rec.y
        }
        if (Array.isArray(rec.pos) && rec.pos.length) b.pos = rec.pos
        if (Array.isArray(rec.neg) && rec.neg.length) b.neg = rec.neg
        return { ...s, board: b }
      })
    }))
  }
  if (Array.isArray(snap.boardLinks)) {
    out = { ...out, board: { ...(out.board || {}), links: snap.boardLinks } }
  }
  if (Array.isArray(snap.timelineLinks)) {
    out = { ...out, timeline: { ...(out.timeline || {}), links: snap.timelineLinks } }
  }
  return out
}
