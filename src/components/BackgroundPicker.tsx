"use client";

import { useRef } from "react";
import { BACKGROUND_COLORS } from "@/lib/constants";
import type { Background } from "@/lib/compose";

interface BackgroundPickerProps {
  value: Background;
  originalUrl: string;
  onChange: (background: Background) => void;
}

const tileBase =
  "relative w-full aspect-square rounded-xl overflow-hidden border transition-all";

function tileState(active: boolean) {
  return active
    ? "border-ink ring-2 ring-ink/80 ring-offset-2 ring-offset-ivory"
    : "border-warm-gray hover:border-beige hover:scale-105";
}

export function BackgroundPicker({
  value,
  originalUrl,
  onChange,
}: BackgroundPickerProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const customColor =
    value.type === "color" &&
    !BACKGROUND_COLORS.includes(value.color as (typeof BACKGROUND_COLORS)[number])
      ? value.color
      : null;

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        <button
          type="button"
          aria-label="Transparent background"
          title="Transparent"
          onClick={() => onChange({ type: "transparent" })}
          className={`${tileBase} checkerboard ${tileState(value.type === "transparent")}`}
        />
        <button
          type="button"
          aria-label="Blurred background"
          title="Blur"
          onClick={() => onChange({ type: "blur" })}
          className={`${tileBase} ${tileState(value.type === "blur")}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={originalUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-[3px] scale-125"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow">
            Blur
          </span>
        </button>
        <button
          type="button"
          aria-label="Use a photo as background"
          title="Photo"
          onClick={() => photoInputRef.current?.click()}
          className={`${tileBase} bg-white flex items-center justify-center ${tileState(value.type === "image")}`}
        >
          {value.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="#A68B6A" strokeWidth="1.8" />
              <circle cx="9" cy="10" r="2" fill="#A68B6A" />
              <path d="M4 17l5-5 3 3 4-4 4 4" stroke="#A68B6A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Custom color"
          title="Custom color"
          onClick={() => colorInputRef.current?.click()}
          className={`${tileBase} ${tileState(customColor !== null)}`}
          style={{
            background:
              customColor ??
              "conic-gradient(#ff6b6b, #f9e79f, #c8e6c9, #b3e5fc, #c5cae9, #e1bee7, #ff6b6b)",
          }}
        >
          <input
            ref={colorInputRef}
            type="color"
            className="absolute inset-0 opacity-0 pointer-events-none"
            value={customColor ?? "#ffffff"}
            onChange={(e) => onChange({ type: "color", color: e.target.value })}
            tabIndex={-1}
          />
        </button>
        {BACKGROUND_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Background color ${color}`}
            title={color}
            onClick={() => onChange({ type: "color", color })}
            className={`${tileBase} ${tileState(value.type === "color" && value.color === color)}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange({ type: "image", url: URL.createObjectURL(file) });
          e.target.value = "";
        }}
      />
    </div>
  );
}
