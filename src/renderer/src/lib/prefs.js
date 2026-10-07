// Small user-preference settings stored in localStorage (not part of the story).
// Kept SSR-safe so components can be rendered in tests without a window.

export const PREFS_DEFAULTS = {
  // Wheel pan multiplier (1 = full pixel-for-pixel speed).
  panSpeed: 0.55,
  // Per wheel notch zoom factor used by Ctrl/⌘+scroll.
  zoomStep: 1.07,
  // Thread bend of Board links, 0–100 (the same idea as Blender's
  // "Noodle Curving": 0 = perfectly straight threads, 100 = very curvy).
  threadCurve: 50
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
    if (raw) return { ...PREFS_DEFAULTS, ...JSON.parse(raw) }
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
