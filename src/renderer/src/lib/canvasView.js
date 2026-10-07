// Shared pan/zoom engine for the Board and Timeline canvases.
// World coords -> screen coords: screen = world * scale + translate.
import { useEffect, useState } from 'react'

export const WORLD = 40000
export const WORLD_HALF = WORLD / 2
export const MIN_SCALE = 0.12
export const MAX_SCALE = 2.5

export function clampScale(s) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

export function useCanvasView(viewportRef) {
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 0.5 })

  const toWorld = (clientX, clientY) => {
    const rect = viewportRef.current.getBoundingClientRect()
    return {
      x: (clientX - rect.left - view.tx) / view.scale,
      y: (clientY - rect.top - view.ty) / view.scale
    }
  }

  const toScreen = (wx, wy) => ({
    x: wx * view.scale + view.tx,
    y: wy * view.scale + view.ty
  })

  const zoomAt = (factor, cx, cy) => {
    setView((v) => {
      const scale = clampScale(v.scale * factor)
      const tx = cx - ((cx - v.tx) / v.scale) * scale
      const ty = cy - ((cy - v.ty) / v.scale) * scale
      return { tx, ty, scale }
    })
  }

  const zoomBy = (factor) => {
    const rect = viewportRef.current.getBoundingClientRect()
    zoomAt(factor, rect.width / 2, rect.height / 2)
  }

  const panBy = (dx, dy) => setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))

  const fitBounds = (bounds) => {
    const rect = viewportRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const margin = 90
    const w = Math.max(bounds.w, 400)
    const h = Math.max(bounds.h, 300)
    const scale = clampScale(Math.min(rect.width / w, rect.height / h, 1.15))
    const tx = rect.width / 2 - (bounds.x + bounds.w / 2 - margin) * scale
    const ty = rect.height / 2 - (bounds.y + bounds.h / 2 - margin) * scale
    setView({ tx, ty, scale })
  }

  return { view, setView, toWorld, toScreen, zoomAt, zoomBy, panBy, fitBounds }
}

// Attaches a non-passive wheel listener (pan / ctrl-zoom).
// onWheel receives the native WheelEvent; it can call zoomBy/panBy/zoomAt.
export function useWheelZoom(viewportRef, onWheel) {
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const fn = (e) => {
      e.preventDefault()
      onWheel(e)
    }
    el.addEventListener('wheel', fn, { passive: false })
    return () => el.removeEventListener('wheel', fn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Tracks the pixel size of the viewport element in state so popovers can be
// clamped without ever reading the ref during render.
export function useViewportSize(viewportRef) {
  const [size, setSize] = useState({ width: 900, height: 700 })
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize({ width: r.width, height: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return size
}
