"use client";

import { useRef } from "react";

export interface Thumbnail {
  id: string;
  url: string;
  status: "queued" | "processing" | "done" | "error";
}

interface ThumbnailStripProps {
  items: Thumbnail[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (files: File[]) => void;
}

export function ThumbnailStrip({
  items,
  activeId,
  onSelect,
  onRemove,
  onAdd,
}: ThumbnailStripProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2.5 overflow-x-auto py-2 px-1 -mx-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Upload more images"
        className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-warm-gray hover:border-beige hover:bg-beige/10 flex items-center justify-center transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#A68B6A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {items.map((item) => (
        <div key={item.id} className="relative shrink-0 group">
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className={`relative block w-16 h-16 rounded-xl overflow-hidden border transition-all ${
              item.status === "done" ? "checkerboard" : "bg-warm-gray-light"
            } ${
              item.id === activeId
                ? "border-ink ring-2 ring-ink/80 ring-offset-2 ring-offset-ivory"
                : "border-warm-gray hover:border-beige"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt=""
              className={`w-full h-full object-contain ${
                item.status === "done" ? "" : "opacity-50"
              }`}
            />
            {(item.status === "processing" || item.status === "queued") && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`w-5 h-5 rounded-full border-2 border-beige/30 border-t-beige-dark ${
                    item.status === "processing" ? "animate-spin" : ""
                  }`}
                />
              </span>
            )}
            {item.status === "error" && (
              <span className="absolute inset-0 flex items-center justify-center bg-red-50/70">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5m0 4h.01" stroke="#C4756B" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove image"
            className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-ivory flex items-center justify-center ${
              item.id === activeId ? "opacity-100" : "opacity-0"
            } group-hover:opacity-100 focus:opacity-100 transition-opacity`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
