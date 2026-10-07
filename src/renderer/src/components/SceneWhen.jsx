import PropTypes from 'prop-types'
import * as T from '../lib/timelineUtils'

// The simple "when does this scene happen?" fields: Year / Month / Day / Time,
// all on the story's own calendar (set up in Timeline ▸ Setup calendar).
// Used in the Editor (under the scene title) and in the Timeline popover.
export default function SceneWhen({ story, scene, onChange, compact }) {
  const cal = T.calendarOf(story)
  const parts = T.whenParts(cal, scene.timeline)
  const year = parts ? parts.year : null
  const hasDate = !!parts

  const write = (patchFields) => {
    const base = parts
      ? {
          yearId: parts.year.id,
          month: parts.month,
          day: parts.day,
          time: parts.hasTime ? T.formatTime(parts.minutes) : ''
        }
      : { yearId: cal.years[0].id, month: 0, day: 1, time: '' }
    onChange({ ...base, ...patchFields })
  }

  const gap = (() => {
    // Gap from the scene right before this one in time order.
    if (!parts) return null
    const lay = T.layoutFlow(story)
    const card = lay.cardById.get(scene.id)
    if (!card || !card.dated || card.order <= 0) return null
    const prev = lay.cards.find((c) => c.dated && c.order === card.order - 1)
    if (!prev) return null
    const g = T.gapBetween(cal, prev.scene.timeline, scene.timeline)
    return g ? { text: g.text, from: prev.num } : null
  })()

  return (
    <div className={'scene-when' + (compact ? ' compact' : '')}>
      {!compact && <span className="scene-when-label">🕰 When</span>}
      {!hasDate ? (
        <button className="scene-when-set" onClick={() => write({})}>
          ＋ Give this scene a date
        </button>
      ) : (
        <>
          <label className="scene-when-field">
            <span>Year</span>
            <select
              value={year.id}
              onChange={(e) => {
                const y = cal.years.find((yy) => yy.id === e.target.value)
                write({
                  yearId: e.target.value,
                  month: Math.min(parts.month, T.monthCount(y) - 1),
                  day: Math.min(parts.day, T.dayCount(y))
                })
              }}
            >
              {cal.years.map((y, i) => (
                <option key={y.id} value={y.id}>
                  {y.label || 'Year ' + (i + 1)}
                </option>
              ))}
            </select>
          </label>
          <label className="scene-when-field">
            <span>Month</span>
            <select value={parts.month} onChange={(e) => write({ month: Number(e.target.value) })}>
              {Array.from({ length: T.monthCount(year) }, (_, m) => (
                <option key={m} value={m}>
                  {T.monthName(year, m)}
                </option>
              ))}
            </select>
          </label>
          <label className="scene-when-field">
            <span>Day</span>
            <input
              type="number"
              min="1"
              max={T.dayCount(year)}
              value={parts.day}
              onChange={(e) => write({ day: e.target.value })}
            />
          </label>
          <label className="scene-when-field">
            <span>Time</span>
            <input
              type="time"
              value={parts.hasTime ? T.formatTime(parts.minutes) : ''}
              onChange={(e) => write({ time: e.target.value })}
            />
          </label>
          <button
            className="scene-when-clear"
            title="Remove the date from this scene"
            onClick={() => onChange(null)}
          >
            ✕
          </button>
          {gap && (
            <span className="scene-when-gap" title={'Time since scene ' + gap.from}>
              {gap.text} after {gap.from}
            </span>
          )}
        </>
      )}
    </div>
  )
}

SceneWhen.propTypes = {
  story: PropTypes.object.isRequired,
  scene: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool
}
