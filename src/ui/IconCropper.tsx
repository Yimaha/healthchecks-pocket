import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { initialBox, moveBox, resizeBox, scaleBox, type Box } from '@/core/icons/crop';
import type { DecodedImage } from './imageTools';

/** The uploaded picture with a square crop box on it: drag the box to move
 *  it, drag its corner (or pinch) to resize; or use the arrow keys to move
 *  and +/- to resize. The square becomes the icon. */
export function IconCropper({ image, onSave, onCancel }: {
  image: DecodedImage;
  onSave: (box: Box) => void;
  onCancel: () => void;
}) {
  const { width, height } = image;
  const [box, setBox] = useState<Box>(() => initialBox(width, height));
  const frame = useRef<HTMLDivElement>(null);
  // The decoded picture, drawn as is (no URL: see imageTools).
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    preview.current?.getContext('2d')?.drawImage(image.source, 0, 0);
  }, [image]);
  const [shownWidth, setShownWidth] = useState(300); // the picture's width on screen (px)
  useEffect(() => {
    const frameWidth = frame.current?.clientWidth;
    if (frameWidth) setShownWidth(frameWidth);
  }, []);
  const screenPerImagePixel = shownWidth / width;

  // Pointers on the box: one = move (or resize, from the handle), two = pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const mode = useRef<'move' | 'resize'>('move');
  const pinchDistance = useRef(0);
  const fingerDistance = () => {
    const [first, second] = [...pointers.current.values()];
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const onDown = (event: PointerEvent, how: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    mode.current = how;
    if (pointers.current.size === 2) pinchDistance.current = fingerDistance();
  };
  const onMove = (event: PointerEvent) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const distance = fingerDistance();
      // The ratio is worked out now: the updater runs later, after pinchDistance moves on.
      const factor = pinchDistance.current ? distance / pinchDistance.current : 1;
      setBox((current) => scaleBox(current, factor, width, height));
      pinchDistance.current = distance;
      return;
    }
    const deltaX = (event.clientX - last.x) / screenPerImagePixel;
    const deltaY = (event.clientY - last.y) / screenPerImagePixel;
    const resizing = mode.current === 'resize';
    setBox((current) => resizing
      ? resizeBox(current, Math.max(deltaX, deltaY), width, height)
      : moveBox(current, deltaX, deltaY, width, height));
  };
  const onUp = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = 0;
  };

  // Keyboard: arrows move by 2% of the image (Shift: 10%), +/- resize by 5%.
  const onKey = (event: KeyboardEvent) => {
    const step = Math.max(width, height) * (event.shiftKey ? 0.1 : 0.02);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      const [deltaX, deltaY] = moves[event.key];
      setBox((current) => moveBox(current, deltaX, deltaY, width, height));
    } else if (event.key === '+' || event.key === '=') {
      setBox((current) => scaleBox(current, 1.05, width, height));
    } else if (event.key === '-') {
      setBox((current) => scaleBox(current, 1 / 1.05, width, height));
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <section className="card cropper">
      <p className="desc">Drag the square to choose the icon; drag its corner, or pinch, to resize.</p>
      <div className="crop-frame" ref={frame} style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas className="crop-image" ref={preview} width={width} height={height} role="img" aria-label="Uploaded image" />
        <div
          className="crop-box"
          role="slider"
          tabIndex={0}
          aria-label="Crop area"
          aria-valuemin={Math.min(24, width, height)}
          aria-valuemax={Math.min(width, height)}
          aria-valuenow={Math.round(box.size)}
          aria-valuetext={`${Math.round(box.size)} pixels square`}
          style={{
            left: box.x * screenPerImagePixel,
            top: box.y * screenPerImagePixel,
            width: box.size * screenPerImagePixel,
            height: box.size * screenPerImagePixel,
          }}
          onKeyDown={onKey}
          onPointerDown={(event) => onDown(event, 'move')}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <span
            className="crop-handle"
            aria-label="Resize"
            onPointerDown={(event) => onDown(event, 'resize')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
      </div>
      <div className="tag-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="button" onClick={() => onSave(box)}>Use this icon</button>
      </div>
    </section>
  );
}
