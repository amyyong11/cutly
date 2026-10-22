"use client";

import { useEffect, useState } from "react";
import { BeforeAfter } from "./BeforeAfter";
import { BackgroundPicker } from "./BackgroundPicker";
import { MaskEditor } from "./MaskEditor";
import { downloadBlob, loadImage } from "@/lib/image-utils";
import {
  canvasToBlob,
  composite,
  exportImage,
  type Background,
  type ExportFormat,
} from "@/lib/compose";

const PREVIEW_MAX_DIMENSION = 1600;

interface ResultViewerProps {
  originalUrl: string;
  processedUrl: string;
  filename: string;
  background: Background;
  onBackgroundChange: (background: Background) => void;
  onProcessedUpdate: (blob: Blob) => void;
  onEditingChange: (editing: boolean) => void;
}

export function ResultViewer({
  originalUrl,
  processedUrl,
  filename,
  background,
  onBackgroundChange,
  onProcessedUpdate,
  onEditingChange,
}: ResultViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(processedUrl);
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImage(processedUrl).then((img) => {
      if (!cancelled) setDimensions([img.naturalWidth, img.naturalHeight]);
    });
    return () => {
      cancelled = true;
    };
  }, [processedUrl]);

  useEffect(() => {
    if (background.type === "transparent") {
      setPreviewUrl(processedUrl);
      return;
    }

    let cancelled = false;
    let url: string | null = null;
    composite(processedUrl, originalUrl, background, {
      maxDimension: PREVIEW_MAX_DIMENSION,
    })
      .then((canvas) => canvasToBlob(canvas, "jpg"))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [processedUrl, originalUrl, background]);

  const setEditing = (editing: boolean) => {
    setIsEditing(editing);
    onEditingChange(editing);
  };

  const handleDownload = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const blob = await exportImage(processedUrl, originalUrl, background, format);
      downloadBlob(blob, `${filename.replace(/\.[^.]+$/, "")}-cutly.${format}`);
    } finally {
      setExporting(null);
    }
  };

  if (isEditing) {
    return (
      <MaskEditor
        originalUrl={originalUrl}
        processedUrl={processedUrl}
        onDone={(blob) => {
          onProcessedUpdate(blob);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 lg:gap-8 items-start animate-fade-in-up">
      <BeforeAfter
        originalUrl={originalUrl}
        processedUrl={previewUrl}
        transparent={background.type === "transparent"}
      />

      <aside className="lg:mt-[52px] rounded-2xl border border-warm-gray bg-white/70 backdrop-blur-sm p-5 shadow-sm space-y-6">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleDownload("png")}
            disabled={exporting !== null}
            className="w-full min-h-[48px] px-6 py-3 inline-flex items-center justify-center gap-2 text-sm font-medium text-ivory bg-ink rounded-full shadow-sm hover:bg-ink/90 hover:shadow-md transition-all disabled:opacity-70"
          >
            {exporting === "png" ? (
              <span className="w-4 h-4 rounded-full border-2 border-ivory/30 border-t-ivory animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 4v12M12 16l-4-4M12 16l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            Download PNG
          </button>
          <button
            type="button"
            onClick={() => handleDownload("jpg")}
            disabled={exporting !== null}
            className="w-full min-h-[44px] px-6 py-2.5 inline-flex items-center justify-center gap-2 text-sm font-medium text-ink border border-warm-gray rounded-full hover:border-beige hover:bg-beige/10 transition-colors disabled:opacity-70"
          >
            {exporting === "jpg" && (
              <span className="w-4 h-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin" />
            )}
            Download JPG
          </button>
          {dimensions && (
            <p className="text-xs text-center text-ink/40 pt-1">
              Full resolution · {dimensions[0]} × {dimensions[1]} px
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/40 mb-3">
            Background
          </p>
          <BackgroundPicker
            value={background}
            originalUrl={originalUrl}
            onChange={onBackgroundChange}
          />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/40 mb-3">
            Refine
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full min-h-[44px] px-6 py-2.5 inline-flex items-center justify-center gap-2 text-sm font-medium text-ink border border-warm-gray rounded-full hover:border-beige hover:bg-beige/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Erase / Restore
          </button>
        </div>
      </aside>
    </div>
  );
}
