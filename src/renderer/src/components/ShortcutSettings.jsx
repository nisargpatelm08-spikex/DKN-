import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { PREFS_DEFAULTS, RESERVED_KEYS, SHORTCUT_ACTIONS, describeKey } from '../lib/prefs'

// "Shortcut keys" section of the Settings panel: click a key button, then
// press the new key. Saved on this computer with the other preferences.
export default function ShortcutSettings({ prefs, onChange }) {
  const keys = { ...PREFS_DEFAULTS.keys, ...(prefs.keys || {}) }
  const [capturing, setCapturing] = useState(null) // action id
  const [warn, setWarn] = useState('')

  const savedKeys = prefs.keys
  useEffect(() => {
    if (!capturing) return
    const keys = { ...PREFS_DEFAULTS.keys, ...(savedKeys || {}) }
    window.__dknCapturingKey = true
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const k = String(e.key).toLowerCase()
      if (k === 'escape') {
        setCapturing(null)
        setWarn('')
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        setWarn('Use a single key without Ctrl / Alt.')
        return
      }
      if (RESERVED_KEYS.includes(k)) {
        setWarn(`“${describeKey(e.key)}” is already used — pick another key.`)
        return
      }
      const clash = SHORTCUT_ACTIONS.find((a) => a.id !== capturing && keys[a.id] === k)
      if (clash) {
        setWarn(`“${describeKey(e.key)}” already opens the ${clash.label.toLowerCase()}.`)
        return
      }
      onChange({ keys: { ...keys, [capturing]: k } })
      setCapturing(null)
      setWarn('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.__dknCapturingKey = false
    }
  }, [capturing, savedKeys, onChange])

  return (
    <div className="shortcut-settings">
      <div className="tl-sens-sub">Shortcut keys</div>
      {SHORTCUT_ACTIONS.map((a) => (
        <div key={a.id} className="shortcut-row">
          <span className="shortcut-label">
            {a.label}
            <span className="shortcut-hint">{a.hint}</span>
          </span>
          <button
            className={'shortcut-key' + (capturing === a.id ? ' capturing' : '')}
            onClick={() => {
              setWarn('')
              setCapturing((c) => (c === a.id ? null : a.id))
            }}
            title="Click, then press the key you want"
          >
            {capturing === a.id ? 'Press a key…' : describeKey(keys[a.id])}
          </button>
        </div>
      ))}
      {warn && <div className="shortcut-warn">{warn}</div>}
      <button
        className="board-tool-btn"
        onClick={() => {
          setCapturing(null)
          setWarn('')
          onChange({ keys: { ...PREFS_DEFAULTS.keys } })
        }}
      >
        Reset keys to W / S
      </button>
    </div>
  )
}

ShortcutSettings.propTypes = {
  prefs: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired
}
