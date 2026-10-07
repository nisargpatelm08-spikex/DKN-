// Story timeline helpers — a user-built calendar of years -> months -> days,
// plus where each scene falls on it. Pure functions on story objects.

export const DAY_CELL_W = 54
export const DAY_CELL_H = 34
export const MONTH_H = 26
export const HEADER_H = 32
export const CHIP_H = 22
export const CHIP_GAP = 3
export const MAX_CHIPS_VISIBLE = 3

// Time-of-day slots a scene can be placed in within a day.
export const DAY_SLOTS = [
  { id: 'dawn', label: 'Dawn', icon: '🌅' },
  { id: 'morning', label: 'Morning', icon: '☀️' },
  { id: 'noon', label: 'Noon', icon: '🕛' },
  { id: 'afternoon', label: 'Afternoon', icon: '🌇' },
  { id: 'evening', label: 'Evening', icon: '🌒' },
  { id: 'night', label: 'Night', icon: '🌙' }
]

export const DAY_SLOT_MAP = Object.fromEntries(DAY_SLOTS.map((s) => [s.id, s]))

// -1 = no time set ("any time"), a valid slot returns its position in the day.
export function slotRank(slot) {
  const i = DAY_SLOTS.findIndex((s) => s.id === slot)
  return i < 0 ? -1 : i
}

export function slotIconOf(slot) {
  return (slot && DAY_SLOT_MAP[slot] && DAY_SLOT_MAP[slot].icon) || ''
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2)
}

export function defaultTimeline() {
  return {
    years: [{ id: uid(), label: 'Year 1', monthCount: 6, dayCount: 14, monthLabels: [] }]
  }
}

export function totalDays(year) {
  return Math.max(1, Math.floor(year.monthCount || 1)) * Math.max(1, Math.floor(year.dayCount || 1))
}

export function dayCount(year) {
  return Math.max(1, Math.floor(year.dayCount || 1))
}

export function monthCount(year) {
  return Math.max(1, Math.floor(year.monthCount || 1))
}

export function monthName(year, m) {
  const list = Array.isArray(year.monthLabels) ? year.monthLabels : []
  if (list[m] && String(list[m]).trim()) return String(list[m]).trim()
  return 'Month ' + (m + 1)
}

// Global day number inside one year: day t (0-based) -> { month, dayOfMonth }.
export function splitDay(year, t) {
  const dc = dayCount(year)
  return { month: Math.floor(t / dc), day: (t % dc) + 1 }
}

export function dayLabel(year, t) {
  const { day } = splitDay(year, t)
  return 'Day ' + day
}

export function parseMonthLabels(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------- structure mutations ----------

export function addTimelineYear(story) {
  const tl = story.timeline || defaultTimeline()
  const year = {
    id: uid(),
    label: 'Year ' + (tl.years.length + 1),
    monthCount: 12,
    dayCount: 30,
    monthLabels: []
  }
  return { ...story, timeline: { ...tl, years: [...tl.years, year] } }
}

export function patchTimelineYear(story, yearId, patch) {
  const tl = story.timeline || defaultTimeline()
  return {
    ...story,
    timeline: {
      ...tl,
      years: tl.years.map((y) => (y.id === yearId ? { ...y, ...patch } : y))
    }
  }
}

export function removeTimelineYear(story, yearId) {
  const tl = story.timeline || defaultTimeline()
  const years = tl.years.filter((y) => y.id !== yearId)
  const next = { ...story, timeline: { ...tl, years } }
  // Wipe dates that pointed into the deleted year.
  return clearTimelineForYear(next, yearId)
}

export function clearTimelineForYear(story, yearId) {
  let changed = false
  const chapters = story.chapters.map((c) => ({
    ...c,
    scenes: c.scenes.map((s) => {
      if (s.timeline && s.timeline.yearId === yearId) {
        changed = true
        return { ...s, timeline: undefined }
      }
      return s
    })
  }))
  return changed ? { ...story, chapters } : story
}

// ---------- scene dating ----------

export function assignSceneTime(story, sceneId, time) {
  return {
    ...story,
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) => {
        if (s.id !== sceneId) return s
        if (!time) return { ...s, timeline: undefined }
        // Keep an existing time-of-day slot unless the caller overrides it.
        const prevSlot = s.timeline && s.timeline.slot
        const prevTime = s.timeline && s.timeline.time
        return {
          ...s,
          timeline: {
            yearId: time.yearId,
            day: time.day,
            slot: time.slot !== undefined ? time.slot : prevSlot,
            time: time.time !== undefined ? time.time : prevTime || ''
          }
        }
      })
    }))
  }
}

export function sceneTime(story, sceneId) {
  for (const c of story.chapters) {
    const s = c.scenes.find((x) => x.id === sceneId)
    if (s && s.timeline) return s.timeline
  }
  return null
}

// Every dated scene: { scene, chapterIndex, sceneIndex, yearId, yearIndex, day, slot }
// sorted by (year order, day, time-of-day slot, chapter order).
export function datedScenes(story) {
  const tl = story.timeline || defaultTimeline()
  const yearIdx = new Map(tl.years.map((y, i) => [y.id, i]))
  const out = []
  story.chapters.forEach((chapter, ci) => {
    chapter.scenes.forEach((scene, si) => {
      const t = scene.timeline
      if (!t || !yearIdx.has(t.yearId)) return
      const year = tl.years[yearIdx.get(t.yearId)]
      if (!Number.isFinite(t.day) || t.day < 0 || t.day >= totalDays(year)) return
      out.push({
        scene,
        chapterIndex: ci,
        sceneIndex: si,
        yearId: t.yearId,
        yearIndex: yearIdx.get(t.yearId),
        day: t.day,
        slot: t.slot
      })
    })
  })
  out.sort(
    (a, b) =>
      a.yearIndex - b.yearIndex ||
      a.day - b.day ||
      slotRank(a.slot) - slotRank(b.slot) ||
      a.chapterIndex - b.chapterIndex ||
      a.sceneIndex - b.sceneIndex
  )
  return out
}

// ---------- canvas layout ----------

export const TL_PAD_X = 18
export const TL_PAD_TOP = 84
export const YEAR_GAP = 70

// World-coordinate layout of the whole calendar.
export function layoutYears(story) {
  // A story may have a timeline object with links but no years yet (or none
  // at all) — always fall back to a usable default calendar.
  const tl =
    story.timeline && Array.isArray(story.timeline.years) && story.timeline.years.length
      ? story.timeline
      : defaultTimeline()
  const byDay = new Map()
  story.chapters.forEach((chapter, ci) => {
    chapter.scenes.forEach((scene, si) => {
      if (scene.timeline) {
        const key = scene.timeline.yearId + ':' + scene.timeline.day
        if (!byDay.has(key)) byDay.set(key, [])
        byDay.get(key).push({ scene, chapterIndex: ci, sceneIndex: si })
      }
    })
  })

  let y = TL_PAD_TOP
  const years = tl.years.map((year, yi) => {
    const total = totalDays(year)
    const cells = []
    for (let t = 0; t < total; t++) {
      cells.push({ t, x: TL_PAD_X + t * DAY_CELL_W })
    }
    const cellTop = y + HEADER_H + MONTH_H + 10
    let maxStack = 1
    const stacks = new Map()
    for (let t = 0; t < total; t++) {
      const key = year.id + ':' + t
      const list = [...(byDay.get(key) || [])].sort((a, b) => {
        const ra = slotRank(a.scene?.timeline?.slot)
        const rb = slotRank(b.scene?.timeline?.slot)
        return ra - rb || a.chapterIndex - b.chapterIndex || a.sceneIndex - b.sceneIndex
      })
      stacks.set(t, list)
      if (list.length) maxStack = Math.max(maxStack, Math.min(list.length, MAX_CHIPS_VISIBLE + 1))
    }
    const chipLaneH = maxStack * (CHIP_H + CHIP_GAP)
    const band = {
      year,
      index: yi,
      id: year.id,
      cells,
      stacks,
      width: total * DAY_CELL_W + TL_PAD_X * 2,
      height: HEADER_H + MONTH_H + 10 + DAY_CELL_H + 8 + chipLaneH + 22,
      x: 0,
      y,
      cellTop,
      chipLaneTop: cellTop + DAY_CELL_H + 8
    }
    y += band.height + YEAR_GAP
    return band
  })

  return {
    years,
    width: Math.max(600, ...years.map((b) => b.width)),
    height: y - YEAR_GAP + TL_PAD_TOP,
    totalDays: years.reduce((n, b) => n + b.cells.length, 0),
    story
  }
}

export function boundsOfTimeline(story) {
  const lay = layoutYears(story)
  const M = 110
  return { x: -M, y: -M, w: lay.width + M * 2, h: lay.height + M * 2 }
}

export function dayAt(layout, wx, wy) {
  for (const band of layout.years) {
    for (const cell of band.cells) {
      const cx = band.x + cell.x + 2
      const cy = band.cellTop + 2
      if (wx >= cx && wx <= cx + DAY_CELL_W - 4 && wy >= cy && wy <= cy + DAY_CELL_H - 4) {
        return { yearId: band.id, day: cell.t }
      }
    }
  }
  return null
}

// ---------- actual-story wires (timeline links) ----------
// The Timeline shows the real story in time order. Scenes connect the same
// way as on the Board: a scene's NEGATIVE (right edge) flows into the next
// scene's POSITIVE (left edge). A timeline link is stored as
// { fromSceneId, toSceneId } where `from` is the scene whose negative feeds
// into the `to` scene's positive.

export function tlLinks(story) {
  return story.timeline?.links || []
}

export function addTimelineLink(story, fromSceneId, toSceneId) {
  if (!fromSceneId || !toSceneId || fromSceneId === toSceneId) return story
  const links = story.timeline?.links || []
  if (links.some((l) => l.fromSceneId === fromSceneId && l.toSceneId === toSceneId)) return story
  const hasYears = Array.isArray(story.timeline?.years) && story.timeline.years.length
  return {
    ...story,
    timeline: {
      ...(story.timeline || {}),
      ...(hasYears ? {} : { years: defaultTimeline().years }),
      links: [...links, { id: uid(), fromSceneId, toSceneId }]
    }
  }
}

// ======================================================================
// Scene "when": year + month + day + time on the story's own calendar,
// absolute ordering, time gaps between scenes/chapters, and the flow layout.
// ======================================================================

const MIN_PER_DAY = 1440

// Rough clock time for the old time-of-day slots, so scenes dated before
// exact times existed still sort sensibly.
export const SLOT_MINUTES = {
  dawn: 6 * 60,
  morning: 9 * 60,
  noon: 12 * 60,
  afternoon: 15 * 60,
  evening: 18 * 60,
  night: 21 * 60
}

export function calendarOf(story) {
  return story.timeline && Array.isArray(story.timeline.years) && story.timeline.years.length
    ? story.timeline
    : defaultTimeline()
}

// "14:30" -> 870 minutes. Returns null for empty / invalid input.
export function parseTime(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text || ''))
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

// Where a scene's date sits on the calendar, or null if undated/invalid.
// { yearIndex, year, month (0-based), day (1-based), dayIndex, minutes, hasTime }
export function whenParts(cal, t) {
  if (!t || !t.yearId) return null
  const yearIndex = cal.years.findIndex((y) => y.id === t.yearId)
  if (yearIndex < 0) return null
  const year = cal.years[yearIndex]
  if (!Number.isFinite(t.day) || t.day < 0 || t.day >= totalDays(year)) return null
  const { month, day } = splitDay(year, t.day)
  const exact = parseTime(t.time)
  const minutes =
    exact != null ? exact : t.slot && SLOT_MINUTES[t.slot] != null ? SLOT_MINUTES[t.slot] : 0
  return { yearIndex, year, month, day, dayIndex: t.day, minutes, hasTime: exact != null }
}

// Minutes from the very start of the calendar — a single number to sort by
// and subtract. Earlier years are counted with their own month/day sizes.
export function absMinutes(cal, t) {
  const p = whenParts(cal, t)
  if (!p) return null
  let days = 0
  for (let i = 0; i < p.yearIndex; i++) days += totalDays(cal.years[i])
  return (days + p.dayIndex) * MIN_PER_DAY + p.minutes
}

// Absolute minutes for a (yearIndex, month, day) point, clamped to that
// year's shape. Used for calendar-aware gap counting.
function absOfPoint(cal, yearIndex, month, day0, minutes) {
  let days = 0
  for (let i = 0; i < yearIndex; i++) days += totalDays(cal.years[i])
  const year = cal.years[yearIndex]
  const m = Math.min(month, monthCount(year) - 1)
  const d = Math.min(day0, dayCount(year) - 1)
  return (days + m * dayCount(year) + d) * MIN_PER_DAY + minutes
}

// Move a point forward by Y years and M months on the custom calendar.
// Returns Infinity when it runs past the last defined year.
function shiftPoint(cal, p, Y, M) {
  let yi = p.yearIndex + Y
  if (yi >= cal.years.length) return Infinity
  let month = p.month + M
  while (yi < cal.years.length && month >= monthCount(cal.years[yi])) {
    month -= monthCount(cal.years[yi])
    yi++
  }
  if (yi >= cal.years.length) return Infinity
  return absOfPoint(cal, yi, month, p.day - 1, p.minutes)
}

// Time between two dated scenes, counted on the story's own calendar.
// { minutes (signed), backwards, parts: { years, months, days, hours, mins }, text }
export function gapBetween(cal, ta, tb) {
  const a0 = whenParts(cal, ta)
  const b0 = whenParts(cal, tb)
  if (!a0 || !b0) return null
  const absA = absMinutes(cal, ta)
  const absB = absMinutes(cal, tb)
  const backwards = absB < absA
  const [a, endAbs] = backwards ? [b0, absA] : [a0, absB]
  let years = 0
  while (shiftPoint(cal, a, years + 1, 0) <= endAbs) years++
  let months = 0
  while (shiftPoint(cal, a, years, months + 1) <= endAbs) months++
  const base = years || months ? shiftPoint(cal, a, years, months) : Math.min(absA, absB)
  const rest = Math.max(0, endAbs - base)
  const days = Math.floor(rest / MIN_PER_DAY)
  const hours = Math.floor((rest % MIN_PER_DAY) / 60)
  const mins = rest % 60
  const parts = { years, months, days, hours, mins }
  return { minutes: absB - absA, backwards, parts, text: formatGap(parts, backwards) }
}

export function formatGap(parts, backwards = false) {
  const bits = []
  if (parts.years) bits.push(parts.years + (parts.years === 1 ? ' yr' : ' yrs'))
  if (parts.months) bits.push(parts.months + ' mo')
  if (parts.days) bits.push(parts.days + ' d')
  if (parts.hours) bits.push(parts.hours + ' h')
  if (parts.mins) bits.push(parts.mins + ' min')
  if (!bits.length) return 'same moment'
  // Keep labels short: the three biggest units are plenty to read pacing.
  const text = bits.slice(0, 3).join(' ')
  return backwards ? '⟲ back ' + text : '+' + text
}

// "Year 1 · Thaw 3 · 14:30" (time only when one was written).
export function formatWhen(cal, t) {
  const p = whenParts(cal, t)
  if (!p) return 'No date'
  const label =
    (p.year.label || 'Year ' + (p.yearIndex + 1)) + ' · ' + monthName(p.year, p.month) + ' ' + p.day
  if (p.hasTime) return label + ' · ' + formatTime(p.minutes)
  const icon = slotIconOf(t.slot)
  return icon ? label + ' · ' + icon : label
}

// Write a scene's date from the simple Year / Month / Day / Time fields.
// `when` = { yearId, month (0-based), day (1-based), time ('HH:MM' or '') }
// or null to clear the date.
export function setSceneWhen(story, sceneId, when) {
  if (!when) return assignSceneTime(story, sceneId, null)
  const cal = calendarOf(story)
  const year = cal.years.find((y) => y.id === when.yearId) || cal.years[0]
  const month = clampInt(when.month, 0, monthCount(year) - 1)
  const day = clampInt(when.day, 1, dayCount(year))
  const time = parseTime(when.time) != null ? formatTime(parseTime(when.time)) : ''
  const next = {
    ...story,
    // Make sure the calendar actually exists in the story once a date is set.
    timeline: { ...(story.timeline || {}), years: cal.years },
    chapters: story.chapters.map((c) => ({
      ...c,
      scenes: c.scenes.map((s) => {
        if (s.id !== sceneId) return s
        const prev = s.timeline || {}
        return {
          ...s,
          timeline: {
            yearId: year.id,
            day: month * dayCount(year) + (day - 1),
            time,
            // An exact time replaces the old rough time-of-day slot.
            slot: time ? undefined : prev.slot
          }
        }
      })
    }))
  }
  return next
}

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

// Each chapter's time span (first → last dated scene) and the gap from the
// end of one chapter to the start of the next one (in chapter order).
export function chapterSpans(story) {
  const cal = calendarOf(story)
  const spans = story.chapters.map((chapter, ci) => {
    let first = null
    let last = null
    for (const scene of chapter.scenes) {
      const abs = absMinutes(cal, scene.timeline)
      if (abs == null) continue
      if (!first || abs < first.abs) first = { abs, t: scene.timeline }
      if (!last || abs > last.abs) last = { abs, t: scene.timeline }
    }
    return {
      chapter,
      chapterIndex: ci,
      dated: chapter.scenes.filter((s) => absMinutes(cal, s.timeline) != null).length,
      start: first ? first.t : null,
      end: last ? last.t : null,
      duration: first && last ? gapBetween(cal, first.t, last.t) : null,
      gapToNext: null
    }
  })
  for (let i = 0; i < spans.length - 1; i++) {
    const a = spans[i]
    // Gap to the NEXT chapter that has any dated scene.
    const b = spans.slice(i + 1).find((s) => s.start)
    if (a.end && b) {
      a.gapToNext = { toIndex: b.chapterIndex, gap: gapBetween(cal, a.end, b.start) }
    }
  }
  return spans
}

// ---------- flow layout (time order, even spacing) ----------

export const FLOW_CARD_W = 168
export const FLOW_CARD_H = 76
export const FLOW_COL = 236 // card + room for the wire and its gap label
export const FLOW_PAD_X = 70
export const FLOW_TRACK_Y = 250 // room above the track for arcing wires
export const FLOW_UNDATED_GAP = 230

export function layoutFlow(story) {
  const cal = calendarOf(story)
  const dated = []
  const undated = []
  story.chapters.forEach((chapter, ci) => {
    chapter.scenes.forEach((scene, si) => {
      const abs = absMinutes(cal, scene.timeline)
      const item = {
        scene,
        chapter,
        chapterIndex: ci,
        sceneIndex: si,
        num: ci + 1 + '.' + (si + 1),
        abs
      }
      if (abs == null) undated.push(item)
      else dated.push(item)
    })
  })
  dated.sort(
    (a, b) => a.abs - b.abs || a.chapterIndex - b.chapterIndex || a.sceneIndex - b.sceneIndex
  )

  const cards = []
  dated.forEach((item, i) => {
    cards.push({
      ...item,
      dated: true,
      order: i,
      x: FLOW_PAD_X + i * FLOW_COL,
      y: FLOW_TRACK_Y,
      w: FLOW_CARD_W,
      h: FLOW_CARD_H
    })
  })
  const trackW = Math.max(1, dated.length) * FLOW_COL + FLOW_PAD_X * 2
  const undatedY = FLOW_TRACK_Y + FLOW_CARD_H + FLOW_UNDATED_GAP
  const perRow = Math.max(4, Math.floor((Math.max(trackW, 1200) - FLOW_PAD_X * 2) / FLOW_COL))
  undated.forEach((item, k) => {
    cards.push({
      ...item,
      dated: false,
      order: -1,
      x: FLOW_PAD_X + (k % perRow) * FLOW_COL,
      y: undatedY + 40 + Math.floor(k / perRow) * (FLOW_CARD_H + 40),
      w: FLOW_CARD_W,
      h: FLOW_CARD_H
    })
  })

  // Chapter bands: runs of consecutive (in time) cards from the same chapter.
  const bands = []
  cards
    .filter((c) => c.dated)
    .forEach((c) => {
      const last = bands[bands.length - 1]
      if (last && last.chapterIndex === c.chapterIndex) {
        last.x2 = c.x + c.w
        last.count++
      } else {
        bands.push({
          chapterIndex: c.chapterIndex,
          chapter: c.chapter,
          x1: c.x,
          x2: c.x + c.w,
          count: 1
        })
      }
    })

  // Gaps between neighbours on the track (even without a wire).
  const datedCards = cards.filter((c) => c.dated)
  const neighbourGaps = []
  for (let i = 0; i < datedCards.length - 1; i++) {
    const a = datedCards[i]
    const b = datedCards[i + 1]
    neighbourGaps.push({
      key: a.scene.id + '>' + b.scene.id,
      x: (a.x + a.w + b.x) / 2,
      y: FLOW_TRACK_Y + FLOW_CARD_H + 26,
      gap: gapBetween(cal, a.scene.timeline, b.scene.timeline)
    })
  }

  const undatedRows = Math.max(1, Math.ceil(undated.length / perRow))
  const width = Math.max(trackW, 1200)
  const height = undatedY + 40 + undatedRows * (FLOW_CARD_H + 40) + 40
  const cardById = new Map(cards.map((c) => [c.scene.id, c]))
  return {
    cal,
    cards,
    cardById,
    bands,
    neighbourGaps,
    width,
    height,
    undatedY,
    datedCount: dated.length
  }
}

export function boundsOfFlow(story) {
  const lay = layoutFlow(story)
  return { x: 0, y: 40, w: lay.width, h: lay.height }
}

// Port positions on a flow card: positive on the LEFT edge, negative on the
// RIGHT edge, both vertically centred — the exact centre of each dot.
export function flowPort(card, pole) {
  return {
    x: pole === 'neg' ? card.x + card.w : card.x,
    y: card.y + card.h / 2
  }
}

// Wire path between two flow cards. Next-door neighbours get a gentle S;
// wires that skip over cards arc ABOVE the track; flashbacks (pointing back
// in time) arc BELOW it, so they never run through the cards in between.
export function flowWirePath(from, to) {
  const dx = to.x - from.x
  const forward = dx > 0
  const span = Math.abs(dx)
  const handle = Math.max(40, Math.min(140, span * 0.35))
  if (forward && span <= FLOW_COL) {
    const c1 = { x: from.x + handle, y: from.y }
    const c2 = { x: to.x - handle, y: to.y }
    return { d: cubic(from, c1, c2, to), c1, c2 }
  }
  const lift = Math.min(190, 60 + span * 0.12)
  const dir = forward ? -1 : 1 // above for forward skips, below for flashbacks
  const c1 = { x: from.x + handle, y: from.y + dir * lift }
  const c2 = { x: to.x - handle, y: to.y + dir * lift }
  return { d: cubic(from, c1, c2, to), c1, c2 }
}

function cubic(a, c1, c2, b) {
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

export function cubicPoint(a, c1, c2, b, t = 0.5) {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
  }
}

// One-click: wire every dated scene to the next one in time order (skips
// pairs that are already wired).
export function autoConnectTimeOrder(story) {
  const lay = layoutFlow(story)
  const dated = lay.cards.filter((c) => c.dated)
  let next = story
  for (let i = 0; i < dated.length - 1; i++) {
    next = addTimelineLink(next, dated[i].scene.id, dated[i + 1].scene.id)
  }
  return next
}

// ---------- Timeline wire tools (the W menu on the Timeline) ----------

const tlWithLinks = (story, links) => ({
  ...story,
  timeline: { ...(story.timeline || {}), links }
})

export function removeTimelineLinks(story, ids) {
  const set = new Set(ids)
  if (!set.size) return story
  return tlWithLinks(
    story,
    tlLinks(story).filter((l) => !set.has(l.id))
  )
}

export function removeAllTimelineLinks(story) {
  return tlWithLinks(story, [])
}

export function disconnectSceneTimeline(story, sceneId) {
  return tlWithLinks(
    story,
    tlLinks(story).filter((l) => l.fromSceneId !== sceneId && l.toSceneId !== sceneId)
  )
}

// The scene that comes right after this one in time (dated scenes only).
export function nextInTime(story, sceneId) {
  const dated = layoutFlow(story).cards.filter((c) => c.dated)
  const i = dated.findIndex((c) => c.scene.id === sceneId)
  return i >= 0 && i < dated.length - 1 ? dated[i + 1].scene.id : null
}

// A → C becomes A → B → C.
export function insertIntoTimelineLink(story, linkId, sceneId) {
  const link = tlLinks(story).find((l) => l.id === linkId)
  if (!link || link.fromSceneId === sceneId || link.toSceneId === sceneId) return story
  let next = removeTimelineLinks(story, [linkId])
  next = addTimelineLink(next, link.fromSceneId, sceneId)
  next = addTimelineLink(next, sceneId, link.toSceneId)
  return next
}

// Tidy: drop duplicate wires and wires pointing at scenes that no longer
// exist. Returns { story, removed }.
export function cleanTimelineLinks(story) {
  const ids = new Set(story.chapters.flatMap((c) => c.scenes.map((s) => s.id)))
  const seen = new Set()
  const keep = []
  for (const l of tlLinks(story)) {
    const key = l.fromSceneId + '>' + l.toSceneId
    if (seen.has(key) || !ids.has(l.fromSceneId) || !ids.has(l.toSceneId)) continue
    if (l.fromSceneId === l.toSceneId) continue
    seen.add(key)
    keep.push(l)
  }
  const removed = tlLinks(story).length - keep.length
  return { story: removed ? tlWithLinks(story, keep) : story, removed }
}

// Throw away every timeline wire and wire the dated scenes in time order.
export function rebuildTimeOrder(story) {
  return autoConnectTimeOrder(removeAllTimelineLinks(story))
}

export function removeTimelineLink(story, linkId) {
  return {
    ...story,
    timeline: {
      ...(story.timeline || {}),
      links: (story.timeline?.links || []).filter((l) => l.id !== linkId)
    }
  }
}
