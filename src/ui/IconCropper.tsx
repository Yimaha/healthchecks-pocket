import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { initialBox, moveBox, resizeBox, scaleBox, type Box } from '../core/crop'
import type { DecodedImage } from './imageTools'

/** The uploaded picture with a square crop box on it: drag the box to move
 *  it, drag its corner (or pinch) to resize. The square becomes the icon. */
export function IconCropper({ image, onSave, onCancel }: {
  image: DecodedImage
  onSave: (box: Box) => void
  onCancel: () => void
}) {
  const { width, height } = image
  const [box, setBox] = useState<Box>(() => initialBox(width, height))
  const frame = useRef<HTMLDivElement>(null)
  // The decoded picture, drawn as is (no URL: see imageTools).
  const preview = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    preview.current?.getContext('2d')?.drawImage(image.source, 0, 0)
  }, [image])
  const [shown, setShown] = useState(300) // displayed width of the picture (px)
  useEffect(() => {
    const w = frame.current?.clientWidth
    if (w) setShown(w)
  }, [])
  const scale = shown / width // screen px per image px

  // Pointers on the box: one = move (or resize, from the handle), two = pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const mode = useRef<'move' | 'resize'>('move')
  const pinch = useRef<number>(0)
  const spread = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const down = (e: PointerEvent, how: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    mode.current = how
    if (pointers.current.size === 2) pinch.current = spread()
  }
  const move = (e: PointerEvent) => {
    const last = pointers.current.get(e.pointerId)
    if (!last) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const now = spread()
      // The ratio is worked out now: the updater runs later, after pinch.current moves on.
      const factor = pinch.current ? now / pinch.current : 1
      setBox((b) => scaleBox(b, factor, width, height))
      pinch.current = now
      return
    }
    const dx = (e.clientX - last.x) / scale
    const dy = (e.clientY - last.y) / scale
    const resizing = mode.current === 'resize'
    setBox((b) => resizing ? resizeBox(b, Math.max(dx, dy), width, height) : moveBox(b, dx, dy, width, height))
  }
  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    pinch.current = 0
  }

  return (
    <section className="card cropper">
      <p className="desc">Drag the square to choose the icon; drag its corner, or pinch, to resize.</p>
      <div className="crop-frame" ref={frame} style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas className="crop-image" ref={preview} width={width} height={height} role="img" aria-label="Uploaded image" />
        <div
          className="crop-box"
          role="slider"
          aria-label="Crop area"
          aria-valuetext={`${Math.round(box.size)} pixels square`}
          style={{ left: box.x * scale, top: box.y * scale, width: box.size * scale, height: box.size * scale }}
          onPointerDown={(e) => down(e, 'move')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <span
            className="crop-handle"
            aria-label="Resize"
            onPointerDown={(e) => down(e, 'resize')}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
      </div>
      <div className="tag-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="button" onClick={() => onSave(box)}>Use this icon</button>
      </div>
    </section>
  )
}
