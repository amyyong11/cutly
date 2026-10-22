"use client";

import { useCallback, useRef, useState } from "react";

interface BeforeAfterProps {
  originalUrl: string;
  processedUrl: string;
  transparent: boolean;
  alt?: string;
}

export function BeforeAfter({
  originalUrl,
  processedUrl,
  transparent,
  alt = "Processed image",
}: BeforeAfterProps) {
  const [comparing, setComparing] = useState(false);
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-full border border-warm-gray bg-white/60 backdrop-blur-sm p-1 shadow-sm">
          {(
            [
              [false, "Result"],
              [true, "Compare"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setComparing(value);
                setPosition(50);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                comparing === value
                  ? "bg-ink text-ivory shadow-sm"
                  : "text-ink/50 hover:text-ink/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          ref={containerRef}
          className={`relative max-w-full overflow-hidden rounded-2xl border border-warm-gray shadow-lg shadow-ink/5 select-none ${
            transparent ? "checkerboard" : "bg-warm-gray-light"
          } ${comparing ? "cursor-ew-resize touch-none" : ""}`}
          onPointerDown={(e) => {
            if (!comparing) return;
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            moveTo(e.clientX);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) moveTo(e.clientX);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={processedUrl}
            alt={alt}
            draggable={false}
            className="block max-w-full w-auto h-auto max-h-[60vh] animate-fade-in"
          />

          {comparing && (
            <>
              <div
                className="absolute inset-0 bg-warm-gray-light"
                style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={originalUrl}
                  alt="Original"
                  draggable={false}
                  className="block w-full h-full object-contain"
                />
              </div>
              <div
                className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)] pointer-events-none"
                style={{ left: `${position}%`, transform: "translateX(-50%)" }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 6l-6 6 6 6M15 6l6 6-6 6"
                      stroke="#1A1A1A"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <span className="absolute top-3 left-3 px-2 py-0.5 text-[11px] font-medium text-white bg-ink/60 rounded-md pointer-events-none">
                Before
              </span>
              <span className="absolute top-3 right-3 px-2 py-0.5 text-[11px] font-medium text-white bg-ink/60 rounded-md pointer-events-none">
                After
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
