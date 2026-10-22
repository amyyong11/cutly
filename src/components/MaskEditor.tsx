"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BRUSH_SIZES } from "@/lib/constants";
import { loadImage } from "@/lib/image-utils";
import { SmartSelect, type SelectPoint } from "@/lib/smart-select";

type Tool = "keep" | "erase";
type Mode = "smart" | "brush";
type SmartStatus = "loading" | "ready" | "error";

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8];
const MAX_HISTORY = 30;
const HOVER_DELAY_MS = 120;
const MAX_STROKE_POINTS = 8;

interface MaskEditorProps {
  originalUrl: string;
  processedUrl: string;
  onDone: (editedBlob: Blob) => void;
  onCancel: () => void;
}

export function MaskEditor({
  originalUrl,
  processedUrl,
  onDone,
  onCancel,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const originalDataRef = useRef<ImageData | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const smartRef = useRef<SmartSelect | null>(null);
  const originalSizeRef = useRef<{ width: number; height: number }>({
    width: 1,
    height: 1,
  });
  const strokeRef = useRef<{ x: number; y: number }[]>([]);
  const hoverRef = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    abort?: AbortController;
    point?: { x: number; y: number };
    mask?: Uint8ClampedArray;
  }>({});

  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);

  const [tool, setTool] = useState<Tool>("erase");
  const [mode, setMode] = useState<Mode>("smart");
  const [smartStatus, setSmartStatus] = useState<SmartStatus>("loading");
  const [smartBusy, setSmartBusy] = useState(false);
  const [brushSize, setBrushSize] = useState<number>(36);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [fitSize, setFitSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const updateHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(snapshot);
    // Always keep the initial state so "Reset" works.
    if (history.length > MAX_HISTORY) history.splice(1, 1);
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    updateHistoryState();
  }, [updateHistoryState]);

  const restoreSnapshot = useCallback(
    (index: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      const snapshot = historyRef.current[index];
      if (!ctx || !snapshot) return;

      ctx.putImageData(snapshot, 0, 0);
      historyIndexRef.current = index;
      updateHistoryState();
    },
    [updateHistoryState]
  );

  // Paints a segment from the previous pointer position so fast strokes
  // stay continuous; only the segment's bounding box is read and written.
  const applyBrush = useCallback(
    (x: number, y: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      const orig = originalDataRef.current?.data;
      if (!canvas || !ctx || !orig) return;

      // Brush size is in screen pixels, so it feels the same at any zoom.
      const rect = canvas.getBoundingClientRect();
      const radius = (brushSize / 2) * (canvas.width / rect.width);
      const from = lastPointRef.current ?? { x, y };
      lastPointRef.current = { x, y };

      const minX = Math.max(0, Math.floor(Math.min(from.x, x) - radius));
      const maxX = Math.min(
        canvas.width - 1,
        Math.ceil(Math.max(from.x, x) + radius)
      );
      const minY = Math.max(0, Math.floor(Math.min(from.y, y) - radius));
      const maxY = Math.min(
        canvas.height - 1,
        Math.ceil(Math.max(from.y, y) + radius)
      );
      if (minX > maxX || minY > maxY) return;

      const regionW = maxX - minX + 1;
      const regionH = maxY - minY + 1;
      const region = ctx.getImageData(minX, minY, regionW, regionH);
      const data = region.data;

      const segX = x - from.x;
      const segY = y - from.y;
      const segLenSq = segX * segX + segY * segY;

      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          // Distance from pixel to the stroke segment.
          let t =
            segLenSq > 0
              ? ((px - from.x) * segX + (py - from.y) * segY) / segLenSq
              : 0;
          t = Math.max(0, Math.min(1, t));
          const dx = px - (from.x + t * segX);
          const dy = py - (from.y + t * segY);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;

          const falloff = 1 - dist / radius;
          const strength = Math.min(1, falloff * 2.5);

          const idx = ((py - minY) * regionW + (px - minX)) * 4;
          if (tool === "erase") {
            data[idx + 3] = Math.round(data[idx + 3] * (1 - strength));
          } else {
            const oi = (py * canvas.width + px) * 4;
            const target = Math.round(
              data[idx + 3] + (255 - data[idx + 3]) * strength
            );
            // Blend toward the original color only as much as alpha grows,
            // so already-opaque, color-corrected edges stay untouched.
            if (target > data[idx + 3]) {
              const mix = (target - data[idx + 3]) / Math.max(1, target);
              data[idx] = Math.round(data[idx] + (orig[oi] - data[idx]) * mix);
              data[idx + 1] = Math.round(
                data[idx + 1] + (orig[oi + 1] - data[idx + 1]) * mix
              );
              data[idx + 2] = Math.round(
                data[idx + 2] + (orig[oi + 2] - data[idx + 2]) * mix
              );
              data[idx + 3] = target;
            }
          }
        }
      }

      ctx.putImageData(region, minX, minY);
    },
    [tool, brushSize]
  );

  // Erases (or restores) the selected part. The mask is soft at its edges,
  // so it scales the effect rather than switching pixels fully on or off.
  const applyMask = useCallback(
    (mask: Uint8ClampedArray) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      const orig = originalDataRef.current?.data;
      if (!canvas || !ctx || !orig) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < mask.length; i++) {
        const m = mask[i] / 255;
        if (m < 0.02) continue;
        const idx = i * 4;
        if (tool === "erase") {
          data[idx + 3] = Math.round(data[idx + 3] * (1 - m));
        } else {
          const target = Math.round(data[idx + 3] + (255 - data[idx + 3]) * m);
          if (target > data[idx + 3]) {
            const mix = (target - data[idx + 3]) / Math.max(1, target);
            data[idx] = Math.round(data[idx] + (orig[idx] - data[idx]) * mix);
            data[idx + 1] = Math.round(
              data[idx + 1] + (orig[idx + 1] - data[idx + 1]) * mix
            );
            data[idx + 2] = Math.round(
              data[idx + 2] + (orig[idx + 2] - data[idx + 2]) * mix
            );
            data[idx + 3] = target;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    },
    [tool]
  );

  // Tints the part that a click would change: red for what would be erased,
  // green for what would be restored.
  const drawPreview = useCallback(
    (mask: Uint8ClampedArray | null) => {
      const preview = previewRef.current;
      const canvas = canvasRef.current;
      const pctx = preview?.getContext("2d");
      if (!preview || !canvas || !pctx) return;
      if (preview.width !== canvas.width || preview.height !== canvas.height) {
        preview.width = canvas.width;
        preview.height = canvas.height;
      }
      pctx.clearRect(0, 0, preview.width, preview.height);
      if (!mask) return;

      const current = canvas
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const tint = pctx.createImageData(preview.width, preview.height);
      const out = tint.data;
      const [r, g, b] = tool === "erase" ? [239, 68, 68] : [16, 185, 129];
      for (let i = 0; i < mask.length; i++) {
        const visible = current[i * 4 + 3] / 255;
        const affected =
          (mask[i] / 255) * (tool === "erase" ? visible : 1 - visible);
        if (affected < 0.02) continue;
        out[i * 4] = r;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = b;
        out[i * 4 + 3] = Math.round(affected * 140);
      }
      pctx.putImageData(tint, 0, 0);
    },
    [tool]
  );

  const clearHover = useCallback(() => {
    const hover = hoverRef.current;
    clearTimeout(hover.timer);
    hover.abort?.abort();
    hoverRef.current = {};
    drawPreview(null);
  }, [drawPreview]);

  const requestMask = useCallback(
    (points: { x: number; y: number }[], signal?: AbortSignal) => {
      const smart = smartRef.current;
      const canvas = canvasRef.current;
      if (!smart || !canvas) return Promise.reject(new Error("Not ready"));
      // Canvas pixels -> original image pixels (they can differ if a hosted
      // provider returned a resized cutout).
      const { width, height } = originalSizeRef.current;
      const selectPoints: SelectPoint[] = points.map((p) => ({
        x: (p.x * width) / canvas.width,
        y: (p.y * height) / canvas.height,
        label: 1,
      }));
      return smart.maskAt(selectPoints, canvas.width, canvas.height, signal);
    },
    []
  );

  // Prepares (or re-prepares, after a failure) smart select. Brush mode
  // never depends on it, and Smart stays selectable even if this fails.
  const prepareSmart = useCallback(() => {
    const smart = SmartSelect.for(originalUrl);
    smartRef.current = smart;
    setSmartStatus("loading");
    let cancelled = false;
    smart.ready().then(
      () => !cancelled && setSmartStatus("ready"),
      () => !cancelled && setSmartStatus("error")
    );
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  useEffect(() => prepareSmart(), [prepareSmart]);

  const selectMode = useCallback(
    (value: Mode) => {
      setMode(value);
      if (value === "smart" && smartStatus === "error") prepareSmart();
    },
    [smartStatus, prepareSmart]
  );

  // The tint depends on the tool, so a stale preview must not linger.
  useEffect(() => {
    clearHover();
  }, [tool, mode, clearHover]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadImage(processedUrl), loadImage(originalUrl)]).then(
      ([processed, original]) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (cancelled || !canvas || !ctx) return;

        const width = processed.naturalWidth;
        const height = processed.naturalHeight;
        canvas.width = width;
        canvas.height = height;

        const origCanvas = document.createElement("canvas");
        origCanvas.width = width;
        origCanvas.height = height;
        const origCtx = origCanvas.getContext("2d")!;
        origCtx.drawImage(original, 0, 0, width, height);
        originalDataRef.current = origCtx.getImageData(0, 0, width, height);
        originalSizeRef.current = {
          width: original.naturalWidth,
          height: original.naturalHeight,
        };

        ctx.drawImage(processed, 0, 0);

        historyRef.current = [];
        historyIndexRef.current = -1;
        saveSnapshot();
        setReady(true);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [processedUrl, originalUrl, saveSnapshot]);

  // Size the canvas to fit the viewport at 100% zoom.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!ready || !viewport || !canvas) return;

    const measure = () => {
      const padding = 32;
      const scale = Math.min(
        (viewport.clientWidth - padding) / canvas.width,
        (viewport.clientHeight - padding) / canvas.height,
        1
      );
      setFitSize({
        width: canvas.width * scale,
        height: canvas.height * scale,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [ready]);

  const zoom = ZOOM_LEVELS[zoomIndex];

  const changeZoom = useCallback((delta: number) => {
    setZoomIndex((i) =>
      Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + delta))
    );
  }, []);

  // Registered natively: React's wheel listener is passive, and ⌘/pinch
  // zoom must preventDefault to stop the browser zooming the whole page.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      changeZoom(e.deltaY < 0 ? 1 : -1);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [changeZoom]);

  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const updateCursor = useCallback(
    (clientX: number, clientY: number, visible: boolean) => {
      const cursor = cursorRef.current;
      if (!cursor) return;

      if (!visible || mode === "smart") {
        cursor.style.opacity = "0";
        return;
      }

      const displaySize = brushSize;
      cursor.style.opacity = "1";
      cursor.style.width = `${displaySize}px`;
      cursor.style.height = `${displaySize}px`;
      cursor.style.left = `${clientX - displaySize / 2}px`;
      cursor.style.top = `${clientY - displaySize / 2}px`;
    },
    [brushSize, mode]
  );

  const scheduleHover = useCallback(
    (point: { x: number; y: number }) => {
      if (smartStatus !== "ready") return;
      const hover = hoverRef.current;
      clearTimeout(hover.timer);
      hover.timer = setTimeout(() => {
        hover.abort?.abort();
        const abort = new AbortController();
        hover.abort = abort;
        requestMask([point], abort.signal)
          .then((mask) => {
            if (abort.signal.aborted) return;
            hover.point = point;
            hover.mask = mask;
            drawPreview(mask);
          })
          .catch(() => {});
      }, HOVER_DELAY_MS);
    },
    [smartStatus, requestMask, drawPreview]
  );

  const applySmartStroke = useCallback(async () => {
    const stroke = strokeRef.current;
    strokeRef.current = [];
    const canvas = canvasRef.current;
    if (stroke.length === 0 || !canvas) return;

    // A tap on the spot already previewed can reuse that mask instantly.
    // Tap tolerance is ~6 screen pixels, converted to canvas pixels.
    const tolerance = 6 * (canvas.width / canvas.getBoundingClientRect().width);
    const hover = hoverRef.current;
    const first = stroke[0];
    const isTap = stroke.every(
      (p) => Math.hypot(p.x - first.x, p.y - first.y) < tolerance
    );
    const reusable =
      isTap &&
      hover.mask &&
      hover.point &&
      Math.hypot(hover.point.x - first.x, hover.point.y - first.y) < tolerance;

    let mask: Uint8ClampedArray;
    clearTimeout(hover.timer);
    if (reusable) {
      mask = hover.mask!;
    } else {
      const step = Math.max(1, Math.ceil(stroke.length / MAX_STROKE_POINTS));
      const points = isTap ? [first] : stroke.filter((_, i) => i % step === 0);
      // If the image is still being prepared, this waits for it rather
      // than dropping the click.
      setSmartBusy(true);
      try {
        mask = await requestMask(points);
        setSmartStatus("ready");
      } catch {
        setSmartStatus("error");
        return;
      } finally {
        setSmartBusy(false);
      }
    }

    clearHover();
    applyMask(mask);
    saveSnapshot();
  }, [requestMask, clearHover, applyMask, saveSnapshot]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!ready || e.button !== 0) return;
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      lastPointRef.current = null;
      const point = getCanvasCoords(e.clientX, e.clientY);
      if (mode === "smart") {
        strokeRef.current = [point];
        return;
      }
      applyBrush(point.x, point.y);
    },
    [ready, mode, getCanvasCoords, applyBrush]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      updateCursor(e.clientX, e.clientY, true);
      if (!ready) return;
      const point = getCanvasCoords(e.clientX, e.clientY);
      if (mode === "smart") {
        if (isDrawing) strokeRef.current.push(point);
        else if (e.pointerType !== "touch") scheduleHover(point);
        return;
      }
      if (isDrawing) applyBrush(point.x, point.y);
    },
    [
      isDrawing,
      ready,
      mode,
      getCanvasCoords,
      applyBrush,
      updateCursor,
      scheduleHover,
    ]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    if (mode === "smart") {
      applySmartStroke();
    } else {
      saveSnapshot();
    }
  }, [isDrawing, mode, saveSnapshot, applySmartStroke]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0)
      restoreSnapshot(historyIndexRef.current - 1);
  }, [restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      restoreSnapshot(historyIndexRef.current + 1);
    }
  }, [restoreSnapshot]);

  const handleReset = () => {
    restoreSnapshot(0);
    // Reset is itself undoable.
    saveSnapshot();
  };

  const handleDone = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onDone(blob);
    }, "image/png");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "[" || e.key === "]") {
        setBrushSize((size) => {
          const i = BRUSH_SIZES.indexOf(size as (typeof BRUSH_SIZES)[number]);
          const next = Math.max(
            0,
            Math.min(BRUSH_SIZES.length - 1, i + (e.key === "]" ? 1 : -1))
          );
          return BRUSH_SIZES[next];
        });
      } else if (e.key === "e") {
        setTool("erase");
      } else if (e.key === "r") {
        setTool("keep");
      } else if (e.key === "s") {
        selectMode("smart");
      } else if (e.key === "b") {
        selectMode("brush");
      } else if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo, onCancel, selectMode]);

  const toolButton = (value: Tool, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      title={`${label} (${hint})`}
      className={`min-h-[44px] px-5 py-2 text-sm rounded-full border transition-colors ${
        tool === value
          ? "bg-ink border-ink text-ivory"
          : "border-warm-gray text-ink/60 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-ivory flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-warm-gray shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-ink/60 hover:text-ink transition-colors min-h-[44px] px-2"
        >
          Cancel
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="min-h-[40px] px-3 text-sm text-ink/60 hover:text-ink disabled:opacity-30 transition-colors"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
            className="min-h-[40px] px-3 text-sm text-ink/60 hover:text-ink disabled:opacity-30 transition-colors"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!canUndo}
            className="min-h-[40px] px-3 text-sm text-ink/60 hover:text-ink disabled:opacity-30 transition-colors"
          >
            Reset
          </button>
        </div>
        <button
          type="button"
          onClick={handleDone}
          className="min-h-[40px] px-5 text-sm font-medium text-ivory bg-ink rounded-full hover:bg-ink/90 transition-colors"
        >
          Done
        </button>
      </header>

      <div
        ref={viewportRef}
        className="flex-1 relative overflow-auto flex bg-warm-gray-light"
      >
        <div
          className="relative m-auto shrink-0 checkerboard shadow-lg"
          style={
            fitSize
              ? { width: fitSize.width * zoom, height: fitSize.height * zoom }
              : { visibility: "hidden" }
          }
        >
          {tool === "keep" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={originalUrl}
              alt=""
              className="absolute inset-0 w-full h-full opacity-25 pointer-events-none"
            />
          )}
          <canvas
            ref={canvasRef}
            className={`relative block w-full h-full touch-none ${
              mode === "smart"
                ? smartBusy
                  ? "cursor-wait"
                  : "cursor-crosshair"
                : "cursor-none"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={(e) => {
              if (mode === "brush") handlePointerUp();
              else if (!isDrawing) clearHover();
              updateCursor(e.clientX, e.clientY, false);
            }}
          />
          <canvas
            ref={previewRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        </div>
        <div
          ref={cursorRef}
          className={`fixed pointer-events-none rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.3)] ${
            tool === "erase"
              ? "border-white/90 bg-red-400/15"
              : "border-white/90 bg-emerald-400/15"
          }`}
          style={{ opacity: 0 }}
        />
        {ready &&
          mode === "smart" &&
          (smartStatus === "loading" || smartBusy) && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-2 rounded-full bg-ink/80 text-ivory text-xs font-medium shadow-lg pointer-events-none">
              <span className="w-3 h-3 rounded-full border-2 border-ivory/30 border-t-ivory animate-spin" />
              {smartStatus === "loading"
                ? "Preparing smart select…"
                : "Selecting…"}
            </div>
          )}
        {ready && mode === "smart" && smartStatus === "error" && !smartBusy && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-ink/85 text-ivory text-xs font-medium shadow-lg">
            Smart select couldn&apos;t load.
            <button
              type="button"
              onClick={prepareSmart}
              className="px-3 py-1 rounded-full bg-ivory text-ink hover:bg-ivory/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-6 h-6 rounded-full border-2 border-beige/30 border-t-beige-dark animate-spin" />
          </div>
        )}
      </div>

      <footer className="border-t border-warm-gray px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <div className="inline-flex rounded-full border border-warm-gray bg-white/60 p-1">
            {(
              [
                ["smart", "Smart", "S"],
                ["brush", "Brush", "B"],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectMode(value)}
                title={`${label} (${hint})`}
                className={`min-h-[36px] px-4 text-sm font-medium rounded-full transition-colors ${
                  mode === value
                    ? "bg-beige/25 text-ink"
                    : "text-ink/50 hover:text-ink/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {toolButton("erase", "Erase", "E")}
            {toolButton("keep", "Restore", "R")}
          </div>

          {mode === "smart" ? (
            <p className="text-sm text-ink/50 min-w-[220px] text-center">
              {tool === "erase"
                ? "Click a part to erase it, or drag across it"
                : "Click a part to bring it back, or drag across it"}
            </p>
          ) : (
            <div
              className="flex items-center gap-1.5"
              title="Brush size ([ / ])"
            >
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBrushSize(size)}
                  className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors ${
                    brushSize === size
                      ? "bg-beige/20 border-beige"
                      : "border-transparent hover:border-warm-gray"
                  }`}
                  aria-label={`Brush size ${size}`}
                >
                  <span
                    className="rounded-full bg-ink/50"
                    style={{
                      width: Math.max(4, Math.min(24, size / 6)),
                      height: Math.max(4, Math.min(24, size / 6)),
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1" title="Zoom (⌘ + scroll)">
            <button
              type="button"
              onClick={() => changeZoom(-1)}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
              className="w-10 h-10 rounded-full text-lg text-ink/60 hover:text-ink disabled:opacity-30"
            >
              −
            </button>
            <span className="w-12 text-center text-sm tabular-nums text-ink/60">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => changeZoom(1)}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="Zoom in"
              className="w-10 h-10 rounded-full text-lg text-ink/60 hover:text-ink disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
