"use client";

import { useCallback, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/constants";
import { getErrorMessage, validateImageFile } from "@/lib/image-utils";

interface UploadAreaProps {
  onUpload: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadArea({ onUpload, disabled }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      let firstError: string | null = null;
      for (const file of files) {
        const validationError = validateImageFile(file);
        if (validationError) {
          firstError ??= getErrorMessage(validationError);
        } else {
          valid.push(file);
        }
      }
      setError(firstError);
      if (valid.length > 0) onUpload(valid);
    },
    [onUpload]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [disabled, handleFiles]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          group relative flex flex-col items-center justify-center
          w-full min-h-[300px] sm:min-h-[340px]
          px-6 py-12
          bg-white/60 backdrop-blur-sm
          border-2 border-dashed rounded-3xl
          cursor-pointer transition-all duration-200
          ${
            isDragging
              ? "border-beige bg-beige/10 scale-[1.01] shadow-lg shadow-beige/20"
              : "border-warm-gray hover:border-beige-light hover:bg-warm-gray-light/50 hover:shadow-md"
          }
          ${disabled ? "opacity-50 pointer-events-none" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          multiple
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div
          className={`flex items-center justify-center w-16 h-16 mb-5 rounded-2xl bg-beige/15 border border-beige/30 transition-transform duration-200 ${
            isDragging ? "scale-110" : "group-hover:scale-105"
          }`}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 16V4M12 4L7 9M12 4l5 5"
              stroke="#A68B6A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="#A68B6A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="text-lg font-medium text-ink mb-1">
          Drop images here
        </p>
        <p className="text-sm text-ink/50 mb-6">
          or click to browse, or paste with{" "}
          <kbd className="px-1.5 py-0.5 text-[11px] font-medium bg-ink/5 border border-ink/10 rounded">
            ⌘V
          </kbd>
        </p>

        <span className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-ink bg-ink/5 border border-ink/10 rounded-full group-hover:bg-beige/20 group-hover:border-beige/40 transition-colors">
          Upload Images
        </span>

        <div className="flex items-center gap-1.5 mt-8">
          {ACCEPTED_EXTENSIONS.map((ext) => (
            <span
              key={ext}
              className="px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink/40 bg-ink/5 rounded-md"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-center text-ink/70 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
}
