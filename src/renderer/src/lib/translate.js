// Translation service for DKN.
//   - Talks to a free web translation endpoint through the main process
//     (`window.api.translate`), because the renderer CSP only allows 'self'.
//   - Auto-detects the source language, including Hinglish (Hindi typed in
//     Latin script, e.g. "main park mein walk kar raha tha" → detected hi-Latn).
//   - Offers an "Indian mix" mode: keep the English words you typed, so the
//     translation stays Hinglish-style (e.g. "मैं park जा रहा हूँ").
//   - Can render Hindi output in Devanagari या Roman (Hinglish).
//   - Chunks very long prose so even a whole scene translates in one go.

import { hasDevanagari, isHinglishText } from './langMix.js'
import { toRoman } from './devanagari.js'

export const LANGUAGES = [
  // --- Indian languages ---
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', group: 'Indian' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', group: 'Indian' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', group: 'Indian' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', group: 'Indian' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', group: 'Indian' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', group: 'Indian' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', group: 'Indian' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', group: 'Indian' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', group: 'Indian' },
  { code: 'ur', name: 'Urdu', native: 'اردو', group: 'Indian' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', group: 'Indian' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', group: 'Indian' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', group: 'Indian' },
  { code: 'si', name: 'Sinhala', native: 'සිංහල', group: 'Indian' },
  // --- World languages ---
  { code: 'en', name: 'English', native: 'English', group: 'World' },
  { code: 'es', name: 'Spanish', native: 'Español', group: 'World' },
  { code: 'fr', name: 'French', native: 'Français', group: 'World' },
  { code: 'de', name: 'German', native: 'Deutsch', group: 'World' },
  { code: 'it', name: 'Italian', native: 'Italiano', group: 'World' },
  { code: 'pt', name: 'Portuguese', native: 'Português', group: 'World' },
  { code: 'ru', name: 'Russian', native: 'Русский', group: 'World' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '中文', group: 'World' },
  { code: 'ja', name: 'Japanese', native: '日本語', group: 'World' },
  { code: 'ko', name: 'Korean', native: '한국어', group: 'World' },
  { code: 'ar', name: 'Arabic', native: 'العربية', group: 'World' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', group: 'World' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', group: 'World' },
  { code: 'pl', name: 'Polish', native: 'Polski', group: 'World' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', group: 'World' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', group: 'World' },
  { code: 'th', name: 'Thai', native: 'ไทย', group: 'World' },
  { code: 'id', name: 'Indonesian', native: 'Indonesia', group: 'World' },
  { code: 'he', name: 'Hebrew', native: 'עברית', group: 'World' },
  { code: 'fa', name: 'Persian', native: 'فارسی', group: 'World' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', group: 'World' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', group: 'World' }
]

export function languageByCode(code) {
  return LANGUAGES.find((l) => l.code === code)
}

export function languageLabel(code) {
  const l = languageByCode(code)
  return l ? `${l.name}` : code
}

// Friendly label for a service-detected language script pair.
export function detectedLabel(detected, script) {
  if (detected === 'hi' && script === 'hi-Latn') return 'Hinglish (Hindi in Latin script)'
  if (detected === 'hi') return 'Hindi'
  if (!detected) return null
  const base = languageByCode(detected)
  return base ? base.name : detected
}

const MAX_CHUNK = 3800

// Split long prose into chunks on paragraph / sentence boundaries.
function splitChunks(text) {
  if (text.length <= MAX_CHUNK) return [{ text }]
  const chunks = []
  const paragraphs = text.split(/(\n+)/)
  let current = ''
  let sep = ''
  const push = (part, gap) => {
    if ((current + gap + part).length > MAX_CHUNK) {
      if (current) {
        chunks.push({ text: current })
        current = ''
      }
    }
    current += (current ? gap : '') + part
  }
  // Pack paragraphs, splitting a single giant paragraph by sentences.
  let buf = ''
  for (const piece of paragraphs) {
    if (/\n/.test(piece) || buf.length + piece.length > MAX_CHUNK) {
      if (/\n/.test(piece)) {
        push(buf, sep)
        buf = ''
        sep = '\n\n'
      } else {
        // sentence-fitting for a giant paragraph
        const sentences = piece.split(/(?<=[.!?\u0964])\s+/)
        for (const s of sentences) {
          if (buf && (buf + sep + s).length > MAX_CHUNK) {
            push(buf, sep)
            buf = ''
            sep = ' '
          }
          buf = buf ? buf + ' ' + s : s
        }
        if (!sep && buf) sep = ' '
      }
    } else {
      buf = buf ? buf + piece : piece
      if (buf.length >= MAX_CHUNK) {
        push(buf, sep)
        buf = ''
        sep = ' '
      }
    }
  }
  if (buf) push(buf, sep)
  if (current) chunks.push({ text: current })
  return chunks
}

// ---- "keep my English words" (Indian mix) placeholders ----
// English words an Indian naturally keeps in a Hindi sentence (loanwords like
// park, meeting, office, time) are wrapped in safe tokens before translation
// and restored afterwards — producing genuine Hinglish output. Grammar words
// are left alone so the translation engine can do its job.

const LOANWORDS = new Set(
  (
    'park walk time meeting movie movie film office school college university hostel market bus train car bike taxi auto rickshaw ' +
    'phone mobile call message whatsapp email internet wifi laptop computer system printer ticket station platform ' +
    'class teacher student exam paper question answer copy notebook pen pencil rubber scale bag books library ' +
    'plate glass cup spoon table chair room kitchen bathroom bedroom hall house flat sofa bed lamp ' +
    'party birthday holiday weekend friend friends family mother father sister brother uncle aunt mama ' +
    'boss manager staff team job work salary money cash bill card bank atm petrol diesel ' +
    'doctor hospital medicine injection nurse operation patient fever cold cough headache pain sugar bp pressure ' +
    'test report xray photo camera video gift cake chocolate juice pizza burger tea coffee ' +
    'dress shirt jeans tshirt shoes watch ring chain makeup lipstick cream soap shampoo oil ' +
    'problem idea plan question answer excuse mistake chance opportunity project report meeting minutes agenda ' +
    'road highway traffic signal police station court lawyer judge case fight ticket fine ' +
    'weather rain cloudy sunny storm waiter hotel restaurant menu bill tip ' +
    'story chapter scene novel writer author editor draft print publish ' +
    'today tomorrow yesterday week month year time date morning afternoon evening night day night morning'
  )
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/['’-]/g, ''))
)

function isLoan(word) {
  const w = word.toLowerCase().replace(/['’-]/g, '')
  if (LOANWORDS.has(w)) return true
  if (w.endsWith('es') && LOANWORDS.has(w.slice(0, -2))) return true
  if (w.endsWith('s') && LOANWORDS.has(w.slice(0, -1))) return true
  return false
}

const PLACEHOLDER_RE = /[A-Za-z][A-Za-z'-]*/g

function protectEnglishWords(text) {
  const restore = []
  let index = 0
  const protectedText = text.replace(PLACEHOLDER_RE, (word) => {
    if (isLoan(word) && restore.length < 300) {
      const tag = 'ZQ' + index + 'ZQ'
      restore.push({ tag, word })
      index++
      return tag
    }
    return word
  })
  return { text: protectedText, restore }
}

function restoreEnglishWords(text, restore) {
  let out = text
  for (const { tag, word } of restore) {
    out = out.replace(new RegExp(tag, 'gi'), word)
  }
  return out
}

// ---- polite request pacing + retry ----
// The free endpoint rate-limits bursts (HTTP 429), so successive calls are
// spaced a little apart. Busy/5xx/network replies are handled by the main
// process (it falls back to a backup provider); here we only retry genuine
// transient glitches rather than re-hitting a busy service.

const MIN_GAP_MS = 600
const MAX_ATTEMPTS = 3 // 1 try + up to 2 retries

let lastRequestAt = 0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Pull an HTTP status out of IPC error text like "…(429)…".
function requestErrorStatus(err) {
  const msg = err && err.message ? String(err.message) : String(err)
  const m = /\b(\d{3})\b/.exec(msg)
  return m ? Number(m[1]) : null
}

function isRetryable(err) {
  const status = requestErrorStatus(err)
  if (status === 429 || (status >= 500 && status <= 599)) return true
  const msg = err && err.message ? String(err.message) : String(err)
  return /Cannot reach|fetch failed|ECONN|ENOTFOUND|socket hang up|network/i.test(msg)
}

async function callTranslate(q, from, to) {
  if (!window.api || typeof window.api.translate !== 'function') {
    throw new Error('Translation is not available in this build.')
  }
  let delay = 700
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Space every actual request (including retries) at least MIN_GAP_MS apart.
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    try {
      const res = await window.api.translate({ q, from, to })
      if (!res || typeof res.text !== 'string')
        throw new Error('The translation service returned nothing useful.')
      return res
    } catch (err) {
      const last = attempt === MAX_ATTEMPTS - 1
      if (last || !isRetryable(err)) throw err
      await sleep(delay + Math.floor(Math.random() * 200))
      delay *= 2
    }
  }
  /* istanbul ignore next */
  throw new Error('Translation failed.') // unreachable — loop always throws above
}

// ---- local translation cache ----
// The same sentence is often translated over and over (re-opened panels,
// whole-story re-runs), so finished translations are kept in memory and in
// localStorage and served instantly without touching the network.

const CACHE_KEY = 'dkn_translate_cache_v1'
const MAX_CACHE = 120

function loadCache() {
  try {
    if (typeof localStorage === 'undefined') return new Map()
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new Map()
    return new Map(JSON.parse(raw).map((e) => [e.k, e]))
  } catch {
    return new Map()
  }
}

let memo = loadCache()
let cacheSaveTimer = null

function memoGet(key) {
  const e = memo.get(key)
  if (!e) return null
  return {
    text: e.t,
    detected: e.d,
    detectedScript: e.ds,
    provider: e.p,
    cached: true
  }
}

function memoSet(key, entry) {
  memo.set(key, {
    k: key,
    t: entry.text,
    d: entry.detected,
    ds: entry.detectedScript,
    p: entry.provider
  })
  if (memo.size > MAX_CACHE) {
    const oldest = Array.from(memo.keys()).slice(0, memo.size - MAX_CACHE)
    oldest.forEach((k) => memo.delete(k))
  }
  clearTimeout(cacheSaveTimer)
  cacheSaveTimer = setTimeout(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(memo.values())))
      }
    } catch {
      /* storage full or unavailable — ignore */
    }
  }, 1500)
}

// Main entry: translate a piece of prose.
// options: { from, to, keepEnglish, roman }
// returns { text, detected, detectedScript, provider, cached }
export async function translateText(text, options = {}) {
  const { from = 'auto', to = 'en', keepEnglish = false, roman = false } = options
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) {
    return { text: '', detected: null, detectedScript: null, provider: null, cached: false }
  }

  const key = JSON.stringify([from, to, !!keepEnglish, !!roman, source])
  const hit = memoGet(key)
  if (hit) return hit

  const chunks = splitChunks(source)
  const parts = []
  let detected = null
  let detectedScript = null
  let provider = null

  for (const chunk of chunks) {
    let q = chunk.text
    let protect = null
    if (keepEnglish && to !== 'en' && !isHinglishText(q)) {
      protect = protectEnglishWords(q)
      q = protect.text
    }

    const res = await callTranslate(q, from, to)
    if (!detected && res.detected) {
      detected = res.detected
      detectedScript = res.detectedScript
    }
    if (res.provider) provider = res.provider
    let out = res.text

    // Hinglish (roman Hindi) typing → formal Hindi needs a pivot via English,
    // since the service treats hi-Latn and hi as the *same* language.
    if (to === 'hi' && !hasDevanagari(q) && out.trim() === q.trim() && isHinglishText(q)) {
      const viaEnglish = await callTranslate(q, 'auto', 'en')
      const toHindi = await callTranslate(viaEnglish.text, 'en', 'hi')
      out = toHindi.text
    }

    if (protect) out = restoreEnglishWords(out, protect.restore)
    if (to === 'hi' && roman) out = toRoman(out)

    parts.push(out)
  }

  const result = {
    text: parts.join('\n\n'),
    detected,
    detectedScript,
    provider,
    cached: false
  }
  memoSet(key, result)
  return result
}

// ---------- editor prefs (last used choices) ----------

const PREFS_KEY = 'dkn_translate_v1'

export function getTranslatePrefs() {
  const defaults = { from: 'auto', to: 'en', keepEnglish: false, roman: false, titleToo: false }
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaults
}

export function saveTranslatePrefs(prefs) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}
