import { useEffect, useRef, useState } from 'react'

const W = 900
const H = 580

const COLORS = ['#1a1710', '#b5651d', '#23456e', '#7a2e22', '#2e6e4e', '#ffffff']
const SIZES = [2, 5, 9]

function DrawingPad({ image, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)
  const [color, setColor] = useState('#1a1710')
  const [size, setSize] = useState(4)
  const [eraser, setEraser] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctxRef.current = ctx
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    if (image) {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(W / img.width, H / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
      }
      img.src = image
    }
  }, [image])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H
    }
  }

  const start = (e) => {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = getPos(e)
    e.target.setPointerCapture?.(e.pointerId)
  }

  const move = (e) => {
    if (!drawingRef.current) return
    const ctx = ctxRef.current
    const p = getPos(e)
    ctx.strokeStyle = eraser ? '#ffffff' : color
    ctx.lineWidth = eraser ? size * 3 : size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }

  const end = () => {
    drawingRef.current = false
  }

  const clear = () => {
    const ctx = ctxRef.current
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    if (image) {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(W / img.width, H / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
      }
      img.src = image
    }
  }

  const save = () => {
    const ctx = ctxRef.current
    ctx.globalCompositeOperation = 'source-over'
    onSave(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div className="drawing-modal">
      <div className="drawing-panel">
        <div className="drawing-title">Draw on your frame</div>
        <div className="drawing-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              className={'swatch' + (color === c && !eraser ? ' active' : '')}
              style={{ background: c }}
              title={c}
              onClick={() => {
                setColor(c)
                setEraser(false)
              }}
            />
          ))}
          <span className="tool-sep" />
          {SIZES.map((s) => (
            <button
              key={s}
              className={'size-dot' + (size === s ? ' active' : '')}
              style={{ '--dot': s + 'px' }}
              onClick={() => setSize(s)}
            />
          ))}
          <span className="tool-sep" />
          <button className={'tool-btn' + (eraser ? ' active' : '')} onClick={() => setEraser((v) => !v)}>
            Eraser
          </button>
          <button className="tool-btn" onClick={clear}>
            Clear
          </button>
        </div>
        <canvas
          className="drawing-canvas"
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <div className="drawing-actions">
          <button className="tonal-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="tonal-btn primary" onClick={save}>
            ✓ Save drawing
          </button>
        </div>
      </div>
    </div>
  )
}

export default DrawingPad