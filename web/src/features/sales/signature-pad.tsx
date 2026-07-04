"use client";

import { useRef, useEffect } from "react";
import { Eraser } from "lucide-react";

type Props = {
  value: string | null;
  onChange: (v: string | null) => void;
  width?: number;
  height?: number;
};

export function SignaturePad({ value, onChange, width = 400, height = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  // Charger signature existante
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      canvasRef.current?.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = value;
    hasDrawn.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: MouseEvent | Touch, rect: DOMRect) => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });

  const startDraw = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const continueDraw = (x: number, y: number) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn.current = true;
  };

  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasDrawn.current) {
      onChange(canvasRef.current?.toDataURL("image/png") ?? null);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-hidden bg-white" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="touch-none cursor-crosshair block"
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            startDraw(e.clientX - rect.left, e.clientY - rect.top);
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            continueDraw(e.clientX - rect.left, e.clientY - rect.top);
          }}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const t = e.touches[0];
            startDraw(t.clientX - rect.left, t.clientY - rect.top);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const t = e.touches[0];
            continueDraw(t.clientX - rect.left, t.clientY - rect.top);
          }}
          onTouchEnd={endDraw}
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Eraser className="size-3" />
        Effacer la signature
      </button>
    </div>
  );
}
