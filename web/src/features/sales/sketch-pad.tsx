"use client";

import { useCallback, useEffect, useRef } from "react";
import { Trash2, Undo2 } from "lucide-react";

type Props = {
  value: string | null;
  onChange: (v: string | null) => void;
  width?: number;
  height?: number;
};

/**
 * Page US Letter à 150 dpi — même ratio que l’impression PDF.
 * Assez grand pour un stylet tablette (iPad 11" / équivalent en portrait).
 */
export const SKETCH_PAGE_WIDTH = 1275;
export const SKETCH_PAGE_HEIGHT = 1650;
const MAX_UNDO = 15;

function fillPaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
}

/**
 * Zone de croquis libre (format page lettre) avec historique de traits.
 */
export function SketchPad({
  value,
  onChange,
  width = SKETCH_PAGE_WIDTH,
  height = SKETCH_PAGE_HEIGHT,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const history = useRef<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    fillPaper(ctx, canvas.width, canvas.height);
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current?.getContext("2d");
      if (!c || !canvasRef.current) return;
      fillPaper(c, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      c.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    img.src = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (history.current.length > MAX_UNDO) history.current.shift();
  }, []);

  const exportCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL("image/jpeg", 0.88);
  }, []);

  const startDraw = useCallback((x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    snapshot();
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [snapshot]);

  const continueDraw = useCallback((x: number, y: number) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const endDraw = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(exportCanvas());
  }, [onChange, exportCanvas]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    if (history.current.length === 0) return;
    const prev = history.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasInk = false;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] < 250 || sample[i + 1] < 250 || sample[i + 2] < 250) {
        hasInk = true;
        break;
      }
    }
    onChange(hasInk ? exportCanvas() : null);
  }, [onChange, exportCanvas]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    fillPaper(ctx, canvas.width, canvas.height);
    history.current = [];
    onChange(null);
  }, [onChange]);

  const pos = (el: HTMLCanvasElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    const scaleX = el.width / r.width;
    const scaleY = el.height / r.height;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  };

  return (
    <div className="space-y-2">
      <div
        className="border rounded-lg overflow-hidden bg-white"
        style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="touch-none cursor-crosshair block w-full h-full"
          onMouseDown={(e) => {
            const { x, y } = pos(e.currentTarget, e.clientX, e.clientY);
            startDraw(x, y);
          }}
          onMouseMove={(e) => {
            const { x, y } = pos(e.currentTarget, e.clientX, e.clientY);
            continueDraw(x, y);
          }}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => {
            e.preventDefault();
            const t = e.touches[0];
            const { x, y } = pos(e.currentTarget, t.clientX, t.clientY);
            startDraw(x, y);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const t = e.touches[0];
            const { x, y } = pos(e.currentTarget, t.clientX, t.clientY);
            continueDraw(x, y);
          }}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={undo}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Undo2 className="size-3.5" />
          Annuler dernier trait
        </button>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="size-3.5" />
          Tout effacer
        </button>
      </div>
    </div>
  );
}
