import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  LANGUAGES,
  translateText,
  detectedLabel,
  getTranslatePrefs,
  saveTranslatePrefs
} from '../lib/translate'
import { mixRows, bucketColor, dominantBucket } from '../lib/langMix'

const LOCAL_DETECT_LABELS = {
  en: 'English',
  hi: 'Hindi (देवनागरी)',
  hinglish: 'Hinglish — Hindi & English mixed',
  shared: 'mostly shared/common words',
  other: 'other / not in dictionary',
  mixed: 'a mix of several languages'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Select({ value, onChange, includeAuto, target }) {
  return (
    <select className="tl-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAuto && <option value="auto">Auto-detect</option>}
      {LANGUAGES.filter((l) => (target ? l.code !== 'auto' : true)).map((l) => (
        <option key={l.code} value={l.code}>
          {l.name} {l.native ? '· ' + l.native : ''}
        </option>
      ))}
    </select>
  )
}

Select.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  includeAuto: PropTypes.bool,
  target: PropTypes.bool
}

function TranslatePanel({ sourceText, story, onApply, onApplyStory, onClose }) {
  const [initial] = useState(getTranslatePrefs)
  const [from, setFrom] = useState(initial.from || 'auto')
  const [to, setTo] = useState(initial.to || 'en')
  const [keepEnglish, setKeepEnglish] = useState(!!initial.keepEnglish)
  const [roman, setRoman] = useState(!!initial.roman)
  const [titleToo, setTitleToo] = useState(!!initial.titleToo)

  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detected, setDetected] = useState(null)
  const [detectedScript, setDetectedScript] = useState(null)
  const [allBusy, setAllBusy] = useState(false)
  const [allProgress, setAllProgress] = useState(0)
  const [allTotal, setAllTotal] = useState(0)
  const [allDone, setAllDone] = useState(false)
  const [applied, setApplied] = useState(false)

  const persistAll = (f, t, ke, ro, tt) =>
    saveTranslatePrefs({ from: f, to: t, keepEnglish: ke, roman: ro, titleToo: tt })

  const handleFrom = (v) => {
    setFrom(v)
    persistAll(v, to, keepEnglish, roman, titleToo)
  }
  const handleTo = (v) => {
    setTo(v)
    persistAll(from, v, keepEnglish, roman, titleToo)
  }
  const handleKeep = (v) => {
    setKeepEnglish(v)
    persistAll(from, to, v, roman, titleToo)
  }
  const handleRoman = (v) => {
    setRoman(v)
    persistAll(from, to, keepEnglish, v, titleToo)
  }
  const handleTitleToo = (v) => {
    setTitleToo(v)
    persistAll(from, to, keepEnglish, roman, v)
  }

  const swap = () => {
    if (to === 'auto') return
    handleFrom(to)
    handleTo(from)
  }

  const sourceRows = useMemo(() => mixRows(sourceText || ''), [sourceText])
  const localDominant = useMemo(
    () => (sourceText && sourceText.trim() ? dominantBucket(sourceText) : null),
    [sourceText]
  )

  const doTranslate = async (text, overrides = {}) => {
    const opts = {
      from: overrides.from ?? from,
      to: overrides.to ?? to,
      keepEnglish: overrides.keepEnglish ?? (keepEnglish && to !== 'en'),
      roman: overrides.roman ?? (roman && (overrides.to ?? to) === 'hi')
    }
    const res = await translateText(text, opts)
    if (res.detected) {
      setDetected(res.detected)
      setDetectedScript(res.detectedScript)
    }
    return res.text
  }

  const handleTranslate = async () => {
    if (!sourceText || !sourceText.trim()) return
    setBusy(true)
    setError('')
    setApplied(false)
    try {
      const text = await doTranslate(sourceText)
      setResult(text)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setError('')
    } catch {
      setError('Could not copy to the clipboard.')
    }
  }

  const handleApply = () => {
    if (!result || result === sourceText) {
      onClose()
      return
    }
    onApply(result)
    setApplied(true)
    setTimeout(onClose, 350)
  }

  const handleWholeStory = async () => {
    if (!story || !story.chapters) return
    const scenes = story.chapters.flatMap((c) => c.scenes).filter((s) => (s.text || '').trim())
    if (!scenes.length) return
    setAllBusy(true)
    setAllDone(false)
    setAllTotal(scenes.length)
    setAllProgress(0)
    const map = {}
    try {
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i]
        const out = await doTranslate(scene.text || '')
        const entry = {}
        if (titleToo) {
          const titleRes = await translateText(scene.title || '', {
            from,
            to,
            keepEnglish: false,
            roman: roman && to === 'hi'
          })
          entry.title = titleRes.text
        }
        entry.text = out
        map[scene.id] = entry
        setAllProgress(i + 1)
        await sleep(300)
      }
      onApplyStory(map)
      setAllDone(true)
    } catch (err) {
      setError(
        cleanError(err) +
          (allProgress ? ` — ${allProgress}/${scenes.length} scenes done (already applied).` : '')
      )
      if (Object.keys(map).length) onApplyStory(map)
    } finally {
      setAllBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleTranslate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const detectedChip = detected
    ? detectedLabel(detected, detectedScript)
    : localDominant
      ? LOCAL_DETECT_LABELS[localDominant] || null
      : null

  const sourceWords = useMemo(() => {
    const m = (sourceText || '').trim().match(/[\p{L}\p{N}'-]+/gu)
    return m ? m.length : 0
  }, [sourceText])
  const resultWords = useMemo(() => {
    const m = result.trim().match(/[\p{L}\p{N}'-]+/gu)
    return m ? m.length : 0
  }, [result])

  return (
    <div className="tl-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tl-panel">
        <div className="tl-head">
          <div>
            <div className="tl-title">🌐 Translate</div>
            <div className="tl-subtitle">
              Any language · Indian mix (Hindi + English) · live word-percentage
            </div>
          </div>
          <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="tl-controls">
          <div className="tl-field">
            <label className="tl-label">From</label>
            <Select value={from} onChange={handleFrom} includeAuto />
          </div>
          <button className="tl-swap" title="Swap languages" onClick={swap}>
            ⇄
          </button>
          <div className="tl-field">
            <label className="tl-label">To</label>
            <Select value={to} onChange={handleTo} target />
          </div>
        </div>

        <div className="tl-options">
          {to === 'hi' && (
            <div className="tl-opt">
              <span className="tl-opt-label">Hindi output</span>
              <div className="tl-seg">
                <button
                  className={'tl-seg-btn' + (!roman ? ' active' : '')}
                  onClick={() => handleRoman(false)}
                >
                  देवनागरी
                </button>
                <button
                  className={'tl-seg-btn' + (roman ? ' active' : '')}
                  onClick={() => handleRoman(true)}
                >
                  Roman (Hinglish)
                </button>
              </div>
            </div>
          )}
          {to !== 'en' && (
            <label
              className="tl-check"
              title="Keep the English words you wrote in the translation — the way Indians mix Hindi & English in real life"
            >
              <input
                type="checkbox"
                checked={keepEnglish}
                onChange={(e) => handleKeep(e.target.checked)}
              />
              Keep my English words (Indian mix)
            </label>
          )}
          <label
            className="tl-check"
            title="Also translate every scene title while translating the whole story"
          >
            <input
              type="checkbox"
              checked={titleToo}
              onChange={(e) => handleTitleToo(e.target.checked)}
            />
            Translate scene titles too
          </label>
        </div>

        <div className="tl-grid">
          <div className="tl-col">
            <div className="tl-col-head">
              Original
              <span className="tl-count">{sourceWords} words</span>
              {detectedChip && <span className="tl-chip">{detectedChip}</span>}
            </div>
            <textarea className="tl-src" value={sourceText || ''} readOnly spellCheck={false} />
          </div>
          <div className="tl-col">
            <div className="tl-col-head">
              Translation
              <span className="tl-count">{resultWords} words</span>
              {busy && <span className="tl-chip busy">translating…</span>}
              {applied && !busy && <span className="tl-chip ok">✓ applied</span>}
            </div>
            <textarea
              className={'tl-dst' + (result ? ' has-result' : '')}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="Your translation appears here — press Translate or Ctrl+Enter"
              spellCheck={false}
            />
          </div>
        </div>

        {error && <div className="tl-error">⚠️ {error}</div>}

        <div className="tl-mix">
          <div className="tl-mix-head">
            Language mix — % of words per language in your text
            <span className="tl-count">live · offline</span>
          </div>
          {sourceRows.length ? (
            <div className="tl-mix-rows">
              {sourceRows.map((r) => (
                <div className="tl-mix-row" key={r.id}>
                  <span className="tl-dot" style={{ background: bucketColor(r.id) }} />
                  <span className="tl-mix-name">{r.label}</span>
                  <span className="tl-mix-bar">
                    <span
                      className="tl-mix-fill"
                      style={{ width: r.pct + '%', background: bucketColor(r.id) }}
                    />
                  </span>
                  <span className="tl-mix-num">
                    {r.pct}% · {r.count}
                  </span>
                </div>
              ))}
              {!sourceText && (
                <div className="tl-mix-empty">
                  Write prose in a scene to see the language breakdown.
                </div>
              )}
            </div>
          ) : (
            <div className="tl-mix-empty">
              {sourceText
                ? 'Nothing to analyse in this scene yet.'
                : 'Write prose in a scene to see the language breakdown.'}
            </div>
          )}
        </div>

        <div className="tl-actions">
          {allBusy ? (
            <span className="tl-progress">
              Translating whole story… {allProgress}/{allTotal}
            </span>
          ) : allDone ? (
            <span className="tl-progress ok">✓ Whole story translated & applied.</span>
          ) : (
            <button className="tonal-btn" onClick={handleWholeStory} disabled={busy || !sourceText}>
              Translate whole story
            </button>
          )}
          <span className="tl-spacer" />
          <button className="tonal-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="tonal-btn"
            onClick={handleTranslate}
            disabled={busy || !sourceText || !sourceText.trim()}
          >
            {busy ? 'Translating…' : 'Translate'}
          </button>
          {result && (
            <button className="tonal-btn" onClick={handleCopy} disabled={busy}>
              Copy
            </button>
          )}
          {result && (
            <button className="tonal-btn primary" onClick={handleApply} disabled={busy}>
              ✓ Apply to scene
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function cleanError(err) {
  const msg = err && err.message ? err.message : String(err)
  // strip Electron's "Error invoking remote method …" wrapper
  const idx = msg.indexOf('Error: ')
  return idx >= 0 ? msg.slice(idx + 7) : msg
}

TranslatePanel.propTypes = {
  sourceText: PropTypes.string,
  story: PropTypes.object,
  onApply: PropTypes.func.isRequired,
  onApplyStory: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default TranslatePanel
