import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import * as B from '../lib/boardUtils'
import * as W from '../lib/wireTools'
import * as G from '../lib/boardGraph'
import {
  getPrefs,
  savePrefs,
  PREFS_EVENT,
  PREFS_DEFAULTS,
  keyMatches,
  isTypingTarget,
  describeKey
} from '../lib/prefs'
import { WORLD, WORLD_HALF, useCanvasView, useViewportSize, useWheelZoom } from '../lib/canvasView'
import ToolMenu from './ToolMenu'
import ShortcutSettings from './ShortcutSettings'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const typeOf = (id) => B.PLUG_TYPE_MAP[id] || B.PLUG_TYPE_MAP[B.DEFAULT_LINK_TYPE]

export default function Board({
  story,
  selectedSceneId,
  onSelectScene,
  onOpenInEditor,
  onAddScene,
  onAddSceneAt,
  onAddChapterAt,
  onDeleteScene,
  onAddPhoto,
  commit,
  patch,
  endSession
}) {
  const viewportRef = useRef(null)
  const vpRect = useViewportSize(viewportRef)
  const { view, setView, toWorld, toScreen, zoomAt, zoomBy, fitBounds } = useCanvasView(viewportRef)
  const [drag, setDrag] = useState(null)
  const [selectedLinkId, setSelectedLinkId] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, worldX, worldY, chapter }
  const [sceneMenu, setSceneMenu] = useState(null) // { sceneId, x, y, tag }
  const [linkDraft, setLinkDraft] = useState({ type: B.DEFAULT_LINK_TYPE, label: '' })
  // W / S tool menus, the ✂ cut knife, and a short status message.
  const [toolMenu, setToolMenu] = useState(null) // { kind: 'wire'|'scene', x, y, sceneId, hovered }
  const [cutMode, setCutMode] = useState(false)
  const [cutLine, setCutLine] = useState(null) // viewport-relative { x1, y1, x2, y2, c1, c2 }
  const [flash, setFlash] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hoveredSceneRef = useRef(null)
  const lastMouseRef = useRef(null) // viewport-relative mouse position
  // Preferences react to live changes (e.g. the Thread bend slider in the
  // Timeline's Settings panel redraws the threads as it moves).
  const [prefs, setPrefs] = useState(getPrefs)
  const prefsRef = useRef(prefs)
  const threadCurve = (prefs.threadCurve ?? PREFS_DEFAULTS.threadCurve) / 100
  useEffect(() => {
    const onPrefs = (e) => {
      prefsRef.current = e.detail
      setPrefs(e.detail)
    }
    window.addEventListener(PREFS_EVENT, onPrefs)
    return () => window.removeEventListener(PREFS_EVENT, onPrefs)
  }, [])

  useWheelZoom(viewportRef, (e) => {
    const rect = viewportRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const p = prefsRef.current
    if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? p.zoomStep : 1 / p.zoomStep, cx, cy)
    else
      setView((v) => ({ ...v, tx: v.tx - e.deltaX * p.panSpeed, ty: v.ty - e.deltaY * p.panSpeed }))
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
            ports: B.effPorts(scene, chapter, ci)
          }
        })
      }
    })
    const portLookup = new Map()
    chapters.forEach((c) =>
      c.scenes.forEach((sc) =>
        sc.ports.forEach((p) => portLookup.set(sc.scene.id + ':' + p.portId, p))
      )
    )
    // Storyline wires. A wire always flows from a NEGATIVE port (right edge)
    // of its "from" scene into a POSITIVE port (left edge) of its "to" scene.
    const links = (story.board?.links || []).flatMap((link) => {
      const from = portLookup.get(link.fromSceneId + ':' + link.fromPortId)
      const to = portLookup.get(link.toSceneId + ':' + link.toPortId)
      if (!from || !to || from.pole !== 'neg' || to.pole !== 'pos') return []
      return [{ link, from, to, type: typeOf(link.type) }]
    })
    // Threads between the same two scenes are fanned into lanes, so no two
    // threads are ever drawn exactly on top of each other.
    const groups = new Map()
    links.forEach((it) => {
      const a = it.link.fromSceneId
      const b = it.link.toSceneId
      const key = a < b ? a + '|' + b : b + '|' + a
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(it)
    })
    const BEND = 18
    groups.forEach((items) => {
      items.sort(
        (p, q) =>
          String(p.type.id).localeCompare(String(q.type.id)) ||
          String(p.link.id).localeCompare(String(q.link.id))
      )
      const n = items.length
      items.forEach((it, i) => {
        it.bend = n === 1 ? 0 : (i - (n - 1) / 2) * BEND
        it.d = B.linkPath(it.from, it.to, it.bend, threadCurve)
        it.mid = B.midOf(it.from, it.to, it.bend, threadCurve)
        it.angle = B.tangentOf(it.from, it.to, it.bend, threadCurve).angle
      })
    })
    return { chapters, links, portLookup }
  }, [story, threadCurve])

  const allPorts = useMemo(
    () => board.chapters.flatMap((c) => c.scenes.flatMap((sc) => sc.ports)),
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
        setSelectedLinkId(null)
        setCtxMenu(null)
        setSceneMenu(null)
        setToolMenu(null)
        setCutMode(false)
        setCutLine(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the right-click menus when the user clicks anywhere else.
  useEffect(() => {
    const close = () => {
      setCtxMenu(null)
      setSceneMenu(null)
      setToolMenu(null)
    }
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
    setSelectedLinkId(null)
    setCtxMenu(null)
    setSceneMenu(null)
  }

  const onViewportPointerMove = (e) => {
    const vr = viewportRef.current?.getBoundingClientRect()
    if (vr) lastMouseRef.current = { x: e.clientX - vr.left, y: e.clientY - vr.top }
    const d = drag
    if (d && d.kind === 'pan') {
      setView((v) => ({
        ...v,
        tx: d.tx + (e.clientX - d.startX),
        ty: d.ty + (e.clientY - d.startY)
      }))
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
    const moved = Math.abs(e.clientX - d.startClient.x) + Math.abs(e.clientY - d.startClient.y) > 4
    if (moved) {
      const dx = (e.clientX - d.startClient.x) / view.scale
      const dy = (e.clientY - d.startClient.y) / view.scale
      patch((s) =>
        B.setScenePos(s, d.sceneId, Math.round(d.startPos.x + dx), Math.round(d.startPos.y + dy))
      )
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

  // ---------- wire drawing (drag from a port) ----------

  const onPortPointerDown = (e, port) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedLinkId(null)
    setSceneMenu(null)
    setCtxMenu(null)
    setDrag({
      kind: 'link',
      fromSceneId: port.sceneId,
      fromPortId: port.portId,
      fromPole: port.pole,
      fromX: port.x,
      fromY: port.y,
      worldX: port.x,
      worldY: port.y,
      snap: null,
      fallback: null
    })
  }

  const onPortPointerMove = (e) => {
    const d = drag
    if (!d || d.kind !== 'link') return
    const w = toWorld(e.clientX, e.clientY)
    // Strong snap: a port close enough that you clearly aimed at it.
    const snapT = 30 / view.scale
    let snap = null
    for (const p of allPorts) {
      if (p.sceneId === d.fromSceneId && p.portId === d.fromPortId) continue
      const dist = Math.hypot(p.x - w.x, p.y - w.y)
      if (dist < snapT && (!snap || dist < snap.dist)) snap = { ...p, dist }
    }
    // Soft target: no strong snap, but there's a port nearby you're pointed at.
    let fallback = null
    if (!snap) {
      const farT = 150 / view.scale
      for (const p of allPorts) {
        if (p.sceneId === d.fromSceneId && p.portId === d.fromPortId) continue
        const dist = Math.hypot(p.x - w.x, p.y - w.y)
        if (dist < farT && (!fallback || dist < fallback.dist)) fallback = { ...p, dist }
      }
    }
    setDrag((prev) =>
      prev && prev.kind === 'link' ? { ...prev, worldX: w.x, worldY: w.y, snap, fallback } : prev
    )
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

  // Connect a wire from { fromSceneId, fromPortId } into scene bSceneId,
  // creating the missing opposite-pole port on it when needed. Pure helper:
  // the wire is negative → positive, whichever way the user dragged it.
  const wireInto = (s, fromSceneId, fromPortId, bSceneId, fromPole) => {
    const needPole = fromPole === 'neg' ? 'pos' : 'neg'
    let next = s
    let pid = B.findSceneLoc(next, bSceneId)?.scene.board?.[needPole]?.[0] || null
    if (!pid) {
      next = B.addPort(next, bSceneId, needPole)
      const loc = B.findSceneLoc(next, bSceneId)
      pid = loc.scene.board[needPole].slice(-1)[0]
    }
    return B.addLink(next, {
      aSceneId: fromSceneId,
      aPortId: fromPortId,
      bSceneId,
      bPortId: pid,
      type: linkDraft.type,
      label: linkDraft.label.trim()
    })
  }

  const onPortPointerUp = () => {
    const d = drag
    if (!d || d.kind !== 'link') return
    setDrag(null)
    const fromSceneId = d.fromSceneId
    const fromPortId = d.fromPortId
    const target = d.snap || d.fallback
    // 1) Landed on another scene's port: connect if polarity allows, or aim
    //    at the opposite pole of that scene (negative always into positive).
    if (target && target.sceneId !== fromSceneId) {
      if (B.normalizeEnds(story, fromSceneId, fromPortId, target.sceneId, target.portId)) {
        patch((s) =>
          B.addLink(s, {
            aSceneId: fromSceneId,
            aPortId: fromPortId,
            bSceneId: target.sceneId,
            bPortId: target.portId,
            type: linkDraft.type,
            label: linkDraft.label.trim()
          })
        )
        endSession()
        return
      }
      patch((s) => wireInto(s, fromSceneId, fromPortId, target.sceneId, d.fromPole))
      endSession()
      return
    }
    // 2) Dropped on empty canvas: attach to the nearest scene (no wire ever
    //    hangs in mid-air).
    const tsc = nearestSceneTo(d.worldX, d.worldY)
    if (tsc && tsc.sc.scene.id !== fromSceneId) {
      const cx = tsc.sc.x + B.CARD_W / 2
      const cy = tsc.sc.y + B.CARD_H / 2
      const far = 190 / view.scale
      if (Math.hypot(cx - d.worldX, cy - d.worldY) < far) {
        patch((s) => wireInto(s, fromSceneId, fromPortId, tsc.sc.scene.id, d.fromPole))
        endSession()
        return
      }
    }
  }

  const onLinkPointerDown = (e, link) => {
    e.stopPropagation()
    if (e.button !== 0) return
    setSelectedLinkId(link.link.id === selectedLinkId ? null : link.link.id)
  }

  // ---------- right-click on a scene card ----------

  const onSceneContextMenu = (e, sc) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedLinkId(null)
    setCtxMenu(null)
    setSceneMenu({ sceneId: sc.scene.id, x: e.clientX, y: e.clientY, tag: '' })
  }

  const menuScene = sceneMenu
    ? board.chapters.flatMap((c) => c.scenes).find((sc) => sc.scene.id === sceneMenu.sceneId)
    : null

  const addMenuPort = (pole) => {
    if (!menuScene) return
    commit((s) => B.addPort(s, menuScene.scene.id, pole))
    setSceneMenu(null)
  }

  const addMenuTag = () => {
    const tag = (sceneMenu.tag || '').trim()
    if (!menuScene) {
      setSceneMenu(null)
      return
    }
    if (tag) commit((s) => B.addTag(s, menuScene.scene.id, tag))
    setSceneMenu(null)
  }

  const removeMenuTag = (tag) => {
    if (!menuScene) return
    commit((s) => B.removeTag(s, menuScene.scene.id, tag))
  }

  const transferMenuScene = (targetChapterId) => {
    if (!menuScene) return
    const loc = B.findSceneLoc(story, menuScene.scene.id)
    if (loc && loc.chapter.id !== targetChapterId) {
      commit((s) => B.moveSceneToChapter(s, menuScene.scene.id, targetChapterId))
      onSelectScene(menuScene.scene.id)
    }
    setSceneMenu(null)
  }

  // ---------- right-click context menu (empty canvas) ----------

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

  // ---------- W / S tool menus ----------

  const keys = { ...PREFS_DEFAULTS.keys, ...(prefs.keys || {}) }

  const showFlash = (text) => {
    setFlash((f) => ({ text, n: (f ? f.n : 0) + 1 }))
  }
  // The status message fades out on its own.
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  const changePrefs = (patchData) => savePrefs({ ...prefsRef.current, ...patchData })

  const openToolMenu = (kind) => {
    setCtxMenu(null)
    setSceneMenu(null)
    setToolMenu((cur) => {
      if (cur && cur.kind === kind) return null
      const at = lastMouseRef.current || { x: vpRect.width / 2 - 140, y: 80 }
      const hovered = hoveredSceneRef.current
      return {
        kind,
        x: at.x + 8,
        y: at.y + 8,
        sceneId: hovered || selectedSceneId,
        hovered: !!hovered
      }
    })
  }

  // The menu keys. Re-registered every render so the actions always see the
  // latest story; ignored while typing or while a new key is being chosen.
  useEffect(() => {
    const onKey = (e) => {
      if (window.__dknCapturingKey || isTypingTarget(e) || e.repeat) return
      if (keyMatches(e, keys.wireMenu)) {
        e.preventDefault()
        openToolMenu('wire')
      } else if (keyMatches(e, keys.sceneMenu)) {
        e.preventDefault()
        openToolMenu('scene')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const allSceneItems = board.chapters.flatMap((c) => c.scenes)
  const sceneItem = (id) => allSceneItems.find((sc) => sc.scene.id === id) || null
  const sceneLabel = (id) => {
    const sc = sceneItem(id)
    return sc ? sc.num + ' ' + (sc.scene.title || 'Scene') : 'Scene'
  }
  const wiresOn = (id) =>
    (story.board?.links || []).filter((l) => l.fromSceneId === id || l.toSceneId === id).length

  const wireOpts = () => ({ type: linkDraft.type, label: linkDraft.label.trim() })

  const doConnectNext = (id) => {
    const nextId = W.nextSceneId(story, id)
    if (!nextId) return
    if (W.areConnected(story, id, nextId)) {
      showFlash('Already connected to ' + sceneLabel(nextId))
      return
    }
    commit((s) => W.connectScenes(s, id, nextId, wireOpts()))
    showFlash('⇢ Connected ' + sceneLabel(id) + ' → ' + sceneLabel(nextId))
  }

  const doAutoSequence = (chapterId) => {
    const before = (story.board?.links || []).length
    const next = W.autoSequence(story, { ...wireOpts(), chapterId })
    const added = (next.board?.links || []).length - before
    if (!added) {
      showFlash('Everything is already wired in order')
      return
    }
    commit(() => next)
    showFlash('⛓ Added ' + added + ' wire' + (added === 1 ? '' : 's') + ' in story order')
  }

  const doBeautify = () => {
    const r = W.beautifyWires(story)
    commit(() => r.story)
    const bits = []
    if (r.removed) bits.push(r.removed + ' duplicate' + (r.removed === 1 ? '' : 's') + ' removed')
    if (r.reordered) bits.push('ports untangled')
    showFlash(
      '✨ ' + (bits.length ? bits.join(' · ') : 'Wires already tidy — unused ports cleared')
    )
  }

  const doArrange = () => {
    const next = W.arrangeByWires(story)
    commit(() => next)
    setTimeout(() => fitBounds(B.boundsOf(next)), 0)
    showFlash('▦ Cards arranged so every wire flows left → right')
  }

  const doDuplicate = (id) => {
    const loc = B.findSceneLoc(story, id)
    if (!loc) return
    const p = B.effScenePos(loc.scene, loc.chapter, loc.chapterIndex)
    const spot = G.autoPlace(G.buildBoardGraph(story), loc.chapter.id, p.x + 36, p.y + 36)
    const r = W.duplicateScene(story, id, spot)
    commit(() => r.story)
    if (r.newId) onSelectScene(r.newId)
    showFlash('⧉ Duplicated ' + sceneLabel(id))
  }

  const wireMenuItems = () => {
    const sel = selectedLink
    const scId = toolMenu?.sceneId
    const sc = scId ? sceneItem(scId) : null
    const nextId = sc ? W.nextSceneId(story, sc.scene.id) : null
    const chapter = sc ? board.chapters.find((c) => c.scenes.includes(sc)) : null
    const linkCount = (story.board?.links || []).length
    return [
      { header: 'Cut' },
      {
        icon: '✂',
        label: 'Cut tool (knife)',
        hint: 'drag a line across wires to cut them',
        run: () => {
          setSelectedLinkId(null)
          setCutMode(true)
        }
      },
      {
        icon: '✕',
        label: 'Delete selected wire',
        hint: sel
          ? sceneLabel(sel.link.fromSceneId) + ' → ' + sceneLabel(sel.link.toSceneId)
          : 'click a wire first',
        disabled: !sel,
        run: () => {
          commit((s) => B.removeLink(s, sel.link.id))
          setSelectedLinkId(null)
          showFlash('✕ Wire deleted')
        }
      },
      {
        icon: '⊘',
        label: sc ? 'Disconnect ' + sc.num : 'Disconnect scene',
        hint: sc ? 'remove all ' + wiresOn(sc.scene.id) + ' wire(s) on this scene' : 'no scene',
        disabled: !sc || !wiresOn(sc.scene.id),
        run: () => {
          commit((s) => W.disconnectScene(s, sc.scene.id))
          showFlash('⊘ Disconnected ' + sceneLabel(sc.scene.id))
        }
      },
      { header: 'Connect' },
      {
        icon: '⇢',
        label: 'Connect to next scene',
        hint: sc && nextId ? sc.num + ' → ' + sceneLabel(nextId) : 'no next scene',
        disabled: !sc || !nextId,
        run: () => doConnectNext(sc.scene.id)
      },
      {
        icon: '⤳',
        label: 'Insert a scene into the selected wire',
        hint: sel ? 'A → (pick a scene) → B' : 'click a wire first',
        disabled: !sel,
        list: sel
          ? allSceneItems
              .filter(
                (x) => x.scene.id !== sel.link.fromSceneId && x.scene.id !== sel.link.toSceneId
              )
              .map((x) => ({
                label: x.num + ' ' + (x.scene.title || 'Scene'),
                run: () => {
                  commit((s) => W.insertSceneIntoLink(s, sel.link.id, x.scene.id))
                  setSelectedLinkId(null)
                  showFlash('⤳ Inserted ' + x.num + ' into the wire')
                }
              }))
          : []
      },
      {
        icon: '⛓',
        label: 'Auto sequence — whole story',
        hint: 'wire every scene to the next, chapter by chapter',
        disabled: allSceneItems.length < 2,
        run: () => doAutoSequence(null)
      },
      {
        icon: '⛓',
        label: 'Auto sequence — this chapter',
        hint: chapter ? chapter.chapter.title : 'no chapter',
        disabled: !chapter || chapter.scenes.length < 2,
        run: () => doAutoSequence(chapter.chapter.id)
      },
      { header: 'Tidy' },
      {
        icon: '✨',
        label: 'Beautify wires',
        hint: 'untangle ports, drop duplicates & unused ports',
        disabled: !linkCount,
        run: doBeautify
      },
      {
        icon: '▦',
        label: 'Arrange cards by wire flow',
        hint: 'moves cards so every wire runs left → right',
        disabled: !linkCount,
        run: doArrange
      },
      { sep: true },
      {
        icon: '🗑',
        label: 'Remove all wires',
        hint: linkCount + ' wire' + (linkCount === 1 ? '' : 's') + ' on the board',
        danger: true,
        disabled: !linkCount,
        run: () => {
          if (!window.confirm('Remove all ' + linkCount + ' wires from the board?')) return
          commit((s) => W.removeAllLinks(s))
          setSelectedLinkId(null)
          showFlash('🗑 All wires removed (Ctrl+Z to undo)')
        }
      }
    ]
  }

  const sceneMenuItems = () => {
    const sc = toolMenu?.sceneId ? sceneItem(toolMenu.sceneId) : null
    if (!sc)
      return [{ header: 'Click a scene card first, then press ' + describeKey(keys.sceneMenu) }]
    const id = sc.scene.id
    const nextId = W.nextSceneId(story, id)
    const chId = board.chapters.find((c) => c.scenes.includes(sc))?.chapter.id
    return [
      { header: 'Open' },
      {
        icon: '✎',
        label: 'Edit scene',
        hint: 'open it in the Editor',
        run: () => onOpenInEditor(id)
      },
      { icon: '🖼', label: 'Add photo', run: () => onAddPhoto(id) },
      { header: 'Ports & wires' },
      {
        icon: '＋',
        label: 'Add positive port',
        hint: 'left side — wires come IN here',
        run: () => commit((s) => B.addPort(s, id, 'pos'))
      },
      {
        icon: '−',
        label: 'Add negative port',
        hint: 'right side — wires go OUT from here',
        run: () => commit((s) => B.addPort(s, id, 'neg'))
      },
      {
        icon: '⇢',
        label: 'Connect to next scene',
        hint: nextId ? '→ ' + sceneLabel(nextId) : 'no next scene',
        disabled: !nextId,
        run: () => doConnectNext(id)
      },
      {
        icon: '⊘',
        label: 'Disconnect all wires',
        hint: wiresOn(id) + ' wire(s)',
        disabled: !wiresOn(id),
        run: () => {
          commit((s) => W.disconnectScene(s, id))
          showFlash('⊘ Disconnected ' + sceneLabel(id))
        }
      },
      { header: 'Organise' },
      {
        icon: '🏷',
        label: 'Add',
        input: {
          placeholder: 'Add a tag…',
          onSubmit: (tag) => {
            commit((s) => B.addTag(s, id, tag))
            showFlash('🏷 Tag “' + tag + '” added')
          }
        }
      },
      {
        icon: '📁',
        label: 'Move to chapter',
        disabled: story.chapters.length < 2,
        list: story.chapters.map((c) => ({
          label: c.title,
          current: c.id === chId,
          run: () => {
            if (c.id !== chId) commit((s) => B.moveSceneToChapter(s, id, c.id))
          }
        }))
      },
      {
        icon: '⧉',
        label: 'Duplicate scene',
        hint: 'a copy right next to it',
        run: () => doDuplicate(id)
      },
      { sep: true },
      { icon: '✕', label: 'Delete scene', danger: true, run: () => onDeleteScene(id) }
    ]
  }

  // ---------- ✂ cut knife ----------

  const onCutDown = (e) => {
    if (e.button === 2) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const vr = viewportRef.current.getBoundingClientRect()
    const x = e.clientX - vr.left
    const y = e.clientY - vr.top
    setCutLine({ x1: x, y1: y, x2: x, y2: y, c1: { x: e.clientX, y: e.clientY }, c2: null })
  }

  const onCutMove = (e) => {
    if (!cutLine) return
    const vr = viewportRef.current.getBoundingClientRect()
    setCutLine((l) =>
      l
        ? {
            ...l,
            x2: e.clientX - vr.left,
            y2: e.clientY - vr.top,
            c2: { x: e.clientX, y: e.clientY }
          }
        : l
    )
  }

  const onCutUp = () => {
    const l = cutLine
    setCutLine(null)
    if (!l || !l.c2 || Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 6) return
    const a = toWorld(l.c1.x, l.c1.y)
    const b = toWorld(l.c2.x, l.c2.y)
    const ids = board.links
      .filter((it) =>
        W.lineCutsPolyline(a, b, B.pointsAlong(it.from, it.to, it.bend, threadCurve, 32))
      )
      .map((it) => it.link.id)
    if (!ids.length) {
      showFlash('No wire crossed — drag the line across a wire')
      return
    }
    commit((s) => W.removeLinks(s, ids))
    if (ids.includes(selectedLinkId)) setSelectedLinkId(null)
    showFlash('✂ Cut ' + ids.length + ' wire' + (ids.length === 1 ? '' : 's') + ' (Ctrl+Z to undo)')
  }

  // ---------- render helpers ----------

  const selectedChapterId =
    board.chapters.find((c) => c.scenes.some((sc) => sc.scene.id === selectedSceneId))?.chapter
      .id || story.chapters[0]?.id

  // The ghost wire leaves on the port's side and arrives on the opposite
  // pole's side (negative leaves right, positive receives on the left).
  const ghostPath =
    drag && drag.kind === 'link'
      ? B.linkPath(
          { x: drag.fromX, y: drag.fromY, side: drag.fromPole === 'neg' ? 'right' : 'left' },
          { x: drag.worldX, y: drag.worldY, side: drag.fromPole === 'neg' ? 'left' : 'right' },
          0,
          threadCurve
        )
      : ''

  // Zoom-out dimming (Blender's `dim_factor`): threads stay readable when the
  // board is packed, but the ones you are not interacting with fade slightly
  // so the map does not shout. Selected threads stay fully bright.
  const dim = clamp((view.scale - 0.45) / 0.55, 0.35, 1)

  const ring = drag && drag.kind === 'link' ? drag.snap || drag.fallback : null

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

  const menuChapterId = menuScene
    ? board.chapters.find((c) => c.scenes.some((sc) => sc.scene.id === menuScene.scene.id))?.chapter
        .id
    : null

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
          New wire:
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
        <span className="board-sep" />
        <button
          className="board-tool-btn"
          onClick={() => openToolMenu('wire')}
          title={'Wire tools — or press ' + describeKey(keys.wireMenu)}
        >
          〰 Wires <kbd className="tool-kbd">{describeKey(keys.wireMenu)}</kbd>
        </button>
        <button
          className="board-tool-btn"
          onClick={() => openToolMenu('scene')}
          title={'Scene tools — or press ' + describeKey(keys.sceneMenu)}
        >
          ▢ Scene <kbd className="tool-kbd">{describeKey(keys.sceneMenu)}</kbd>
        </button>
        <button
          className={'board-tool-btn' + (cutMode ? ' active' : '')}
          onClick={() => {
            setCutMode((c) => !c)
            setCutLine(null)
          }}
          title="Cut tool: drag a line across wires to cut them"
        >
          ✂ Cut
        </button>
        <button
          className={'board-tool-btn' + (settingsOpen ? ' active' : '')}
          onClick={() => setSettingsOpen((o) => !o)}
          title="Shortcut keys and thread look"
        >
          ⚙ Settings
        </button>
      </div>

      {settingsOpen && (
        <div className="tl-sens-panel" onPointerDown={(e) => e.stopPropagation()}>
          <div className="board-popover-head">
            <span className="pop-title">Settings</span>
            <button className="pop-close" onClick={() => setSettingsOpen(false)}>
              ✕
            </button>
          </div>
          <ShortcutSettings prefs={prefs} onChange={changePrefs} />
          <div className="tl-sens-sep" />
          <div className="tl-sens-sub">Threads on the Board</div>
          <div className="tl-sens-row">
            <label>
              <span>Thread bend</span>
              <span>{prefs.threadCurve}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={prefs.threadCurve}
              onChange={(e) => changePrefs({ threadCurve: Number(e.target.value) })}
            />
          </div>
        </div>
      )}

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

          {/* wires */}
          {/* The svg's viewBox starts at -WORLD_HALF, so the element itself must
              sit at -WORLD_HALF too — then svg point (x, y) lands exactly on
              world (x, y), the same place the cards are drawn. */}
          <svg
            className="board-links"
            width={WORLD}
            height={WORLD}
            viewBox={`-${WORLD_HALF} -${WORLD_HALF} ${WORLD} ${WORLD}`}
            style={{ left: -WORLD_HALF, top: -WORLD_HALF }}
          >
            <defs>
              {B.PLUG_TYPES.map((t) => (
                <marker
                  key={t.id}
                  id={'arr-' + t.id}
                  markerWidth="13"
                  markerHeight="13"
                  refX="10.5"
                  refY="6.5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0 0 L13 6.5 L0 13 Z" fill={t.color} />
                </marker>
              ))}
            </defs>
            {board.links.map(({ link, from, to, d, mid, angle, type }) => {
              const selected = selectedLinkId === link.id
              return (
                <g key={'l-' + link.id} className={'board-link-g' + (selected ? ' selected' : '')}>
                  <path
                    className="board-link-hit"
                    d={d}
                    onPointerDown={(e) => onLinkPointerDown(e, { link })}
                  />
                  {/* soft wide under-stroke: the glowing ribbon edge (Blender's outer pass) */}
                  <path
                    className="board-link-soft"
                    d={d}
                    stroke={type.color}
                    style={{ opacity: selected ? 0.3 : dim * 0.22 }}
                  />
                  {/* bright solid core with the thread's colour, dash pattern and arrow (Blender's inner passes) */}
                  <path
                    className="board-link"
                    d={d}
                    stroke={type.color}
                    strokeDasharray={type.dash || undefined}
                    markerEnd={'url(#arr-' + type.id + ')'}
                    style={{
                      filter: `drop-shadow(0 0 ${selected ? 6 : 4}px ${type.color})`,
                      opacity: selected ? 1 : dim
                    }}
                  />
                  {/* anchor dots so the wire visibly starts and ends on both ports */}
                  <circle cx={from.x} cy={from.y} r={5} fill={type.color} />
                  <circle cx={to.x} cy={to.y} r={5} fill={type.color} />
                  {/* the direction chevron: always points NEGATIVE → POSITIVE, in the wire's colour */}
                  <g
                    className="board-link-chevron"
                    transform={`translate(${mid.x} ${mid.y}) rotate(${(
                      (angle / Math.PI) *
                      180
                    ).toFixed(1)})`}
                    style={{ opacity: selected ? 1 : dim }}
                  >
                    <polygon
                      points="-7,-7 7,0 -7,7"
                      fill={type.color}
                      style={{ filter: `drop-shadow(0 0 3px ${type.color})` }}
                    />
                  </g>
                </g>
              )
            })}
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
                onPointerEnter={() => {
                  hoveredSceneRef.current = sc.scene.id
                }}
                onPointerLeave={() => {
                  if (hoveredSceneRef.current === sc.scene.id) hoveredSceneRef.current = null
                }}
                onClick={() => onSelectScene(sc.scene.id)}
                onDoubleClick={() => onOpenInEditor(sc.scene.id)}
                onContextMenu={(e) => onSceneContextMenu(e, sc)}
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
                {Array.isArray(sc.scene.tags) && sc.scene.tags.length > 0 && (
                  <div className="board-card-tags">
                    {sc.scene.tags.map((t) => (
                      <span
                        key={t}
                        className="board-card-tag"
                        title="Right-click the scene to manage tags"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {sc.ports.map((p) => (
                  <div
                    key={'port-' + p.portId}
                    className={
                      'board-port ' +
                      (p.pole === 'pos' ? 'pos' : 'neg') +
                      (drag &&
                      drag.kind === 'link' &&
                      drag.snap &&
                      drag.snap.sceneId === sc.scene.id &&
                      drag.snap.portId === p.portId
                        ? ' snap'
                        : '')
                    }
                    style={{ left: p.x - sc.x - 7, top: p.y - sc.y - 7 }}
                    title={
                      p.pole === 'pos'
                        ? "Positive port — another scene's negative flows in here (left)"
                        : "Negative port — this flows into another scene's positive (right)"
                    }
                    onPointerDown={(e) => onPortPointerDown(e, p)}
                    onPointerMove={onPortPointerMove}
                    onPointerUp={onPortPointerUp}
                  >
                    {p.pole === 'pos' ? '＋' : '−'}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* overlay: wire labels + snap ring + popovers */}
        <div className="board-overlay" onPointerDown={(e) => e.stopPropagation()}>
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
              className={
                'board-snapring' + (drag && drag.kind === 'link' && !drag.snap ? ' far' : '')
              }
              style={{
                left: toScreen(ring.x, ring.y).x,
                top: toScreen(ring.x, ring.y).y,
                borderColor: typeOf(linkDraft.type).color
              }}
            />
          )}

          {selectedLink && (
            <div
              className="board-popover"
              style={{ left: linkPopLeft, top: linkPopTop, width: 300 }}
            >
              <div className="board-popover-head">
                <span className="pop-title">Edit wire</span>
                <button className="pop-close" onClick={() => setSelectedLinkId(null)}>
                  ✕
                </button>
              </div>
              <div className="pop-block-label">Type</div>
              <select
                value={selectedLink.link.type}
                onChange={(e) =>
                  commit((s) => B.updateLink(s, selectedLink.link.id, { type: e.target.value }))
                }
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
                onChange={(e) =>
                  commit((s) => B.updateLink(s, selectedLink.link.id, { label: e.target.value }))
                }
              />
              <div className="pop-block-label">Note (optional — why this link matters)</div>
              <input
                className="plug-label plug-label-wide"
                value={selectedLink.link.note || ''}
                placeholder="e.g. Chapter 3 depends on this promise…"
                onChange={(e) =>
                  commit((s) => B.updateLink(s, selectedLink.link.id, { note: e.target.value }))
                }
              />
              <button
                className="pop-danger"
                onClick={() => {
                  commit((s) => B.removeLink(s, selectedLink.link.id))
                  setSelectedLinkId(null)
                }}
              >
                Delete wire
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
                    className={
                      'board-ctxmenu-item' +
                      (ctxMenu.chapter && ctxMenu.chapter.id === c.id ? ' current' : '')
                    }
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

        {sceneMenu && menuScene && (
          <div
            className="board-ctxmenu board-scenemenu"
            style={{ left: sceneMenu.x, top: sceneMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="board-ctxmenu-title">{menuScene.scene.title}</div>
            <button className="board-ctxmenu-item" onClick={() => addMenuPort('pos')}>
              ＋ Positive port (left side)
            </button>
            <button className="board-ctxmenu-item" onClick={() => addMenuPort('neg')}>
              ＋ Negative port (right side)
            </button>
            <div className="board-ctxmenu-sep" />
            <button
              className="board-ctxmenu-item"
              onClick={() => {
                onOpenInEditor(menuScene.scene.id)
                setSceneMenu(null)
              }}
            >
              ✎ Edit scene
            </button>
            <button
              className="board-ctxmenu-item"
              onClick={() => {
                onAddPhoto(menuScene.scene.id)
                setSceneMenu(null)
              }}
            >
              🖼 Add photo
            </button>
            <div className="board-ctxmenu-title">Tags</div>
            {menuScene.scene.tags && menuScene.scene.tags.length > 0 ? (
              menuScene.scene.tags.map((t) => (
                <button
                  key={t}
                  className="board-ctxmenu-item board-ctxmenu-tag"
                  onClick={() => removeMenuTag(t)}
                  title="Click to remove this tag"
                >
                  🏷 {t} ✕
                </button>
              ))
            ) : (
              <div className="board-ctxmenu-none">No tags on this scene yet.</div>
            )}
            <div className="board-ctxmenu-tagrow">
              <input
                className="tag-input"
                value={sceneMenu.tag || ''}
                placeholder="Add a tag…"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setSceneMenu({ ...sceneMenu, tag: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    addMenuTag()
                  }
                }}
              />
              <button className="pop-add" onClick={addMenuTag}>
                Add
              </button>
            </div>
            <div className="board-ctxmenu-sep" />
            <div className="board-ctxmenu-title">Transfer to chapter</div>
            {story.chapters.map((c) => (
              <button
                key={c.id}
                className={'board-ctxmenu-item' + (c.id === menuChapterId ? ' current' : '')}
                onClick={() => transferMenuScene(c.id)}
              >
                {c.title}
              </button>
            ))}
            <div className="board-ctxmenu-sep" />
            <button
              className="board-ctxmenu-item danger"
              onClick={() => {
                const sid = menuScene.scene.id
                setSceneMenu(null)
                onDeleteScene(sid)
              }}
            >
              ✕ Delete scene
            </button>
          </div>
        )}

        {toolMenu && (
          <ToolMenu
            title={toolMenu.kind === 'wire' ? '〰 Wire tools' : '▢ Scene tools'}
            subtitle={
              toolMenu.sceneId && sceneItem(toolMenu.sceneId)
                ? (toolMenu.kind === 'wire' ? 'Scene: ' : '') +
                  sceneLabel(toolMenu.sceneId) +
                  (toolMenu.hovered ? '  (under the mouse)' : '  (selected)')
                : ''
            }
            x={toolMenu.x}
            y={toolMenu.y}
            bounds={vpRect}
            menuKey={toolMenu.kind === 'wire' ? keys.wireMenu : keys.sceneMenu}
            items={toolMenu.kind === 'wire' ? wireMenuItems() : sceneMenuItems()}
            onClose={() => setToolMenu(null)}
          />
        )}

        {cutMode && (
          <div
            className="cut-overlay"
            onPointerDown={onCutDown}
            onPointerMove={onCutMove}
            onPointerUp={onCutUp}
            onPointerCancel={() => setCutLine(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setCutMode(false)
              setCutLine(null)
            }}
          >
            <svg className="cut-svg">
              {cutLine && (
                <line
                  x1={cutLine.x1}
                  y1={cutLine.y1}
                  x2={cutLine.x2}
                  y2={cutLine.y2}
                  className="cut-line"
                />
              )}
            </svg>
            <div className="cut-banner">
              ✂ Cut mode — drag a line across wires to cut them · Esc or right-click to finish
            </div>
          </div>
        )}

        {flash && <div className="board-flash">{flash.text}</div>}

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
          Press {describeKey(keys.wireMenu)} for wire tools (cut, connect, auto sequence, beautify)
          · Press {describeKey(keys.sceneMenu)} over a scene for scene tools · Drag from a − (right)
          into a + (left) to wire · Ctrl+Scroll to zoom
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
  onDeleteScene: PropTypes.func.isRequired,
  onAddPhoto: PropTypes.func.isRequired,
  commit: PropTypes.func.isRequired,
  patch: PropTypes.func.isRequired,
  endSession: PropTypes.func.isRequired
}
