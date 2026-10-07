import { useMemo } from 'react'
import PropTypes from 'prop-types'
import { mixRows, bucketColor } from '../lib/langMix'

// Compact, live "how much of each language is in this text" bar shown under
// the prose editor. Clicking opens the full Translate panel.
function LangMixBar({ text, onOpen }) {
  const rows = useMemo(() => (text && text.trim() ? mixRows(text) : []), [text])

  if (!rows.length) return null

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <button
      className="langmix"
      onClick={onOpen}
      title={`${rows.length} language groups — click for details & translation`}
    >
      <span className="langmix-bar">
        {rows.map((r) => (
          <span
            key={r.id}
            className="langmix-seg"
            style={{ width: `${(r.count / total) * 100}%`, background: bucketColor(r.id) }}
            title={`${r.label}: ${r.pct}% (${r.count} words)`}
          />
        ))}
      </span>
      <span className="langmix-legend">
        {rows.slice(0, 4).map((r) => (
          <span className="langmix-item" key={r.id}>
            <i className="langmix-dot" style={{ background: bucketColor(r.id) }} />
            {r.label.split(' ')[0]} {r.pct}%
          </span>
        ))}
        {rows.length > 4 && <span className="langmix-item subtle">+{rows.length - 4} more</span>}
        <span className="langmix-caret">🌐</span>
      </span>
    </button>
  )
}

LangMixBar.propTypes = {
  text: PropTypes.string,
  onOpen: PropTypes.func.isRequired
}

export default LangMixBar
