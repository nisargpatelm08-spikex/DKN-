import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { describeKey, isTypingTarget } from '../lib/prefs'

// A small pop-up tool menu (opened with W / S on the Board and Timeline).
//
// items: [
//   { header: 'Section title' },
//   { sep: true },
//   { icon, label, hint, run, disabled, danger }            — an action
//   { icon, label, hint, list: [{ label, run }], disabled }  — expands a pick-list
//   { icon, label, input: { placeholder, onSubmit } }        — inline text box
// ]
// Actions are numbered 1–9: pressing the number runs it.
export default function ToolMenu({ title, subtitle, x, y, items, onClose, menuKey, bounds }) {
  const [openList, setOpenList] = useState(null)
  const [text, setText] = useState('')

  // Number every actionable row so 1–9 can trigger it.
  let n = 0
  const rows = items.map((it) => {
    if (it.header || it.sep || it.disabled || it.input) return { ...it, num: null }
    n++
    return { ...it, num: n <= 9 ? n : null }
  })

  const activate = (row) => {
    if (!row || row.disabled) return
    if (row.list) {
      setOpenList((cur) => (cur === row.label ? null : row.label))
      return
    }
    if (row.input) return
    row.run()
    onClose()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[1-9]$/.test(e.key)) {
        const row = rows.find((r) => r.num === Number(e.key))
        if (row) {
          e.preventDefault()
          e.stopPropagation()
          activate(row)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Keep the menu inside the canvas.
  const W = 290
  const left = Math.max(8, Math.min(x, (bounds?.width || 1200) - W - 8))
  const top = Math.max(8, Math.min(y, (bounds?.height || 800) - 120))

  return (
    <div
      className="toolmenu"
      style={{ left, top, width: W, maxHeight: Math.max(160, (bounds?.height || 800) - top - 8) }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="toolmenu-head">
        <span className="toolmenu-title">{title}</span>
        {menuKey && <span className="toolmenu-key">{describeKey(menuKey)}</span>}
        <button className="pop-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>
      {subtitle && <div className="toolmenu-sub">{subtitle}</div>}
      <div className="toolmenu-body">
        {rows.map((row, i) => {
          if (row.header) {
            return (
              <div key={'h' + i} className="toolmenu-header">
                {row.header}
              </div>
            )
          }
          if (row.sep) return <div key={'s' + i} className="toolmenu-sep" />
          if (row.input) {
            return (
              <div key={'i' + i} className="toolmenu-inputrow">
                <span className="toolmenu-icon">{row.icon}</span>
                <input
                  className="tag-input"
                  value={text}
                  placeholder={row.input.placeholder}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && text.trim()) {
                      row.input.onSubmit(text.trim())
                      setText('')
                    }
                    if (e.key === 'Escape') onClose()
                  }}
                />
                <button
                  className="pop-add"
                  disabled={!text.trim()}
                  onClick={() => {
                    row.input.onSubmit(text.trim())
                    setText('')
                  }}
                >
                  {row.label}
                </button>
              </div>
            )
          }
          const expanded = row.list && openList === row.label
          return (
            <div key={'r' + i}>
              <button
                className={
                  'toolmenu-item' +
                  (row.danger ? ' danger' : '') +
                  (row.disabled ? ' disabled' : '') +
                  (expanded ? ' open' : '')
                }
                disabled={row.disabled}
                title={row.hint || ''}
                onClick={() => activate(row)}
              >
                <span className="toolmenu-num">{row.num || ''}</span>
                <span className="toolmenu-icon">{row.icon}</span>
                <span className="toolmenu-label">
                  {row.label}
                  {row.hint && <span className="toolmenu-hint">{row.hint}</span>}
                </span>
                {row.list && <span className="toolmenu-caret">{expanded ? '▾' : '▸'}</span>}
              </button>
              {expanded && (
                <div className="toolmenu-list">
                  {row.list.length === 0 && <div className="toolmenu-empty">Nothing to pick.</div>}
                  {row.list.map((opt, k) => (
                    <button
                      key={k}
                      className={'toolmenu-listitem' + (opt.current ? ' current' : '')}
                      onClick={() => {
                        opt.run()
                        onClose()
                      }}
                    >
                      {opt.current ? '▸ ' : ''}
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="toolmenu-foot">
        Press a number to pick · {menuKey ? describeKey(menuKey) + ' or ' : ''}Esc closes · change
        keys in ⚙ Settings
      </div>
    </div>
  )
}

ToolMenu.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  items: PropTypes.array.isRequired,
  onClose: PropTypes.func.isRequired,
  menuKey: PropTypes.string,
  bounds: PropTypes.object
}
