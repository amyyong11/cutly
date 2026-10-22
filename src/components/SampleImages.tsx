"use client";

import { useState } from "react";
import { SAMPLE_IMAGES } from "@/lib/constants";

interface SampleImagesProps {
  onSelect: (file: File) => void;
}

export function SampleImages({ onSelect }: SampleImagesProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (src: string) => {
    setLoading(src);
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const name = src.split("/").pop() ?? "sample.jpg";
      onSelect(new File([blob], name, { type: blob.type || "image/jpeg" }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
      <p className="text-sm text-ink/50 leading-tight text-center sm:text-left">
        No image?
        <br className="hidden sm:block" /> Try one of these:
      </p>
      <div className="flex gap-2">
        {SAMPLE_IMAGES.map(({ src, label }) => (
          <button
            key={src}
            type="button"
            onClick={() => handleSelect(src)}
            disabled={loading !== null}
            aria-label={`Try sample: ${label}`}
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-warm-gray shadow-sm hover:scale-105 hover:shadow-md transition-all disabled:opacity-60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="w-full h-full object-cover" />
            {loading === src && (
              <span className="absolute inset-0 bg-white/50 animate-pulse" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
