"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A drawn-or-uploaded signature capture. Fixed internal drawing resolution
 * (600x180) scaled to the canvas's rendered CSS size via getBoundingClientRect,
 * so strokes land correctly regardless of viewport width — no library needed.
 */
export function SignaturePad({ onChange, className }: { onChange: (dataUrl: string | null) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [hasContent, setHasContent] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#17201a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasContent(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onChange(null);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        setHasContent(true);
        onChange(canvas.toDataURL("image/png"));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function switchMode(next: "draw" | "upload") {
    setMode(next);
    clear();
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => switchMode("draw")}
          className={cn("font-semibold", mode === "draw" ? "text-brand" : "text-ink-faint hover:text-ink")}
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => switchMode("upload")}
          className={cn("font-semibold", mode === "upload" ? "text-brand" : "text-ink-faint hover:text-ink")}
        >
          Upload image
        </button>
        {hasContent && (
          <button type="button" onClick={clear} className="ml-auto font-semibold text-ink-faint hover:text-critical">
            Clear
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        onPointerDown={mode === "draw" ? start : undefined}
        onPointerMove={mode === "draw" ? move : undefined}
        onPointerUp={mode === "draw" ? end : undefined}
        onPointerLeave={mode === "draw" ? end : undefined}
        className={cn(
          "h-[110px] w-full rounded-lg border border-dashed border-line-strong bg-white",
          mode === "draw" ? "touch-none cursor-crosshair" : "",
        )}
      />
      {mode === "upload" && (
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleUpload}
          className="text-xs text-ink-faint file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunk file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-line"
        />
      )}
      {!hasContent && <p className="text-xs text-ink-faint">{mode === "draw" ? "Sign above with your mouse, stylus, or finger." : "Upload a photo or scan of your signature."}</p>}
    </div>
  );
}
