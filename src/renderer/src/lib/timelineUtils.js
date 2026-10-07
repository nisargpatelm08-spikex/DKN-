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
        return {
          ...s,
          timeline: {
            yearId: time.yearId,
            day: time.day,
            slot: time.slot !== undefined ? time.slot : prevSlot
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

export function removeTimelineLink(story, linkId) {
  return {
    ...story,
    timeline: {
      ...(story.timeline || {}),
      links: (story.timeline?.links || []).filter((l) => l.id !== linkId)
    }
  }
}
