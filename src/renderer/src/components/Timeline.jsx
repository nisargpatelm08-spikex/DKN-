import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import * as T from '../lib/timelineUtils'
import * as B from '../lib/boardUtils'
import { getPrefs, savePrefs, PREFS_DEFAULTS } from '../lib/prefs'
import { useCanvasView, useViewportSize, useWheelZoom } from '../lib/canvasView'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function YearEditor({ year, onSave, onDelete }) {
  const [form, setForm] = useState({
    label: year.label || '',
    monthCount: year.monthCount || 1,
    dayCount: year.dayCount || 1,
    monthLabels: Array.isArray(year.monthLabels) ? year.monthLabels.join(', ') : ''
  })

  return (
    <div className="tl-year-editor">
      <div className="tl-year-ed-head">
        <input
          className="tl-input tl-input-label"
          value={form.label}
          placeholder="Year name (e.g. Year 1)"
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <button className="pop-x" title="Delete this year" onClick={onDelete}>
          ✕
        </button>
      </div>
      <div className="tl-year-ed-grid">
        <label>
          Months
          <input
            className="tl-input"
            type="number"
            min="1"
            max="24"
            value={form.monthCount}
            onChange={(e) => setForm({ ...form, monthCount: e.target.value })}
          />
        </label>
        <label>
          Days per month
          <input
            className="tl-input"
            type="number"
            min="1"
            max="62"
            value={form.dayCount}
            onChange={(e) => setForm({ ...form, dayCount: e.target.value })}
          />
        </label>
      </div>
      <label className="tl-month-labels">
        Month names (optional, comma separated)
        <textarea
          className="tl-input"
          rows={2}
          value={form.monthLabels}
          placeholder="e.g. Thaw, Ember, Harvest, Silence"
          onChange={(e) => setForm({ ...form, monthLabels: e.target.value })}
        />
      </label>
      <button
        className="pop-add"
        onClick={() =>
          onSave({
            label: form.label.trim() || 'Year',
            monthCount: Math.max(1, parseInt(form.monthCount, 10) || 1),
            dayCount: Math.max(1, parseInt(form.dayCount, 10) || 1),
            monthLabels: T.parseMonthLabels(form.monthLabels)
          })
        }
      >
        ✓ Save year
      </button>
    </div>
  )
}

YearEditor.propTypes = {
  year: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired
}

export default function Timeline({
  story,
  onSelectScene,
  onOpenInEditor,
  patch,
  commit,
  endSession
}) {
  const viewportRef = useRef(null)
  const vpRect = useViewportSize(viewportRef)
  const { view, setView, toWorld, toScreen, zoomAt, zoomBy, fitBounds } = useCanvasView(viewportRef)
  const [setupOpen, setSetupOpen] = useState(false)
  const [dayPanel, setDayPanel] = useState(null) // { yearId, day }
  const [chipDrag, setChipDrag] = useState(null) // { sceneId, startClient, moved }
  const [drag, setDrag] = useState(null)
  const [sensOpen, setSensOpen] = useState(false)
  const [prefs, setPrefsState] = useState(getPrefs)
  const prefsRef = useRef(prefs)
  // Actual-story wires: dragging from a chip's − port into another chip's +
  // port connects them in time order (flow negative → positive).
  const [tlLinkDrag, setTlLinkDrag] = useState(null)
  const [selectedTlLinkId, setSelectedTlLinkId] = useState(null)

  const changePrefs = (patch) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefsState(next)
    savePrefs(next)
  }

  const resetPrefs = () => {
    const next = { ...PREFS_DEFAULTS }
    prefsRef.current = next
    setPrefsState(next)
    savePrefs(next)
  }

  useWheelZoom(viewportRef, (e) => {
    const rect = viewportRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const p = prefsRef.current
    if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? p.zoomStep : 1 / p.zoomStep, cx, cy)
    else
      setView((v) => ({ ...v, tx: v.tx - e.deltaX * p.panSpeed, ty: v.ty - e.deltaY * p.panSpeed }))
  })

  const layout = T.layoutYears(story)

  useEffect(() => {
    fitBounds(T.boundsOfTimeline(story))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDayPanel(null)
        setSetupOpen(false)
        setSensOpen(false)
        setSelectedTlLinkId(null)
        setTlLinkDrag(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- pan ----------

  const onViewportPointerDown = (e) => {
    if (e.button !== 0) return
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty })
    e.currentTarget.setPointerCapture(e.pointerId)
    setDayPanel(null)
    setSelectedTlLinkId(null)
  }

  const onViewportPointerMove = (e) => {
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

  // ---------- scene chip drag (move a scene to another day) ----------

  const onChipPointerDown = (e, sceneId) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedTlLinkId(null)
    setChipDrag({ sceneId, startClient: { x: e.clientX, y: e.clientY }, moved: false })
  }

  const onChipPointerMove = (e, sceneId) => {
    const d = chipDrag
    if (!d || d.sceneId !== sceneId) return
    const dist = Math.abs(e.clientX - d.startClient.x) + Math.abs(e.clientY - d.startClient.y)
    if (dist > 4) {
      setChipDrag((prev) => (prev && prev.sceneId === sceneId ? { ...prev, moved: true } : prev))
    }
  }

  const onChipPointerUp = (e, sceneId) => {
    const d = chipDrag
    if (!d || d.sceneId !== sceneId) return
    setChipDrag(null)
    if (!d.moved) return
    const w = toWorld(e.clientX, e.clientY)
    const hit = T.dayAt(layout, w.x, w.y)
    if (hit) {
      const loc = B.findSceneLoc(story, sceneId)
      const current = loc?.scene.timeline
      const sameDay = current && current.yearId === hit.yearId && current.day === hit.day
      if (!sameDay) {
        patch((s) => T.assignSceneTime(s, sceneId, { yearId: hit.yearId, day: hit.day }))
      }
    }
    endSession()
  }

  // ---------- actual-story wires (drag from a chip's − or ＋ port) ----------

  const onDotPointerDown = (e, item, pole) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedTlLinkId(null)
    setDayPanel(null)
    const rect = chipRects.get(item.scene.id)
    if (!rect) return
    const ax = pole === 'neg' ? rect.left + rect.width : rect.left
    const ay = rect.top + rect.height / 2
    setTlLinkDrag({
      fromSceneId: item.scene.id,
      fromPole: pole,
      fromX: ax,
      fromY: ay,
      worldX: ax,
      worldY: ay,
      snap: null
    })
  }

  const onDotPointerMove = (e) => {
    const d = tlLinkDrag
    if (!d) return
    const w = toWorld(e.clientX, e.clientY)
    const snapT = 30 / view.scale
    let snap = null
    for (const [sceneId, rect] of chipRects) {
      if (sceneId === d.fromSceneId) continue
      for (const probe of [portOfRect(rect, 'pos'), portOfRect(rect, 'neg')]) {
        const dist = Math.hypot(probe.x - w.x, probe.y - w.y)
        if (dist < snapT && (!snap || dist < snap.dist)) snap = { sceneId, ...probe, dist }
      }
    }
    setTlLinkDrag((prev) => (prev ? { ...prev, worldX: w.x, worldY: w.y, snap } : prev))
  }

  const onDotPointerUp = () => {
    const d = tlLinkDrag
    if (!d) return
    setTlLinkDrag(null)
    if (!d.snap || d.snap.sceneId === d.fromSceneId || d.snap.pole === d.fromPole) return
    // Flow is always negative → positive.
    const negSceneId = d.fromPole === 'neg' ? d.fromSceneId : d.snap.sceneId
    const posSceneId = d.fromPole === 'neg' ? d.snap.sceneId : d.fromSceneId
    commit((s) => T.addTimelineLink(s, negSceneId, posSceneId))
  }

  // ---------- derived scene lists ----------

  const allScenes = []
  story.chapters.forEach((ch, ci) =>
    ch.scenes.forEach((sc, si) => allScenes.push({ scene: sc, chapterIndex: ci, sceneIndex: si }))
  )
  // Valid (year:day) slots that actually exist in the current calendar.
  const validSlots = new Set()
  layout.years.forEach((band) =>
    band.cells.forEach((cell) => validSlots.add(band.id + ':' + cell.t))
  )
  const unassigned = []
  allScenes.forEach((item) => {
    const t = item.scene.timeline
    if (!t || !validSlots.has(t.yearId + ':' + t.day)) unassigned.push(item)
  })

  const dayScenes = (band, t) => {
    const list = band.stacks.get(t) || []
    return list.map((item) => ({
      ...item,
      color: B.zoneColor(item.chapterIndex),
      num: `${item.chapterIndex + 1}.${item.sceneIndex + 1}`,
      slot: item.scene.timeline?.slot,
      slotIcon: T.slotIconOf(item.scene.timeline?.slot)
    }))
  }

  const timelineYears = layout.years
  const unschedY = layout.height + 60

  // ---------- actual-story wires (derived geometry) ----------

  // World rect of every scene's chip (scheduled lanes first, then the
  // unscheduled strip) — used to draw the wires and their − / ＋ ports.
  const chipRects = (() => {
    const rects = new Map()
    layout.years.forEach((band) => {
      band.cells.forEach((cell) => {
        const list = band.stacks.get(cell.t) || []
        list.forEach((item, i) => {
          if (i >= T.MAX_CHIPS_VISIBLE) return
          if (rects.has(item.scene.id)) return
          rects.set(item.scene.id, {
            left: band.x + cell.x + 3,
            top: band.chipLaneTop + i * (T.CHIP_H + T.CHIP_GAP),
            width: T.DAY_CELL_W - 6,
            height: T.CHIP_H
          })
        })
      })
    })
    unassigned.forEach((item, k) => {
      if (rects.has(item.scene.id)) return
      rects.set(item.scene.id, {
        left: (k % 10) * 158,
        top: unschedY + 34 + Math.floor(k / 10) * 28,
        width: 150,
        height: 22
      })
    })
    return rects
  })()

  // Negative port sits on the chip's right edge, positive on its left edge.
  const portOfRect = (rect, pole) => ({
    pole,
    x: pole === 'neg' ? rect.left + rect.width : rect.left,
    y: rect.top + rect.height / 2
  })

  const anchorOf = (sceneId, pole) => {
    const rect = chipRects.get(sceneId)
    if (!rect) return null
    return { sceneId, ...portOfRect(rect, pole) }
  }

  const tlWireType = B.PLUG_TYPE_MAP.timeorder || B.PLUG_TYPE_MAP[B.DEFAULT_LINK_TYPE]
  const tlWireColor = tlWireType.color

  const tlWires = (() => {
    const curve = (prefs.threadCurve ?? PREFS_DEFAULTS.threadCurve) / 100
    return (story.timeline?.links || []).flatMap((link) => {
      const from = anchorOf(link.fromSceneId, 'neg')
      const to = anchorOf(link.toSceneId, 'pos')
      if (!from || !to) return []
      const d = B.linkPath(
        { x: from.x, y: from.y, side: 'right' },
        { x: to.x, y: to.y, side: 'left' },
        0,
        curve
      )
      return [{ link, d, type: tlWireType }]
    })
  })()

  const tlGhostPath = tlLinkDrag
    ? B.linkPath(
        {
          x: tlLinkDrag.fromX,
          y: tlLinkDrag.fromY,
          side: tlLinkDrag.fromPole === 'neg' ? 'right' : 'left'
        },
        {
          x: tlLinkDrag.worldX,
          y: tlLinkDrag.worldY,
          side: tlLinkDrag.fromPole === 'neg' ? 'left' : 'right'
        },
        0,
        (prefs.threadCurve ?? PREFS_DEFAULTS.threadCurve) / 100
      )
    : ''

  const tlDim = clamp((view.scale - 0.45) / 0.55, 0.35, 1)

  const tlSelected = (() => {
    const link = (story.timeline?.links || []).find((l) => l.id === selectedTlLinkId)
    if (!link) return null
    const from = anchorOf(link.fromSceneId, 'neg')
    const to = anchorOf(link.toSceneId, 'pos')
    if (!from || !to) return null
    const curve = (prefs.threadCurve ?? PREFS_DEFAULTS.threadCurve) / 100
    return {
      link,
      fromTitle: B.findSceneLoc(story, link.fromSceneId)?.scene.title || 'Scene',
      toTitle: B.findSceneLoc(story, link.toSceneId)?.scene.title || 'Scene',
      mid: B.midOf(
        { x: from.x, y: from.y, side: 'right' },
        { x: to.x, y: to.y, side: 'left' },
        0,
        curve
      )
    }
  })()

  // ---------- day panel ----------

  let dayPopLeft = 40
  let dayPopTop = 40
  if (dayPanel) {
    const band = timelineYears.find((b) => b.id === dayPanel.yearId)
    const cell = band ? band.cells.find((c) => c.t === dayPanel.day) : null
    if (band && cell) {
      const s = toScreen(band.x + cell.x + T.DAY_CELL_W / 2, band.cellTop + T.DAY_CELL_H / 2)
      dayPopLeft = clamp(s.x + 16, 8, Math.max(8, vpRect.width - 340))
      dayPopTop = clamp(s.y, 8, Math.max(8, vpRect.height - 360))
    }
  }
  const dayPanelScenes = dayPanel
    ? (timelineYears.find((b) => b.id === dayPanel.yearId)?.stacks.get(dayPanel.day) || []).map(
        (item) => ({
          ...item,
          color: B.zoneColor(item.chapterIndex),
          num: `${item.chapterIndex + 1}.${item.sceneIndex + 1}`,
          slot: item.scene.timeline?.slot
        })
      )
    : []

  let dayPanelYear = null
  if (dayPanel) {
    const band = timelineYears.find((b) => b.id === dayPanel.yearId)
    if (band) {
      const { month } = T.splitDay(band.year, dayPanel.day)
      dayPanelYear = {
        yearLabel: band.year.label,
        monthLabel: T.monthName(band.year, month),
        dayLabel: T.dayLabel(band.year, dayPanel.day)
      }
    }
  }

  let tlPopLeft = 40
  let tlPopTop = 40
  if (tlSelected) {
    const s = toScreen(tlSelected.mid.x, tlSelected.mid.y)
    tlPopLeft = clamp(s.x + 14, 8, Math.max(8, vpRect.width - 260))
    tlPopTop = clamp(s.y - 20, 8, Math.max(8, vpRect.height - 220))
  }

  return (
    <div className="board">
      <div className="board-toolbar">
        <button className="board-tool-btn" onClick={() => commit((s) => T.addTimelineYear(s))}>
          ＋ Year
        </button>
        <button
          className="board-tool-btn"
          onClick={() => setSetupOpen(true)}
          title="Build your calendar from scratch"
        >
          ⚙ Setup calendar
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
          onClick={() => fitBounds(T.boundsOfTimeline(story))}
          title="Fit"
        >
          ⛶ Fit
        </button>
        <span className="board-sep" />
        <button
          className={'board-tool-btn' + (sensOpen ? ' active' : '')}
          onClick={() => setSensOpen((o) => !o)}
          title="Board & timeline settings — scrolling, zooming and thread looks"
        >
          ⚙ Settings
        </button>
      </div>

      {sensOpen && (
        <div className="tl-sens-panel" onPointerDown={(e) => e.stopPropagation()}>
          <div className="board-popover-head">
            <span className="pop-title">Settings</span>
            <button className="pop-close" onClick={() => setSensOpen(false)}>
              ✕
            </button>
          </div>
          <div className="tl-sens-row">
            <label>
              <span>Scroll pan speed</span>
              <span>{prefs.panSpeed.toFixed(2)}×</span>
            </label>
            <input
              type="range"
              min="0.15"
              max="2"
              step="0.05"
              value={prefs.panSpeed}
              onChange={(e) => changePrefs({ panSpeed: Number(e.target.value) })}
            />
          </div>
          <div className="tl-sens-row">
            <label>
              <span>Ctrl+scroll zoom step</span>
              <span>{prefs.zoomStep.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="1.02"
              max="1.25"
              step="0.01"
              value={prefs.zoomStep}
              onChange={(e) => changePrefs({ zoomStep: Number(e.target.value) })}
            />
          </div>
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
          <div className="pop-hint">
            Lower = gentler. Thread bend makes the lines between plugs more or less curvy — like a
            loose thread at high %, straight at 0%. Remembered on this computer.
          </div>
          <button className="board-tool-btn" onClick={resetPrefs}>
            Reset to default
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className="board-viewport"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        <div
          className="tl-world board-world"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
          }}
        >
          {timelineYears.map((band) => (
            <div
              key={'tly-' + band.id}
              className="tl-year"
              style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
            >
              <div className="tl-year-head">
                <span className="tl-year-label">{band.year.label}</span>
                <span className="tl-year-sub">
                  {T.monthCount(band.year)} months · {T.totalDays(band.year)} days
                </span>
              </div>

              {/* month chips */}
              {Array.from({ length: T.monthCount(band.year) }, (_, m) => (
                <div
                  key={'tlmo-' + band.id + '-' + m}
                  className="tl-month-chip"
                  style={{
                    left: T.TL_PAD_X + 2 + m * T.dayCount(band.year) * T.DAY_CELL_W,
                    top: T.HEADER_H + 4,
                    width: T.dayCount(band.year) * T.DAY_CELL_W - 4
                  }}
                >
                  {T.monthName(band.year, m)}
                </div>
              ))}

              {/* day cells */}
              {band.cells.map((cell) => {
                const { day } = T.splitDay(band.year, cell.t)
                const list = dayScenes(band, cell.t)
                return (
                  <div
                    key={'tld-' + band.id + '-' + cell.t}
                    className="tl-day"
                    style={{
                      left: band.x + cell.x + 2,
                      top: band.cellTop + 2,
                      width: T.DAY_CELL_W - 4,
                      height: T.DAY_CELL_H - 4
                    }}
                    title={'Day ' + day}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDayPanel({ yearId: band.id, day: cell.t })
                    }}
                  >
                    {day}
                    {list.length > 0 && <span className="tl-day-dot" />}
                  </div>
                )
              })}

              {/* scene chips under each day */}
              {band.cells.map((cell) => {
                const list = dayScenes(band, cell.t)
                return list.map((item, i) => {
                  if (i >= T.MAX_CHIPS_VISIBLE) return null
                  return (
                    <div
                      key={'tlc-' + band.id + '-' + cell.t + '-' + item.scene.id}
                      className={
                        'tl-chip' +
                        (chipDrag && chipDrag.sceneId === item.scene.id ? ' dragging' : '')
                      }
                      style={{
                        left: band.x + cell.x + 3,
                        top: band.chipLaneTop + i * (T.CHIP_H + T.CHIP_GAP),
                        width: T.DAY_CELL_W - 6,
                        background: B.hexToRgba(item.color, 0.28),
                        color: item.color
                      }}
                      title={item.scene.title}
                      onPointerDown={(e) => onChipPointerDown(e, item.scene.id)}
                      onPointerMove={(e) => onChipPointerMove(e, item.scene.id)}
                      onPointerUp={(e) => onChipPointerUp(e, item.scene.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectScene(item.scene.id)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        onOpenInEditor(item.scene.id)
                      }}
                    >
                      {item.slotIcon && <span className="tl-chip-slot">{item.slotIcon}</span>}
                      {item.num}
                      <span
                        className="tl-chip-dot neg"
                        title="Negative — drag into the next scene's positive to connect it"
                        onPointerDown={(e) => onDotPointerDown(e, item, 'neg')}
                        onPointerMove={onDotPointerMove}
                        onPointerUp={onDotPointerUp}
                      >
                        −
                      </span>
                      <span
                        className="tl-chip-dot pos"
                        title="Positive — the previous scene's negative flows in here"
                        onPointerDown={(e) => onDotPointerDown(e, item, 'pos')}
                        onPointerMove={onDotPointerMove}
                        onPointerUp={onDotPointerUp}
                      >
                        ＋
                      </span>
                    </div>
                  )
                })
              })}
              {/* "+ more" marker */}
              {band.cells.map((cell) => {
                const list = dayScenes(band, cell.t)
                if (list.length <= T.MAX_CHIPS_VISIBLE) return null
                return (
                  <div
                    key={'tlm-' + band.id + '-' + cell.t}
                    className="tl-more"
                    style={{
                      left: band.x + cell.x + 3,
                      top: band.chipLaneTop + T.MAX_CHIPS_VISIBLE * (T.CHIP_H + T.CHIP_GAP)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDayPanel({ yearId: band.id, day: cell.t })
                    }}
                  >
                    +{list.length - T.MAX_CHIPS_VISIBLE}
                  </div>
                )
              })}
            </div>
          ))}

          {/* unscheduled scenes strip */}
          <div
            className="tl-unsched"
            style={{ left: 0, top: unschedY, width: layout.width, height: 90 }}
          >
            <div className="tl-unsched-title">
              Unscheduled scenes — click a day above to place a scene on it
            </div>
            <div className="tl-unsched-list">
              {unassigned.map((item, k) => (
                <div
                  key={'u-' + item.scene.id}
                  className="tl-chip-big"
                  style={{
                    left: (k % 10) * 158,
                    top: Math.floor(k / 10) * 28,
                    background: B.hexToRgba(B.zoneColor(item.chapterIndex), 0.28),
                    color: B.zoneColor(item.chapterIndex)
                  }}
                  title={item.scene.title}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectScene(item.scene.id)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    onOpenInEditor(item.scene.id)
                  }}
                >
                  <span className="tl-chip-big-num">
                    {item.chapterIndex + 1}.{item.sceneIndex + 1}
                  </span>
                  <span className="tl-chip-big-title">{item.scene.title}</span>
                  <span
                    className="tl-chip-dot neg"
                    title="Negative — drag into the next scene's positive to connect it"
                    onPointerDown={(e) => onDotPointerDown(e, item, 'neg')}
                    onPointerMove={onDotPointerMove}
                    onPointerUp={onDotPointerUp}
                  >
                    −
                  </span>
                  <span
                    className="tl-chip-dot pos"
                    title="Positive — the previous scene's negative flows in here"
                    onPointerDown={(e) => onDotPointerDown(e, item, 'pos')}
                    onPointerMove={onDotPointerMove}
                    onPointerUp={onDotPointerUp}
                  >
                    ＋
                  </span>
                </div>
              ))}
              {unassigned.length === 0 && (
                <div className="tl-none">🎉 Every scene has a day on the calendar.</div>
              )}
            </div>
          </div>

          {/* actual-story wires — flow negative → positive between chips */}
          <svg className="tl-wires" width={layout.width} height={unschedY + 90}>
            <defs>
              <marker
                id="tlarr"
                markerWidth="11"
                markerHeight="11"
                refX="9"
                refY="5.5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0 0 L11 5.5 L0 11 Z" fill={tlWireColor} />
              </marker>
            </defs>
            {tlWires.map(({ link, d }) => {
              const selected = selectedTlLinkId === link.id
              return (
                <g key={'tlw-' + link.id} className="tl-wire-g">
                  <path
                    className="tl-wire-hit"
                    d={d}
                    stroke={tlWireColor}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      setSelectedTlLinkId(selected ? null : link.id)
                    }}
                  />
                  <path
                    className="tl-wire-soft"
                    d={d}
                    stroke={tlWireColor}
                    style={{ opacity: selected ? 0.3 : tlDim * 0.2 }}
                  />
                  <path
                    className="tl-wire"
                    d={d}
                    stroke={tlWireColor}
                    markerEnd="url(#tlarr)"
                    strokeDasharray={tlWireType.dash || undefined}
                    style={{
                      opacity: selected ? 1 : tlDim,
                      filter: `drop-shadow(0 0 ${selected ? 6 : 3}px ${tlWireColor})`
                    }}
                  />
                </g>
              )
            })}
            {tlLinkDrag && (
              <path className="tl-wire tl-wire-ghost" d={tlGhostPath} stroke={tlWireColor} />
            )}
          </svg>

          {tlLinkDrag && tlLinkDrag.snap && (
            <div
              className="tl-snapring"
              style={{ left: tlLinkDrag.snap.x, top: tlLinkDrag.snap.y }}
            />
          )}
        </div>

        {/* day panel */}
        {dayPanel && dayPanelYear && (
          <div
            className="board-popover tl-day-panel"
            style={{ left: dayPopLeft, top: dayPopTop, width: 324 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="board-popover-head">
              <span className="pop-title">
                {dayPanelYear.yearLabel} · {dayPanelYear.monthLabel} · {dayPanelYear.dayLabel}
              </span>
              <button className="pop-close" onClick={() => setDayPanel(null)}>
                ✕
              </button>
            </div>
            <div className="pop-block-label">Scenes on this day</div>
            {dayPanelScenes.length === 0 && <div className="pop-empty">Nothing scheduled yet.</div>}
            {dayPanelScenes.map((item) => (
              <div key={item.scene.id} className="tl-day-scene">
                <span
                  className="tl-day-scene-chip"
                  style={{ background: B.hexToRgba(item.color, 0.28), color: item.color }}
                >
                  {item.slotIcon} {item.num}
                </span>
                <span className="tl-day-scene-title" onClick={() => onSelectScene(item.scene.id)}>
                  {item.scene.title}
                </span>
                <select
                  className="tl-slot-select"
                  value={item.slot || ''}
                  title="Time of day for this scene"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    patch((s) =>
                      T.assignSceneTime(s, item.scene.id, {
                        yearId: dayPanel.yearId,
                        day: dayPanel.day,
                        slot: e.target.value || null
                      })
                    )
                    endSession()
                  }}
                >
                  <option value="">— any time —</option>
                  {T.DAY_SLOTS.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      {sl.icon} {sl.label}
                    </option>
                  ))}
                </select>
                <button
                  className="pop-x"
                  title="Remove this scene from the day"
                  onClick={() => {
                    patch((s) => T.assignSceneTime(s, item.scene.id, null))
                    endSession()
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="pop-block-label">Place an unscheduled scene here</div>
            {unassigned.length === 0 ? (
              <div className="pop-empty">No unscheduled scenes.</div>
            ) : (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    patch((s) =>
                      T.assignSceneTime(s, e.target.value, {
                        yearId: dayPanel.yearId,
                        day: dayPanel.day
                      })
                    )
                    endSession()
                    e.target.value = ''
                  }
                }}
              >
                <option value="">Choose a scene…</option>
                {unassigned.map((item) => (
                  <option key={item.scene.id} value={item.scene.id}>
                    {item.chapterIndex + 1}.{item.sceneIndex + 1} — {item.scene.title}
                  </option>
                ))}
              </select>
            )}
            <div className="pop-hint">Drag a scene chip to another day to move it.</div>
          </div>
        )}

        {tlSelected && (
          <div
            className="board-popover"
            style={{ left: tlPopLeft, top: tlPopTop, width: 250 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="board-popover-head">
              <span className="pop-title">Timeline wire</span>
              <button className="pop-close" onClick={() => setSelectedTlLinkId(null)}>
                ✕
              </button>
            </div>
            <div className="pop-block-label">Actual story order</div>
            <div className="tl-wire-pop-line">− {tlSelected.fromTitle}</div>
            <div className="tl-wire-pop-line">→ ＋ {tlSelected.toTitle}</div>
            <div className="pop-hint">
              This is the actual story: scene&apos;s negative flows into the next scene&apos;s
              positive.
            </div>
            <button
              className="pop-danger"
              onClick={() => {
                commit((s) => T.removeTimelineLink(s, tlSelected.link.id))
                setSelectedTlLinkId(null)
              }}
            >
              Delete this timeline wire
            </button>
          </div>
        )}

        <div className="board-hint">
          Click a day to schedule scenes &amp; set the time of day · Drag a scene chip onto a day to
          move it · Drag a − port into a ＋ port to connect the actual story in time · Setup
          calendar builds the structure from scratch
        </div>
      </div>

      {/* setup modal */}
      {setupOpen && (
        <div className="board-modal-backdrop" onPointerDown={(e) => e.stopPropagation()}>
          <div className="board-modal">
            <div className="board-modal-head">
              <span className="pop-title">
                Calendar setup — build your story&apos;s time from scratch
              </span>
              <button className="pop-close" onClick={() => setSetupOpen(false)}>
                ✕
              </button>
            </div>
            <div className="board-modal-body">
              <p className="pop-blurb">
                Your story&apos;s calendar is made of <b>years</b>, each with <b>months</b> and a
                number of <b>days</b>. Rename years, change how many months and days exist, or
                invent month names — day numbers fill in automatically.
              </p>
              {story.timeline && story.timeline.years.length === 0 && (
                <div className="pop-empty">No years yet — add your first year below.</div>
              )}
              {(story.timeline?.years || []).map((year) => (
                <YearEditor
                  key={year.id}
                  year={year}
                  onSave={(patchData) => commit((s) => T.patchTimelineYear(s, year.id, patchData))}
                  onDelete={() => commit((s) => T.removeTimelineYear(s, year.id))}
                />
              ))}
              <button className="pop-add" onClick={() => commit((s) => T.addTimelineYear(s))}>
                ＋ Add another year
              </button>
            </div>
            <button className="board-modal-done" onClick={() => setSetupOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

Timeline.propTypes = {
  story: PropTypes.object.isRequired,
  onSelectScene: PropTypes.func.isRequired,
  onOpenInEditor: PropTypes.func.isRequired,
  patch: PropTypes.func.isRequired,
  commit: PropTypes.func.isRequired,
  endSession: PropTypes.func.isRequired
}
