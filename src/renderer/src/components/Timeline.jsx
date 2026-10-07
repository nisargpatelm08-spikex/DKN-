import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import * as T from '../lib/timelineUtils'
import * as B from '../lib/boardUtils'
import { getPrefs, savePrefs, PREFS_DEFAULTS } from '../lib/prefs'
import { useCanvasView, useViewportSize, useWheelZoom } from '../lib/canvasView'
import SceneWhen from './SceneWhen'

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

// The Timeline: every dated scene sits left → right in time order (evenly
// spaced) inside coloured chapter bands. Wires flow NEGATIVE (right dot) →
// POSITIVE (left dot) and each one shows the time gap between its scenes.
// Cards, dots and wires all share ONE coordinate system (the world div), so
// wire ends always sit exactly on the dots.
export default function Timeline({
  story,
  selectedSceneId,
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
  const [drag, setDrag] = useState(null)
  const [sensOpen, setSensOpen] = useState(false)
  const [prefs, setPrefsState] = useState(getPrefs)
  const prefsRef = useRef(prefs)
  const [whenSceneId, setWhenSceneId] = useState(null) // date popover
  const [linkDrag, setLinkDrag] = useState(null) // wire being dragged
  const [selectedLinkId, setSelectedLinkId] = useState(null)
  const [chaptersOpen, setChaptersOpen] = useState(true)

  const changePrefs = (patchData) => {
    const next = { ...prefsRef.current, ...patchData }
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

  const layout = T.layoutFlow(story)
  const cal = layout.cal
  const spans = T.chapterSpans(story)

  useEffect(() => {
    fitBounds(T.boundsOfFlow(story))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSetupOpen(false)
        setSensOpen(false)
        setSelectedLinkId(null)
        setLinkDrag(null)
        setWhenSceneId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- pan ----------

  const onViewportPointerDown = (e) => {
    if (e.button !== 0) return
    setDrag({ startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty })
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedLinkId(null)
    setWhenSceneId(null)
  }

  const onViewportPointerMove = (e) => {
    if (!drag) return
    setView((v) => ({
      ...v,
      tx: drag.tx + (e.clientX - drag.startX),
      ty: drag.ty + (e.clientY - drag.startY)
    }))
  }

  const onViewportPointerUp = () => setDrag(null)

  // ---------- wires: drag from a − or ＋ dot into the opposite dot ----------

  const onDotPointerDown = (e, card, pole) => {
    e.stopPropagation()
    e.preventDefault()
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedLinkId(null)
    setWhenSceneId(null)
    const p = T.flowPort(card, pole)
    setLinkDrag({ fromSceneId: card.scene.id, fromPole: pole, from: p, to: p, snap: null })
  }

  const onDotPointerMove = (e) => {
    if (!linkDrag) return
    const w = toWorld(e.clientX, e.clientY)
    const want = linkDrag.fromPole === 'neg' ? 'pos' : 'neg'
    const snapT = 34 / view.scale
    let snap = null
    for (const card of layout.cards) {
      if (card.scene.id === linkDrag.fromSceneId) continue
      const p = T.flowPort(card, want)
      const dist = Math.hypot(p.x - w.x, p.y - w.y)
      // Also accept a drop anywhere on the card body.
      const onCard =
        w.x >= card.x && w.x <= card.x + card.w && w.y >= card.y && w.y <= card.y + card.h
      const score = onCard ? Math.min(dist, snapT * 0.5) : dist
      if (score < snapT && (!snap || score < snap.score)) {
        snap = { sceneId: card.scene.id, x: p.x, y: p.y, score }
      }
    }
    setLinkDrag((d) => (d ? { ...d, to: snap ? { x: snap.x, y: snap.y } : w, snap } : d))
  }

  const onDotPointerUp = () => {
    const d = linkDrag
    setLinkDrag(null)
    if (!d || !d.snap) return
    // Flow is always negative → positive.
    const negId = d.fromPole === 'neg' ? d.fromSceneId : d.snap.sceneId
    const posId = d.fromPole === 'neg' ? d.snap.sceneId : d.fromSceneId
    commit((s) => T.addTimelineLink(s, negId, posId))
  }

  // ---------- derived wires ----------

  const wireType = B.PLUG_TYPE_MAP.timeorder || B.PLUG_TYPE_MAP[B.DEFAULT_LINK_TYPE]
  const wireColor = wireType.color
  const backColor = '#e8873c' // flashbacks get a warm colour so they stand out
  const dim = clamp((view.scale - 0.45) / 0.55, 0.45, 1)

  const wires = (story.timeline?.links || []).flatMap((link) => {
    const a = layout.cardById.get(link.fromSceneId)
    const b = layout.cardById.get(link.toSceneId)
    if (!a || !b) return []
    const from = T.flowPort(a, 'neg')
    const to = T.flowPort(b, 'pos')
    const { d, c1, c2 } = T.flowWirePath(from, to)
    const mid = T.cubicPoint(from, c1, c2, to, 0.5)
    const gap = T.gapBetween(cal, a.scene.timeline, b.scene.timeline)
    return [
      {
        link,
        a,
        b,
        from,
        to,
        d,
        mid,
        gap,
        color: gap && gap.backwards ? backColor : wireColor
      }
    ]
  })

  const ghost = linkDrag
    ? (() => {
        const neg = linkDrag.fromPole === 'neg'
        const from = neg ? linkDrag.from : linkDrag.to
        const to = neg ? linkDrag.to : linkDrag.from
        return T.flowWirePath(from, to).d
      })()
    : ''

  const selectedWire = wires.find((w) => w.link.id === selectedLinkId) || null
  const whenCard = whenSceneId ? layout.cardById.get(whenSceneId) : null

  const popAt = (wx, wy, w, h) => {
    const s = toScreen(wx, wy)
    return {
      left: clamp(s.x + 14, 8, Math.max(8, vpRect.width - w - 8)),
      top: clamp(s.y - 10, 8, Math.max(8, vpRect.height - h - 8))
    }
  }

  const trackLineY = T.FLOW_TRACK_Y + T.FLOW_CARD_H / 2
  const datedCards = layout.cards.filter((c) => c.dated)
  const undatedCards = layout.cards.filter((c) => !c.dated)

  return (
    <div className="board">
      <div className="board-toolbar">
        <button className="board-tool-btn" onClick={() => commit((s) => T.addTimelineYear(s))}>
          ＋ Year
        </button>
        <button
          className="board-tool-btn"
          onClick={() => setSetupOpen(true)}
          title="Build your calendar: years, months, days and month names"
        >
          ⚙ Setup calendar
        </button>
        <button
          className="board-tool-btn"
          onClick={() => commit((s) => T.autoConnectTimeOrder(s))}
          title="Wire every dated scene to the next one in time order"
          disabled={layout.datedCount < 2}
        >
          ⇢ Connect in time order
        </button>
        <button
          className={'board-tool-btn' + (chaptersOpen ? ' active' : '')}
          onClick={() => setChaptersOpen((o) => !o)}
          title="Show each chapter's time span and the gap to the next chapter"
        >
          ⏳ Chapter gaps
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
          onClick={() => fitBounds(T.boundsOfFlow(story))}
          title="Fit"
        >
          ⛶ Fit
        </button>
        <span className="board-sep" />
        <button
          className={'board-tool-btn' + (sensOpen ? ' active' : '')}
          onClick={() => setSensOpen((o) => !o)}
          title="Board & timeline settings — scrolling and zooming"
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
            Thread bend makes the Board&apos;s lines more or less curvy. Remembered on this
            computer.
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
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
        >
          {/* chapter bands behind the cards */}
          {layout.bands.map((band, i) => {
            const color = B.zoneColor(band.chapterIndex)
            return (
              <div
                key={'band-' + i}
                className="tlx-band"
                style={{
                  left: band.x1 - 16,
                  top: T.FLOW_TRACK_Y - 46,
                  width: band.x2 - band.x1 + 32,
                  height: T.FLOW_CARD_H + 62,
                  background: B.hexToRgba(color, 0.1),
                  borderColor: B.hexToRgba(color, 0.45)
                }}
              >
                <span className="tlx-band-title" style={{ color }}>
                  Ch {band.chapterIndex + 1} · {band.chapter.title}
                </span>
              </div>
            )
          })}

          {/* the time axis */}
          {datedCards.length > 0 && (
            <div
              className="tlx-axis"
              style={{
                left: T.FLOW_PAD_X - 30,
                top: trackLineY,
                width: Math.max(
                  0,
                  datedCards[datedCards.length - 1].x + T.FLOW_CARD_W - T.FLOW_PAD_X + 60
                )
              }}
            />
          )}

          {/* time gap between neighbouring scenes (even without a wire) */}
          {layout.neighbourGaps.map((g) =>
            g.gap ? (
              <div key={'ng-' + g.key} className="tlx-ngap" style={{ left: g.x, top: g.y }}>
                {g.gap.text}
              </div>
            ) : null
          )}

          {datedCards.length === 0 && (
            <div className="tlx-empty" style={{ left: T.FLOW_PAD_X, top: T.FLOW_TRACK_Y }}>
              No scene has a date yet. Click a scene below (or use the 🕰 When row in the Editor) and
              pick its Year, Month, Day and Time — it will appear here in time order.
            </div>
          )}

          {/* undated strip */}
          <div className="tlx-undated-title" style={{ left: T.FLOW_PAD_X, top: layout.undatedY }}>
            {undatedCards.length
              ? 'Not dated yet — click a scene to give it a date'
              : '🎉 Every scene has a date.'}
          </div>

          {/* scene cards */}
          {layout.cards.map((card) => {
            const color = B.zoneColor(card.chapterIndex)
            const selected = card.scene.id === selectedSceneId
            return (
              <div
                key={'card-' + card.scene.id}
                className={
                  'tlx-card' + (selected ? ' selected' : '') + (card.dated ? '' : ' undated')
                }
                style={{
                  left: card.x,
                  top: card.y,
                  width: card.w,
                  height: card.h,
                  borderColor: B.hexToRgba(color, 0.7)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectScene(card.scene.id)
                  setSelectedLinkId(null)
                  setWhenSceneId((id) => (id === card.scene.id ? null : card.scene.id))
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onOpenInEditor(card.scene.id)
                }}
                title="Click to set the date & time · double-click to open in the Editor"
              >
                <div className="tlx-card-bar" style={{ background: color }} />
                <div className="tlx-card-head">
                  <span className="tlx-card-num" style={{ color }}>
                    {card.num}
                  </span>
                  <span className="tlx-card-title">{card.scene.title || 'Scene'}</span>
                </div>
                <div className={'tlx-card-when' + (card.dated ? '' : ' none')}>
                  {card.dated ? T.formatWhen(cal, card.scene.timeline) : '🕰 Set a date…'}
                </div>
                <span
                  className={
                    'tlx-dot pos' +
                    (linkDrag &&
                    linkDrag.snap?.sceneId === card.scene.id &&
                    linkDrag.fromPole === 'neg'
                      ? ' snap'
                      : '')
                  }
                  title="Positive — the previous scene's negative flows in here"
                  onPointerDown={(e) => onDotPointerDown(e, card, 'pos')}
                  onPointerMove={onDotPointerMove}
                  onPointerUp={onDotPointerUp}
                  onClick={(e) => e.stopPropagation()}
                >
                  ＋
                </span>
                <span
                  className={
                    'tlx-dot neg' +
                    (linkDrag &&
                    linkDrag.snap?.sceneId === card.scene.id &&
                    linkDrag.fromPole === 'pos'
                      ? ' snap'
                      : '')
                  }
                  title="Negative — drag into the next scene's ＋ to connect them in time"
                  onPointerDown={(e) => onDotPointerDown(e, card, 'neg')}
                  onPointerMove={onDotPointerMove}
                  onPointerUp={onDotPointerUp}
                  onClick={(e) => e.stopPropagation()}
                >
                  −
                </span>
              </div>
            )
          })}

          {/* wires — same coordinate system as the cards (no offsets) */}
          <svg className="tlx-wires" width={layout.width} height={layout.height}>
            <defs>
              {[
                ['tlx-arr', wireColor],
                ['tlx-arr-back', backColor]
              ].map(([id, color]) => (
                <marker
                  key={id}
                  id={id}
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="6"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0 0 L12 6 L0 12 Z" fill={color} />
                </marker>
              ))}
            </defs>
            {wires.map((w) => {
              const selected = selectedLinkId === w.link.id
              const back = w.gap && w.gap.backwards
              return (
                <g key={'w-' + w.link.id}>
                  <path
                    className="tlx-wire-hit"
                    d={w.d}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      setWhenSceneId(null)
                      setSelectedLinkId(selected ? null : w.link.id)
                    }}
                  />
                  <path
                    className="tlx-wire-soft"
                    d={w.d}
                    stroke={w.color}
                    style={{ opacity: selected ? 0.35 : dim * 0.22 }}
                  />
                  <path
                    className={'tlx-wire' + (selected ? ' selected' : '')}
                    d={w.d}
                    stroke={w.color}
                    strokeDasharray={back ? '9 6' : undefined}
                    markerEnd={back ? 'url(#tlx-arr-back)' : 'url(#tlx-arr)'}
                    style={{
                      opacity: selected ? 1 : dim,
                      filter: `drop-shadow(0 0 ${selected ? 6 : 3}px ${w.color})`
                    }}
                  />
                  <circle cx={w.from.x} cy={w.from.y} r={4.5} fill={w.color} />
                  <circle cx={w.to.x} cy={w.to.y} r={4.5} fill={w.color} />
                </g>
              )
            })}
            {linkDrag && <path className="tlx-wire tlx-wire-ghost" d={ghost} stroke={wireColor} />}
          </svg>

          {/* time-gap label on every wire */}
          {wires.map((w) => (
            <div
              key={'wl-' + w.link.id}
              className={
                'tlx-wire-label' +
                (selectedLinkId === w.link.id ? ' selected' : '') +
                (w.gap && w.gap.backwards ? ' back' : '') +
                (w.gap ? '' : ' unknown')
              }
              style={{ left: w.mid.x, top: w.mid.y, borderColor: w.color, color: w.color }}
              onPointerDown={(e) => {
                e.stopPropagation()
                setWhenSceneId(null)
                setSelectedLinkId((id) => (id === w.link.id ? null : w.link.id))
              }}
              title="Time between these two scenes — click for details"
            >
              {w.gap ? w.gap.text : 'no date'}
            </div>
          ))}

          {linkDrag && linkDrag.snap && (
            <div className="tl-snapring" style={{ left: linkDrag.snap.x, top: linkDrag.snap.y }} />
          )}
        </div>

        {/* chapter time spans + gaps between chapters */}
        {chaptersOpen && (
          <div className="tlx-chapters" onPointerDown={(e) => e.stopPropagation()}>
            <div className="tlx-chapters-head">⏳ Chapters in time</div>
            {spans.map((sp) => {
              const color = B.zoneColor(sp.chapterIndex)
              return (
                <div key={sp.chapter.id} className="tlx-ch">
                  <div className="tlx-ch-row">
                    <span className="tlx-ch-dot" style={{ background: color }} />
                    <span className="tlx-ch-name">
                      Ch {sp.chapterIndex + 1} · {sp.chapter.title}
                    </span>
                  </div>
                  <div className="tlx-ch-span">
                    {sp.start
                      ? T.formatWhen(cal, sp.start) +
                        (sp.duration && sp.duration.minutes > 0
                          ? '  →  ' + T.formatWhen(cal, sp.end)
                          : '')
                      : 'no dated scenes yet'}
                  </div>
                  {sp.duration && sp.duration.minutes > 0 && (
                    <div className="tlx-ch-dur">lasts {sp.duration.text.replace(/^\+/, '')}</div>
                  )}
                  {sp.gapToNext && (
                    <div className={'tlx-ch-gap' + (sp.gapToNext.gap.backwards ? ' back' : '')}>
                      ↓{' '}
                      {sp.gapToNext.gap.backwards
                        ? 'Ch ' + (sp.gapToNext.toIndex + 1) + ' starts earlier: '
                        : 'gap to Ch ' + (sp.gapToNext.toIndex + 1) + ': '}
                      {sp.gapToNext.gap.text.replace(/^\+/, '')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* date & time popover for a scene */}
        {whenCard && (
          <div
            className="board-popover tlx-when-pop"
            style={{ ...popAt(whenCard.x + whenCard.w, whenCard.y, 380, 190), width: 380 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="board-popover-head">
              <span className="pop-title">
                {whenCard.num} · {whenCard.scene.title || 'Scene'}
              </span>
              <button className="pop-close" onClick={() => setWhenSceneId(null)}>
                ✕
              </button>
            </div>
            <div className="pop-block-label">When does this scene happen?</div>
            <SceneWhen
              story={story}
              scene={whenCard.scene}
              compact
              onChange={(when) => {
                patch((s) => T.setSceneWhen(s, whenCard.scene.id, when))
                endSession()
              }}
            />
            <div className="pop-hint">
              Uses your own calendar (⚙ Setup calendar). Scenes line up left → right in time order.
            </div>
          </div>
        )}

        {/* wire details */}
        {selectedWire && (
          <div
            className="board-popover"
            style={{ ...popAt(selectedWire.mid.x, selectedWire.mid.y, 270, 230), width: 270 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="board-popover-head">
              <span className="pop-title">Story-time wire</span>
              <button className="pop-close" onClick={() => setSelectedLinkId(null)}>
                ✕
              </button>
            </div>
            <div className="tl-wire-pop-line">
              − {selectedWire.a.num} {selectedWire.a.scene.title}
            </div>
            <div className="tlx-pop-when">{T.formatWhen(cal, selectedWire.a.scene.timeline)}</div>
            <div className="tl-wire-pop-line">
              → ＋ {selectedWire.b.num} {selectedWire.b.scene.title}
            </div>
            <div className="tlx-pop-when">{T.formatWhen(cal, selectedWire.b.scene.timeline)}</div>
            <div className={'tlx-pop-gap' + (selectedWire.gap?.backwards ? ' back' : '')}>
              {selectedWire.gap
                ? selectedWire.gap.backwards
                  ? 'Flashback — goes back ' + selectedWire.gap.text.replace(/^⟲ back /, '')
                  : 'Time gap: ' + selectedWire.gap.text.replace(/^\+/, '')
                : 'Give both scenes a date to see the time gap.'}
            </div>
            <button
              className="pop-danger"
              onClick={() => {
                commit((s) => T.removeTimelineLink(s, selectedWire.link.id))
                setSelectedLinkId(null)
              }}
            >
              Delete this wire
            </button>
          </div>
        )}

        <div className="board-hint">
          Click a scene to set its Year · Month · Day · Time · Drag a − dot into another
          scene&apos;s ＋ dot to connect the story in time · Every wire shows the time gap
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
                invent month names. Scene dates and time gaps follow this calendar.
              </p>
              {story.timeline && (story.timeline.years || []).length === 0 && (
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
  selectedSceneId: PropTypes.string,
  onSelectScene: PropTypes.func.isRequired,
  onOpenInEditor: PropTypes.func.isRequired,
  patch: PropTypes.func.isRequired,
  commit: PropTypes.func.isRequired,
  endSession: PropTypes.func.isRequired
}
