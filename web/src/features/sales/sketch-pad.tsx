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
 * Zone de croquis libre avec historique de traits.
 * Chaque levée de stylo = 1 trait → Annuler dernier trait restaure l'état avant ce trait.
 */
export function SketchPad({ value, onChange, width = 640, height = 280 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /** Snapshots avant chaque trait — permet l'undo stroke-by-stroke */
  const history = useRef<ImageData[]>([]);

  // Charger un dessin existant au montage
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      ctx?.drawImage(img, 0, 0);
    };
    img.src = value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }, []);

  const startDraw = useCallback((x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    snapshot(); // sauvegarder avant ce trait
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
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
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }, [onChange]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    if (history.current.length === 0) return;
    const prev = history.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    // Toujours exporter l'état du canvas (jamais forcer null tant qu'il y a des pixels)
    const data = canvas.toDataURL("image/png");
    // ImageData vide = canvas transparent → détecter via pixel alpha
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasInk = false;
    for (let i = 3; i < sample.length; i += 4) {
      if (sample[i] !== 0) { hasInk = true; break; }
    }
    onChange(hasInk ? data : null);
  }, [onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history.current = [];
    onChange(null);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div
        className="border rounded-lg overflow-hidden bg-white"
        style={{ width: "100%", maxWidth: width }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="touch-none cursor-crosshair block w-full"
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const scale = e.currentTarget.width / r.width;
            startDraw((e.clientX - r.left) * scale, (e.clientY - r.top) * scale);
          }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const scale = e.currentTarget.width / r.width;
            continueDraw((e.clientX - r.left) * scale, (e.clientY - r.top) * scale);
          }}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const scale = e.currentTarget.width / r.width;
            const t = e.touches[0];
            startDraw((t.clientX - r.left) * scale, (t.clientY - r.top) * scale);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const scale = e.currentTarget.width / r.width;
            const t = e.touches[0];
            continueDraw((t.clientX - r.left) * scale, (t.clientY - r.top) * scale);
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
