import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import * as B from '../lib/boardUtils'
import * as T from '../lib/timelineUtils'
import { getPrefs } from '../lib/prefs'
import { WORLD, WORLD_HALF, useCanvasView, useViewportSize, useWheelZoom } from '../lib/canvasView'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const typeOf = (id) => B.PLUG_TYPE_MAP[id] || B.PLUG_TYPE_MAP[B.DEFAULT_PLUG_TYPE]

export default function Board({
  story,
  selectedSceneId,
  onSelectScene,
  onOpenInEditor,
  onAddScene,
  onAddSceneAt,
  onAddChapterAt,
  commit,
  patch,
  endSession
}) {
  const viewportRef = useRef(null)
  const vpRect = useViewportSize(viewportRef)
  const { view, setView, toWorld, toScreen, zoomAt, zoomBy, fitBounds } = useCanvasView(viewportRef)
  const [drag, setDrag] = useState(null)
  const [plugPopover, setPlugPopover] = useState(null) // sceneId
  const [selectedLinkId, setSelectedLinkId] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, worldX, worldY, chapter }
  const [linkDraft, setLinkDraft] = useState({ type: B.DEFAULT_PLUG_TYPE, label: '' })
  const [plugDraft, setPlugDraft] = useState({ side: 'left', type: B.DEFAULT_PLUG_TYPE, label: '', note: '' })
  const prefsRef = useRef(getPrefs())

  useWheelZoom(viewportRef, (e) => {
    const rect = viewportRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const p = prefsRef.current
    if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? p.zoomStep : 1 / p.zoomStep, cx, cy)
    else setView((v) => ({ ...v, tx: v.tx - e.deltaX * p.panSpeed, ty: v.ty - e.deltaY * p.panSpeed }))
  })

  // ---------- derived data ----------

  const board = useMemo(() => {
    const chapters = story.chapters.map((chapter, ci) => {
      const zone = B.effZone(chapter, ci, chapter.scenes)
      return {
        chapter,
        ci,
        zone,
        color: B.zoneColor(ci),
        scenes: chapter.scenes.map((scene, si) => {
          const pos = B.effScenePos(scene, chapter, ci)
          return {
            scene,
            si,
            x: pos.x,
            y: pos.y,
            num: `${ci + 1}.${si + 1}`,
            color: B.zoneColor(ci),
            plugs: B.plugPoints(scene, chapter, ci)
          }
        })
      }
    })
    const plugLookup = new Map()
    chapters.forEach((c) =>
      c.scenes.forEach((sc) => sc.plugs.forEach((p) => plugLookup.set(sc.scene.id + ':' + p.id, p)))
    )
    const links = (story.board?.links || []).flatMap((link) => {
      const from = plugLookup.get(link.from?.sceneId + ':' + link.from?.plugId)
      const to = plugLookup.get(link.to?.sceneId + ':' + link.to?.plugId)
      if (!from || !to) return []
      const type = typeOf(link.type)
      return [{ link, from, to, type, d: B.linkPath(from, to), mid: B.midOf(from, to) }]
    })
    return { chapters, links }
  }, [story])

  const allPlugs = useMemo(
    () => board.chapters.flatMap((c) => c.scenes.flatMap((sc) => sc.plugs)),
    [board]
  )

  const zoneAt = (x, y) => {
    for (const c of board.chapters) {
      const z = c.zone
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return c
    }
    return null
  }

  useEffect(() => {
    fitBounds(B.boundsOf(story))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPlugPopover(null)
        setSelectedLinkId(null)
        setCtxMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the right-click menu when the user clicks anywhere else.
  useEffect(() => {
    const close = () => setCtxMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  // ---------- pan ----------

  const onViewportPointerDown = (e) => {
    if (e.button !== 0) return
    setDrag({
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      tx: view.tx,
      ty: view.ty
    })
    e.currentTarget.setPointerCapture(e.pointerId)
    setPlugPopover(null)
    setSelectedLinkId(null)
    setCtxMenu(null)
  }

  const onViewportPointerMove = (e) => {
    const d = drag
    if (d && d.kind === 'pan') {
      setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.startX), ty: d.ty + (e.clientY - d.startY) }))
    }
  }

  const onViewportPointerUp = () => {
    setDrag((d) => (d && d.kind === 'pan' ? null : d))
  }

  // ---------- card drag ----------

  const onCardPointerDown = (e, sc) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      kind: 'card',
      sceneId: sc.scene.id,
      startClient: { x: e.clientX, y: e.clientY },
      startPos: { x: sc.x, y: sc.y },
      moved: false
    })
  }

  const onCardPointerMove = (e, sc) => {
    const d = drag
    if (!d || d.kind !== 'card' || d.sceneId !== sc.scene.id) return
    const moved =
      Math.abs(e.clientX - d.startClient.x) + Math.abs(e.clientY - d.startClient.y) > 4
    if (moved) {
      const dx = (e.clientX - d.startClient.x) / view.scale
      const dy = (e.clientY - d.startClient.y) / view.scale
      patch((s) => B.setScenePos(s, d.sceneId, Math.round(d.startPos.x + dx), Math.round(d.startPos.y + dy)))
      setDrag((prev) => (prev && prev.kind === 'card' ? { ...prev, moved: true } : prev))
    }
  }

  const onCardPointerUp = (e, sc) => {
    const d = drag
    if (!d || d.kind !== 'card' || d.sceneId !== sc.scene.id) return
    setDrag(null)
    if (!d.moved) return
    const w = toWorld(e.clientX, e.clientY)
    const target = zoneAt(w.x, w.y)
    if (target) {
      const loc = B.findSceneLoc(story, d.sceneId)
      if (loc && loc.chapter.id !== target.chapter.id) {
        patch((s) => B.moveSceneToChapter(s, d.sceneId, target.chapter.id))
      }
    }
    endSession()
  }

  // ---------- zone drag ----------

  const onZonePointerDown = (e, ch) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    const origin = {}
    ch.scenes.forEach((sc) => {
      origin[sc.scene.id] = { x: sc.x, y: sc.y }
    })
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      kind: 'zone',
      chapterId: ch.chapter.id,
      startClient: { x: e.clientX, y: e.clientY },
      origZone: { ...ch.zone },
      origin,
      moved: false
    })
  }

  const onZonePointerMove = (e, ch) => {
    const d = drag
    if (!d || d.kind !== 'zone' || d.chapterId !== ch.chapter.id) return
    if (Math.abs(e.clientX - d.startClient.x) + Math.abs(e.clientY - d.startClient.y) > 4) {
      patch((s) =>
        B.moveZone(
          s,
          d.chapterId,
          (e.clientX - d.startClient.x) / view.scale,
          (e.clientY - d.startClient.y) / view.scale,
          d.origZone,
          d.origin
        )
      )
      setDrag((prev) => (prev && prev.kind === 'zone' ? { ...prev, moved: true } : prev))
    }
  }

  const onZonePointerUp = (e, ch) => {
    const d = drag
    if (!d || d.kind !== 'zone' || d.chapterId !== ch.chapter.id) return
    setDrag(null)
    if (!d.moved) {
      if (ch.scenes.length && ch.scenes[0]) onSelectScene(ch.scenes[0].scene.id)
      return
    }
    endSession()
  }

  // ---------- link drawing ----------

  const onPlugPointerDown = (e, sc, plug) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedLinkId(null)
    setPlugPopover(null)
    setDrag({
      kind: 'link',
      fromSceneId: sc.scene.id,
      fromPlugId: plug.id,
      fromX: plug.x,
      fromY: plug.y,
      fromSide: plug.side,
      worldX: plug.x,
      worldY: plug.y,
      snap: null,
      fallback: null
    })
  }

  const onPlugPointerMove = (e) => {
    const d = drag
    if (!d || d.kind !== 'link') return
    const w = toWorld(e.clientX, e.clientY)
    // Strong snap: another plug close enough that you clearly aimed at it.
    const snapT = 30 / view.scale
    let snap = null
    for (const p of allPlugs) {
      if (p.sceneId === d.fromSceneId && p.id === d.fromPlugId) continue
      const dist = Math.hypot(p.x - w.x, p.y - w.y)
      if (dist < snapT && (!snap || dist < snap.dist)) snap = { ...p, dist }
    }
    // Soft target: no strong snap, but there's a plug nearby you're pointed at.
    let fallback = null
    if (!snap) {
      const farT = 150 / view.scale
      for (const p of allPlugs) {
        if (p.sceneId === d.fromSceneId && p.id === d.fromPlugId) continue
        const dist = Math.hypot(p.x - w.x, p.y - w.y)
        if (dist < farT && (!fallback || dist < fallback.dist)) fallback = { ...p, dist }
      }
    }
    setDrag((prev) =>
      prev && prev.kind === 'link' ? { ...prev, worldX: w.x, worldY: w.y, snap, fallback } : prev
    )
  }

  const pickSide = (wx, wy, sc) => {
    const cx = sc.x + B.CARD_W / 2
    const cy = sc.y + B.CARD_H / 2
    const dx = wx - cx
    const dy = wy - cy
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
    return dy >= 0 ? 'bottom' : 'top'
  }

  const nearestSceneTo = (wx, wy) => {
    let best = null
    for (const ch of board.chapters) {
      for (const sc of ch.scenes) {
        const cx = sc.x + B.CARD_W / 2
        const cy = sc.y + B.CARD_H / 2
        const dist = Math.hypot(cx - wx, cy - wy)
        if (!best || dist < best.dist) best = { sc, dist }
      }
    }
    return best
  }

  const onPlugPointerUp = () => {
    const d = drag
    if (!d || d.kind !== 'link') return
    setDrag(null)
    const target = d.snap || d.fallback
    if (target) {
      // Perfect: the wire lands on a real plug dot.
      patch((s) =>
        B.addLink(s, {
          from: { sceneId: d.fromSceneId, plugId: d.fromPlugId },
          to: { sceneId: target.sceneId, plugId: target.plugId },
          type: linkDraft.type,
          label: linkDraft.label.trim()
        })
      )
    } else {
      // No plug nearby: attach to the closest scene and give it a matching plug
      // so the link is never left hanging in mid-air.
      const tsc = nearestSceneTo(d.worldX, d.worldY)
      if (tsc) {
        patch((s) => {
          let next = s
          const loc = B.findSceneLoc(next, tsc.sc.scene.id)
          if (!loc) return s
          let plug = (loc.scene.board?.plugs || []).find((p) => p.type === linkDraft.type)
          if (!plug) {
            next = B.addPlug(next, tsc.sc.scene.id, {
              side: pickSide(d.worldX, d.worldY, tsc.sc),
              type: linkDraft.type,
              label: ''
            })
            const loc2 = B.findSceneLoc(next, tsc.sc.scene.id)
            plug = (loc2?.scene.board?.plugs || []).find((p) => p.type === linkDraft.type) || null
          }
          if (!plug) return s
          return B.addLink(next, {
            from: { sceneId: d.fromSceneId, plugId: d.fromPlugId },
            to: { sceneId: tsc.sc.scene.id, plugId: plug.id },
            type: linkDraft.type,
            label: linkDraft.label.trim()
          })
        })
      }
    }
    endSession()
  }

  const onLinkPointerDown = (e, link) => {
    e.stopPropagation()
    if (e.button !== 0) return
    setPlugPopover(null)
    setSelectedLinkId(link.link.id === selectedLinkId ? null : link.link.id)
  }

  // ---------- helpers ----------

  const getOrAddTypePlug = (s, sceneId, side, typeId) => {
    const loc = B.findSceneLoc(s, sceneId)
    if (!loc) return [s, null]
    const plugs = loc.scene.board?.plugs || []
    let plug = plugs.find((p) => p.type === typeId)
    if (plug) return [s, plug]
    s = B.addPlug(s, sceneId, { side, type: typeId, label: '' })
    plug = B.findSceneLoc(s, sceneId).scene.board.plugs.find((p) => p.type === typeId) || null
    return [s, plug]
  }

  const autoTimeLinks = () => {
    const dated = T.datedScenes(story)
    if (dated.length < 2) return
    commit((s) => {
      let next = s
      const existing = new Set(
        (s.board?.links || []).map((l) => [l.from?.sceneId, l.to?.sceneId].sort().join(':'))
      )
      for (let i = 0; i + 1 < dated.length; i++) {
        const aId = dated[i].scene.id
        const bId = dated[i + 1].scene.id
        const key = [aId, bId].sort().join(':')
        if (existing.has(key)) continue
        next = getOrAddTypePlug(next, aId, 'right', 'timeorder')[0]
        next = getOrAddTypePlug(next, bId, 'left', 'timeorder')[0]
        const aPlug = B.findSceneLoc(next, aId).scene.board.plugs.find((p) => p.type === 'timeorder')
        const bPlug = B.findSceneLoc(next, bId).scene.board.plugs.find((p) => p.type === 'timeorder')
        next = B.addLink(next, {
          from: { sceneId: aId, plugId: aPlug.id },
          to: { sceneId: bId, plugId: bPlug.id },
          type: 'timeorder',
          label: ''
        })
        existing.add(key)
      }
      return next
    })
  }

  // ---------- right-click context menu ----------

  const onBoardContextMenu = (e) => {
    e.preventDefault()
    const w = toWorld(e.clientX, e.clientY)
    const at = zoneAt(w.x, w.y)
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      worldX: w.x,
      worldY: w.y,
      chapter: at ? at.chapter : null
    })
  }

  const addSceneHere = () => {
    const menu = ctxMenu
    setCtxMenu(null)
    if (!menu) return
    const target = menu.chapter || story.chapters[0] || null
    if (target) onAddSceneAt(target.id, menu.worldX, menu.worldY)
    else onAddChapterAt(menu.worldX, menu.worldY)
  }

  const addChapterHere = () => {
    const menu = ctxMenu
    setCtxMenu(null)
    if (!menu) return
    onAddChapterAt(menu.worldX, menu.worldY)
  }

  // ---------- render helpers ----------

  const selectedChapterId =
    board.chapters.find((c) => c.scenes.some((sc) => sc.scene.id === selectedSceneId))?.chapter.id ||
    story.chapters[0]?.id

  const ghostPath =
    drag && drag.kind === 'link'
      ? B.linkPath(
          { x: drag.fromX, y: drag.fromY, side: drag.fromSide },
          { x: drag.worldX, y: drag.worldY, side: drag.worldX >= drag.fromX ? 'left' : 'right' }
        )
      : ''

  const ring = drag && drag.kind === 'link' ? drag.snap || drag.fallback : null

  const popupScene = plugPopover
    ? board.chapters.flatMap((c) => c.scenes).find((sc) => sc.scene.id === plugPopover)
    : null

  let popLeft = 0
  let popTop = 0
  if (popupScene) {
    const s = toScreen(popupScene.x, popupScene.y)
    const W = 320
    popLeft = s.x + B.CARD_W * view.scale + 14
    if (popLeft + W > vpRect.width - 8) popLeft = Math.max(8, s.x - W - 14)
    popTop = clamp(s.y, 8, Math.max(8, vpRect.height - 430))
  }

  const selectedLink = selectedLinkId
    ? board.links.find((l) => l.link.id === selectedLinkId) || null
    : null
  let linkPopLeft = 0
  let linkPopTop = 0
  if (selectedLink) {
    const s = toScreen(selectedLink.mid.x, selectedLink.mid.y)
    linkPopLeft = clamp(s.x + 14, 8, Math.max(8, vpRect.width - 320))
    linkPopTop = clamp(s.y - 20, 8, Math.max(8, vpRect.height - 260))
  }

  // ---------- render ----------

  return (
    <div className="board">
      <div className="board-toolbar">
        <button
          className="board-tool-btn"
          onClick={() => onAddScene(selectedChapterId)}
          title="Add a scene to this chapter"
        >
          ＋ Scene
        </button>
        <button
          className="board-tool-btn"
          onClick={() => commit((s) => B.arrangeTimeline(s))}
          title="Lay every chapter out in order, left to right"
        >
          ⇆ Arrange
        </button>
        <button
          className="board-tool-btn"
          onClick={() => commit((s) => B.fitZones(s))}
          title="Resize chapter zones around their scenes"
        >
          ▣ Zones
        </button>
        <button
          className="board-tool-btn"
          onClick={autoTimeLinks}
          title="Draw 'time order' links between scenes dated on the Timeline"
        >
          ⌚ by time
        </button>
        <span className="board-sep" />
        <button className="board-tool-btn" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">
          −
        </button>
        <span className="board-zoom">{Math.round(view.scale * 100)}%</span>
        <button className="board-tool-btn" onClick={() => zoomBy(1.25)} title="Zoom in">
          ＋
        </button>
        <button
          className="board-tool-btn"
          onClick={() => fitBounds(B.boundsOf(story))}
          title="Fit the whole story in view"
        >
          ⛶ Fit
        </button>
        <span className="board-sep" />
        <label className="board-linkdraft">
          New link:
          <select
            value={linkDraft.type}
            onChange={(e) => setLinkDraft({ ...linkDraft, type: e.target.value })}
          >
            {B.PLUG_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={linkDraft.label}
            placeholder="label"
            onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })}
          />
        </label>
      </div>

      <div
        ref={viewportRef}
        className="board-viewport"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
        onContextMenu={onBoardContextMenu}
      >
        <div
          className="board-world"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            width: WORLD,
            height: WORLD
          }}
        >
          {/* chapter zones */}
          {board.chapters.map((ch) => (
            <div
              key={'zone-' + ch.chapter.id}
              className="board-zone"
              style={{
                left: ch.zone.x,
                top: ch.zone.y,
                width: ch.zone.w,
                height: ch.zone.h,
                borderColor: ch.color,
                background: B.hexToRgba(ch.color, 0.07)
              }}
            >
              <div
                className="board-zone-title"
                style={{ background: B.hexToRgba(ch.color, 0.18), color: ch.color }}
                onPointerDown={(e) => onZonePointerDown(e, ch)}
                onPointerMove={(e) => onZonePointerMove(e, ch)}
                onPointerUp={(e) => onZonePointerUp(e, ch)}
              >
                <span className="board-zone-name">{ch.chapter.title}</span>
                <span className="board-zone-count">{ch.chapter.scenes.length} scenes</span>
              </div>
            </div>
          ))}

          {/* links */}
          <svg
            className="board-links"
            width={WORLD}
            height={WORLD}
            viewBox={`-${WORLD_HALF} -${WORLD_HALF} ${WORLD} ${WORLD}`}
          >
            <defs>
              {B.PLUG_TYPES.map((t) => (
                <marker key={t.id} id={'arr-' + t.id} markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto">
                  <path d="M0 0 L11 5.5 L0 11 Z" fill={t.color} />
                </marker>
              ))}
            </defs>
            {board.links.map(({ link, d, type }) => (
              <g key={'l-' + link.id} className={'board-link-g' + (selectedLinkId === link.id ? ' selected' : '')}>
                <path className="board-link-hit" d={d} onPointerDown={(e) => onLinkPointerDown(e, { link })} />
                <path
                  className="board-link"
                  d={d}
                  stroke={type.color}
                  strokeDasharray={type.dash || undefined}
                  markerEnd={'url(#arr-' + type.id + ')'}
                />
              </g>
            ))}
            {drag && drag.kind === 'link' && (
              <path
                className="board-link board-link-ghost"
                d={ghostPath}
                stroke={typeOf(linkDraft.type).color}
              />
            )}
          </svg>

          {/* scene cards */}
          {board.chapters.flatMap((ch) =>
            ch.scenes.map((sc) => (
              <div
                key={'card-' + sc.scene.id}
                className={'board-card' + (sc.scene.id === selectedSceneId ? ' selected' : '')}
                style={{ left: sc.x, top: sc.y, width: B.CARD_W, height: B.CARD_H }}
                onPointerDown={(e) => onCardPointerDown(e, sc)}
                onPointerMove={(e) => onCardPointerMove(e, sc)}
                onPointerUp={(e) => onCardPointerUp(e, sc)}
                onClick={() => onSelectScene(sc.scene.id)}
                onDoubleClick={() => onOpenInEditor(sc.scene.id)}
              >
                <div className="board-card-bar" style={{ background: sc.color }} />
                {sc.scene.image ? (
                  <img className="board-card-thumb" src={sc.scene.image} alt="" draggable={false} />
                ) : (
                  <div className="board-card-thumb board-card-thumb-empty">🖼</div>
                )}
                <div className="board-card-info">
                  <span className="board-card-num" style={{ color: sc.color }}>
                    {sc.num}
                  </span>
                  <span className="board-card-title">{sc.scene.title}</span>
                </div>
                <button
                  className="board-addplug"
                  title="Plugs & links"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setPlugPopover(sc.scene.id)
                    setSelectedLinkId(null)
                  }}
                >
                  ⚡
                </button>
                {sc.plugs.map((p) => (
                  <div key={'plugwrap-' + p.id}>
                    <div
                      key={'plug-' + p.id}
                      className={
                        'board-plug' +
                        (drag &&
                        drag.kind === 'link' &&
                        drag.snap &&
                        drag.snap.sceneId === sc.scene.id &&
                        drag.snap.plugId === p.id
                          ? ' snap'
                          : '')
                      }
                      style={{
                        left: p.x - sc.x - 7,
                        top: p.y - sc.y - 7,
                        borderColor: typeOf(p.type).color
                      }}
                      title={p.note ? p.note + ' (' + typeOf(p.type).label + ')' : p.label || typeOf(p.type).label}
                      onPointerDown={(e) => onPlugPointerDown(e, sc, p)}
                      onPointerMove={onPlugPointerMove}
                      onPointerUp={onPlugPointerUp}
                    />
                    {p.note && view.scale >= 0.7 && (
                      <div
                        className="board-plug-note"
                        style={{ left: p.x - sc.x - 7, top: p.y - sc.y + 10 }}
                        title={p.note}
                      >
                        » {p.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* overlay: link labels + snap ring + popovers */}
        <div
          className="board-overlay"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {board.links.map(({ link, mid, type }) => {
            const s = toScreen(mid.x, mid.y)
            return (
              <div
                key={'chip-' + link.id}
                className={'board-linkchip' + (selectedLinkId === link.id ? ' selected' : '')}
                style={{ left: s.x, top: s.y }}
                title={link.note || link.label || type.label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setPlugPopover(null)
                  setSelectedLinkId(link.id === selectedLinkId ? null : link.id)
                }}
              >
                <span className="board-linkchip-dot" style={{ background: type.color }} />
                <span className="board-linkchip-text">
                  {link.label || type.label}
                  {link.note ? ' 📝' : ''}
                </span>
              </div>
            )
          })}

          {ring && (
            <div
              className={'board-snapring' + (drag && drag.kind === 'link' && !drag.snap ? ' far' : '')}
              style={{
                left: toScreen(ring.x, ring.y).x,
                top: toScreen(ring.x, ring.y).y,
                borderColor: typeOf(linkDraft.type).color
              }}
            />
          )}

          {popupScene && (
            <div className="board-popover" style={{ left: popLeft, top: popTop, width: 320 }}>
              <div className="board-popover-head">
                <span className="pop-title">{popupScene.scene.title}</span>
                <button className="pop-close" onClick={() => setPlugPopover(null)}>
                  ✕
                </button>
              </div>
              <div className="pop-block-label">Plugs on this scene</div>
              {popupScene.plugs.length === 0 && (
                <div className="pop-empty">No plugs yet — add one below.</div>
              )}
              {popupScene.plugs.map((p) => (
                <div key={p.id} className="plug-item">
                  <div className="plug-row">
                    <span className="plug-row-dot" style={{ background: typeOf(p.type).color }} />
                    <select
                      value={p.type}
                      onChange={(e) => commit((s) => B.updatePlug(s, popupScene.scene.id, p.id, { type: e.target.value }))}
                    >
                      {B.PLUG_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={p.side}
                      onChange={(e) => commit((s) => B.updatePlug(s, popupScene.scene.id, p.id, { side: e.target.value }))}
                    >
                      {B.SIDES.map((sd) => (
                        <option key={sd} value={sd}>
                          {B.SIDE_LABELS[sd]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="plug-label"
                      value={p.label || ''}
                      placeholder="label"
                      onChange={(e) => commit((s) => B.updatePlug(s, popupScene.scene.id, p.id, { label: e.target.value }))}
                    />
                    <button
                      className="pop-x"
                      title="Remove plug"
                      onClick={() => commit((s) => B.removePlug(s, popupScene.scene.id, p.id))}
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="plug-label plug-label-note"
                    value={p.note || ''}
                    placeholder="Note (optional) — why this plug exists…"
                    onChange={(e) => commit((s) => B.updatePlug(s, popupScene.scene.id, p.id, { note: e.target.value }))}
                  />
                </div>
              ))}
              <div className="pop-block-label">Add plug</div>
              <div className="plug-row">
                <select
                  value={plugDraft.side}
                  onChange={(e) => setPlugDraft({ ...plugDraft, side: e.target.value })}
                >
                  {B.SIDES.map((sd) => (
                    <option key={sd} value={sd}>
                      {B.SIDE_LABELS[sd]}
                    </option>
                  ))}
                </select>
                <select
                  value={plugDraft.type}
                  onChange={(e) => setPlugDraft({ ...plugDraft, type: e.target.value })}
                >
                  {B.PLUG_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  className="pop-add"
                  onClick={() => {
                    commit((s) =>
                      B.addPlug(s, popupScene.scene.id, {
                        side: plugDraft.side,
                        type: plugDraft.type,
                        label: plugDraft.label.trim(),
                        note: (plugDraft.note || '').trim()
                      })
                    )
                    setPlugDraft({ ...plugDraft, label: '', note: '' })
                  }}
                >
                  ＋ Add
                </button>
              </div>
              <input
                className="plug-label plug-label-wide"
                value={plugDraft.label}
                placeholder="Optional label for this plug…"
                onChange={(e) => setPlugDraft({ ...plugDraft, label: e.target.value })}
              />
              <input
                className="plug-label plug-label-wide"
                value={plugDraft.note || ''}
                placeholder="Optional note — why this plug exists…"
                onChange={(e) => setPlugDraft({ ...plugDraft, note: e.target.value })}
              />
              <div className="pop-hint">
                Drag from a dot to another dot to draw a link — releasing anywhere on a scene still
                connects to its nearest plug.
              </div>
            </div>
          )}

          {selectedLink && (
            <div className="board-popover" style={{ left: linkPopLeft, top: linkPopTop, width: 300 }}>
              <div className="board-popover-head">
                <span className="pop-title">Edit link</span>
                <button className="pop-close" onClick={() => setSelectedLinkId(null)}>
                  ✕
                </button>
              </div>
              <div className="pop-block-label">Type</div>
              <select
                value={selectedLink.link.type}
                onChange={(e) => commit((s) => B.updateLink(s, selectedLink.link.id, { type: e.target.value }))}
              >
                {B.PLUG_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="pop-block-label">Label</div>
              <input
                className="plug-label plug-label-wide"
                value={selectedLink.link.label || ''}
                placeholder="Optional label, e.g. “because…”"
                onChange={(e) => commit((s) => B.updateLink(s, selectedLink.link.id, { label: e.target.value }))}
              />
              <div className="pop-block-label">Note (optional — why this link matters)</div>
              <input
                className="plug-label plug-label-wide"
                value={selectedLink.link.note || ''}
                placeholder="e.g. Chapter 3 depends on this promise…"
                onChange={(e) => commit((s) => B.updateLink(s, selectedLink.link.id, { note: e.target.value }))}
              />
              <button
                className="pop-danger"
                onClick={() => {
                  commit((s) => B.removeLink(s, selectedLink.link.id))
                  setSelectedLinkId(null)
                }}
              >
                Delete link
              </button>
            </div>
          )}
        </div>

        {ctxMenu && (
          <div
            className="board-ctxmenu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="board-ctxmenu-title">Add on board</div>
            <button className="board-ctxmenu-item" onClick={addSceneHere}>
              ＋ New scene here
            </button>
            <button className="board-ctxmenu-item" onClick={addChapterHere}>
              ＋ New chapter here
            </button>
            {story.chapters.length > 1 && (
              <>
                <div className="board-ctxmenu-title">New scene in…</div>
                {story.chapters.map((c) => (
                  <button
                    key={c.id}
                    className={'board-ctxmenu-item' + (ctxMenu.chapter && ctxMenu.chapter.id === c.id ? ' current' : '')}
                    onClick={() => {
                      onAddSceneAt(c.id, ctxMenu.worldX, ctxMenu.worldY)
                      setCtxMenu(null)
                    }}
                  >
                    {ctxMenu.chapter && ctxMenu.chapter.id === c.id ? '▸ ' : ''}
                    {c.title}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="board-legend">
          <span className="board-legend-title">Links</span>
          {B.PLUG_TYPES.map((t) => (
            <span key={t.id} className="board-legend-item">
              <span className="board-legend-dot" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>

        <div className="board-hint">
          Drag background to pan · Scroll to move · Ctrl+Scroll to zoom · Right-click for quick add ·
          Drag a dot onto a dot to link · ⚡ adds plugs · Double-click a card to edit
        </div>
      </div>
    </div>
  )
}

Board.propTypes = {
  story: PropTypes.object.isRequired,
  selectedSceneId: PropTypes.string,
  onSelectScene: PropTypes.func.isRequired,
  onOpenInEditor: PropTypes.func.isRequired,
  onAddScene: PropTypes.func.isRequired,
  onAddSceneAt: PropTypes.func.isRequired,
  onAddChapterAt: PropTypes.func.isRequired,
  commit: PropTypes.func.isRequired,
  patch: PropTypes.func.isRequired,
  endSession: PropTypes.func.isRequired
}