// Small user-preference settings stored in localStorage (not part of the story).
// Kept SSR-safe so components can be rendered in tests without a window.

export const PREFS_DEFAULTS = {
  // Wheel pan multiplier (1 = full pixel-for-pixel speed).
  panSpeed: 0.55,
  // Per wheel notch zoom factor used by Ctrl/⌘+scroll.
  zoomStep: 1.07,
  // Thread bend of Board links, 0–100 (the same idea as Blender's
  // "Noodle Curving": 0 = perfectly straight threads, 100 = very curvy).
  threadCurve: 50,
  // Shortcut keys for the tool menus on the Board and Timeline. The user can
  // change them in ⚙ Settings ▸ Shortcut keys.
  keys: { wireMenu: 'w', sceneMenu: 's' }
}

// Keys that can't be used as a menu shortcut (they already do something).
export const RESERVED_KEYS = [
  'escape',
  'enter',
  'tab',
  'backspace',
  'delete',
  ' ',
  'shift',
  'control',
  'alt',
  'meta',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9'
]

export const SHORTCUT_ACTIONS = [
  { id: 'wireMenu', label: 'Wire tools menu', hint: 'cut, connect, auto sequence, beautify' },
  { id: 'sceneMenu', label: 'Scene tools menu', hint: 'edit, ports, tags, duplicate, delete…' }
]

// "w" -> "W", " " -> "Space", "F2" stays "F2".
export function describeKey(key) {
  if (!key) return '—'
  if (key === ' ') return 'Space'
  return key.length === 1 ? key.toUpperCase() : key
}

// Does this keyboard event press the given shortcut (no Ctrl/Alt/⌘ held)?
export function keyMatches(e, key) {
  if (!key || e.ctrlKey || e.metaKey || e.altKey) return false
  return String(e.key).toLowerCase() === String(key).toLowerCase()
}

// True while the user is typing in a text box — shortcuts must not fire then.
export function isTypingTarget(e) {
  const el = e.target
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

// Broadcasts every prefs save so open windows (Board, Timeline) can react
// live — e.g. moving the Thread bend slider redraws the threads immediately.
export const PREFS_EVENT = 'dkn-prefs'

const KEY = 'dkn_prefs_v1'

export function getPrefs() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...PREFS_DEFAULTS }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return {
        ...PREFS_DEFAULTS,
        ...saved,
        keys: { ...PREFS_DEFAULTS.keys, ...(saved && saved.keys ? saved.keys : {}) }
      }
    }
  } catch {
    /* corrupted value — fall through to defaults */
  }
  return { ...PREFS_DEFAULTS }
}

export function savePrefs(prefs) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — settings just won't persist */
  }
  try {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { ...prefs } }))
  } catch {
    /* no listeners — other windows simply keep their current settings */
  }
}
