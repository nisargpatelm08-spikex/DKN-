// Translation service for DKN.
//   - Talks to a free web translation endpoint through the main process
//     (`window.api.translate`), because the renderer CSP only allows 'self'.
//   - Auto-detects the source language, including Hinglish (Hindi typed in
//     Latin script, e.g. "main park mein walk kar raha tha" → detected hi-Latn).
//   - Offers an "Indian mix" mode: keep the English words you typed, so the
//     translation stays Hinglish-style (e.g. "मैं park जा रहा हूँ").
//   - Can render Hindi output in Devanagari या Roman (Hinglish).
//   - Chunks very long prose so even a whole scene translates in one go.

import { hasDevanagari, isEnglishWord, isHinglishText } from './langMix.js'
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
// English words get replaced by safe tokens before translation, then put back
// afterwards, so the result keeps them in English — Hinglish style.

const PLACEHOLDER_RE = /[A-Za-z][A-Za-z'-]*/g

function protectEnglishWords(text) {
  const restore = []
  let index = 0
  const protectedText = text.replace(PLACEHOLDER_RE, (word) => {
    if (isEnglishWord(word) && restore.length < 300) {
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

// Main entry: translate a piece of prose.
// options: { from, to, keepEnglish, roman }
// returns { text, detected, detectedScript }
export async function translateText(text, options = {}) {
  const { from = 'auto', to = 'en', keepEnglish = false, roman = false } = options
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) return { text: '', detected: null, detectedScript: null }

  const chunks = splitChunks(source)
  const parts = []
  let detected = null
  let detectedScript = null

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

  return { text: parts.join('\n\n'), detected, detectedScript }
}

async function callTranslate(q, from, to) {
  if (!window.api || typeof window.api.translate !== 'function') {
    throw new Error('Translation is not available in this build.')
  }
  const res = await window.api.translate({ q, from, to })
  if (!res || typeof res.text !== 'string')
    throw new Error('The translation service returned nothing useful.')
  return res
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
