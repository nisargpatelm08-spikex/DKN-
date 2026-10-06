import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import * as T from '../lib/timelineUtils'
import * as B from '../lib/boardUtils'
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

  useWheelZoom(viewportRef, (e) => {
    const rect = viewportRef.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    if (e.ctrlKey || e.metaKey) zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, cx, cy)
    else setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
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

  // ---------- scene chip drag (move a scene to another day) ----------

  const onChipPointerDown = (e, sceneId) => {
    e.stopPropagation()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
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

  // ---------- derived scene lists ----------

  const allScenes = []
  story.chapters.forEach((ch, ci) =>
    ch.scenes.forEach((sc, si) => allScenes.push({ scene: sc, chapterIndex: ci, sceneIndex: si }))
  )
  // Valid (year:day) slots that actually exist in the current calendar.
  const validSlots = new Set()
  layout.years.forEach((band) => band.cells.forEach((cell) => validSlots.add(band.id + ':' + cell.t)))
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
      num: `${item.chapterIndex + 1}.${item.sceneIndex + 1}`
    }))
  }

  const timelineYears = layout.years
  const unschedY = layout.height + 60

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
          num: `${item.chapterIndex + 1}.${item.sceneIndex + 1}`
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

  return (
    <div className="board">
      <div className="board-toolbar">
        <button className="board-tool-btn" onClick={() => commit((s) => T.addTimelineYear(s))}>
          ＋ Year
        </button>
        <button className="board-tool-btn" onClick={() => setSetupOpen(true)} title="Build your calendar from scratch">
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
        <button className="board-tool-btn" onClick={() => fitBounds(T.boundsOfTimeline(story))} title="Fit">
          ⛶ Fit
        </button>
      </div>

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
                        'tl-chip' + (chipDrag && chipDrag.sceneId === item.scene.id ? ' dragging' : '')
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
                      {item.num}
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
            <div className="tl-unsched-title">Unscheduled scenes — click a day above to place a scene on it</div>
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
                  <span className="tl-chip-big-num">{item.chapterIndex + 1}.{item.sceneIndex + 1}</span>
                  <span className="tl-chip-big-title">{item.scene.title}</span>
                </div>
              ))}
              {unassigned.length === 0 && (
                <div className="tl-none">🎉 Every scene has a day on the calendar.</div>
              )}
            </div>
          </div>
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
                <span className="tl-day-scene-chip" style={{ background: B.hexToRgba(item.color, 0.28), color: item.color }}>
                  {item.num}
                </span>
                <span
                  className="tl-day-scene-title"
                  onClick={() => onSelectScene(item.scene.id)}
                >
                  {item.scene.title}
                </span>
                <button
                  className="pop-x"
                  title="Remove this scene from the day"
                  onClick={() => patch((s) => T.assignSceneTime(s, item.scene.id, null))}
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
                    patch((s) => T.assignSceneTime(s, e.target.value, { yearId: dayPanel.yearId, day: dayPanel.day }))
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

        <div className="board-hint">
          Click a day to schedule scenes · Drag a scene chip onto a day to move it · Setup calendar builds
          the structure from scratch
        </div>
      </div>

      {/* setup modal */}
      {setupOpen && (
        <div className="board-modal-backdrop" onPointerDown={(e) => e.stopPropagation()}>
          <div className="board-modal">
            <div className="board-modal-head">
              <span className="pop-title">Calendar setup — build your story&apos;s time from scratch</span>
              <button className="pop-close" onClick={() => setSetupOpen(false)}>
                ✕
              </button>
            </div>
            <div className="board-modal-body">
              <p className="pop-blurb">
                Your story&apos;s calendar is made of <b>years</b>, each with <b>months</b> and a number of{' '}
                <b>days</b>. Rename years, change how many months and days exist, or invent month names —
                day numbers fill in automatically.
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
              <button
                className="pop-add"
                onClick={() => commit((s) => T.addTimelineYear(s))}
              >
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