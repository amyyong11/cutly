"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { UploadArea } from "@/components/UploadArea";
import { ProcessingState } from "@/components/ProcessingState";
import { ResultViewer } from "@/components/ResultViewer";
import { SampleImages } from "@/components/SampleImages";
import { ThumbnailStrip } from "@/components/ThumbnailStrip";
import { getErrorMessage, validateImageFile } from "@/lib/image-utils";
import type { Background } from "@/lib/compose";

interface Item {
  id: string;
  file: File;
  originalUrl: string;
  status: "queued" | "processing" | "done" | "error";
  resultUrl?: string;
  errorMessage?: string;
  background: Background;
}

function errorMessageFor(code: unknown): string {
  if (code === "unsupported_type") {
    return "This file type isn't supported. Please upload a PNG, JPG, or WebP image.";
  }
  if (code === "too_large") {
    return "This image is too large. Please upload a smaller file.";
  }
  return "Something went wrong. Please try uploading your image again.";
}

async function requestBackgroundRemoval(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await fetch("/api/remove-background", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(errorMessageFor(data.error));
  }
  return response.blob();
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  // Server-side inference is CPU-bound, so images are processed one at a
  // time rather than fired off in parallel.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      for (const file of files) {
        const error = validateImageFile(file);
        if (error) setDropError(getErrorMessage(error));
        else valid.push(file);
      }
      if (valid.length === 0) return;
      setDropError(null);

      const newItems: Item[] = valid.map((file) => ({
        id: crypto.randomUUID(),
        file,
        originalUrl: URL.createObjectURL(file),
        status: "queued",
        background: { type: "transparent" },
      }));
      setItems((prev) => [...prev, ...newItems]);
      setActiveId(newItems[0].id);

      for (const item of newItems) {
        queueRef.current = queueRef.current.then(async () => {
          updateItem(item.id, { status: "processing" });
          try {
            const blob = await requestBackgroundRemoval(item.file);
            updateItem(item.id, {
              status: "done",
              resultUrl: URL.createObjectURL(blob),
            });
          } catch (err) {
            updateItem(item.id, {
              status: "error",
              errorMessage:
                err instanceof Error && err.message !== "Failed to fetch"
                  ? err.message
                  : errorMessageFor(null),
            });
          }
        });
      }
    },
    [updateItem]
  );

  const removeItem = useCallback(
    (id: string) => {
      const current = itemsRef.current;
      const index = current.findIndex((item) => item.id === id);
      const item = current[index];
      if (!item) return;
      // Leave in-flight items' URLs alone; the queue still writes to them.
      if (item.status === "done" || item.status === "error") {
        URL.revokeObjectURL(item.originalUrl);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
      const next = current.filter((i) => i.id !== id);
      setItems(next);
      if (id === activeId) {
        setActiveId(next[Math.min(index, next.length - 1)]?.id ?? null);
      }
    },
    [activeId]
  );

  const handleProcessedUpdate = useCallback(
    (id: string, blob: Blob) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
          return { ...item, resultUrl: URL.createObjectURL(blob) };
        })
      );
    },
    []
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditing) return;
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isEditing, addFiles]);

  // Accept files dropped anywhere on the page, not just on the upload box.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || isEditing) return;
      depth++;
      setIsDraggingFile(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFile(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = 0;
      setIsDraggingFile(false);
      // The upload box handles its own drops and marks them handled.
      if (e.defaultPrevented || isEditing) return;
      e.preventDefault();
      addFiles(Array.from(e.dataTransfer?.files ?? []));
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [isEditing, addFiles]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.originalUrl);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
    };
  }, []);

  const active = items.find((item) => item.id === activeId) ?? null;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="w-full px-6 sm:px-8 py-6 sm:py-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          aria-label="Home"
          className="rounded-xl"
        >
          <Logo />
        </button>
        {items.length > 0 && !active && (
          <button
            type="button"
            onClick={() => setActiveId(items[items.length - 1].id)}
            className="text-sm font-medium text-ink/60 hover:text-ink transition-colors min-h-[44px] px-2"
          >
            Your images ({items.length})
          </button>
        )}
      </header>

      {!active && (
        <div className="flex-1 flex items-center px-6 sm:px-8 pb-16 sm:pb-24">
          <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-center animate-fade-in-up">
            <div className="text-center lg:text-left">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-ink mb-5 leading-[1.05]">
                Remove image backgrounds.
                <span className="block text-beige-dark">100% automatically.</span>
              </h2>
              <p className="text-base sm:text-lg text-ink/60 mb-8 max-w-md mx-auto lg:mx-0">
                Clean cutouts in seconds, with crisp edges on hair and fur.
                Then swap in a new color, a blur, or your own photo.
              </p>
              <div className="flex items-center justify-center lg:justify-start flex-wrap gap-x-5 gap-y-2">
                {[
                  ["No sign-up", "M5 13l4 4L19 7"],
                  ["Full resolution", "M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"],
                  ["Runs on your server", "M13 10V3L4 14h7v7l9-11h-7z"],
                  ["Free", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2"],
                ].map(([label, d]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d={d} stroke="#A68B6A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <UploadArea onUpload={addFiles} />
              {dropError && (
                <p className="text-sm text-center text-ink/70 animate-fade-in">
                  {dropError}
                </p>
              )}
              <SampleImages onSelect={(file) => addFiles([file])} />
              <p className="text-[11px] text-center text-ink/35">
                Sample photos from Unsplash.
              </p>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 pb-16 space-y-6">
          <div key={active.id}>
            {(active.status === "queued" || active.status === "processing") && (
              <div className="max-w-2xl mx-auto">
                <ProcessingState
                  imageUrl={active.originalUrl}
                  queued={active.status === "queued"}
                />
              </div>
            )}

            {active.status === "done" && active.resultUrl && (
              <ResultViewer
                originalUrl={active.originalUrl}
                processedUrl={active.resultUrl}
                filename={active.file.name}
                background={active.background}
                onBackgroundChange={(background) =>
                  updateItem(active.id, { background })
                }
                onProcessedUpdate={(blob) => handleProcessedUpdate(active.id, blob)}
                onEditingChange={setIsEditing}
              />
            )}

            {active.status === "error" && (
              <div className="max-w-xl mx-auto text-center py-16 animate-fade-in-up">
                <div className="inline-flex items-center justify-center w-12 h-12 mb-5 rounded-full bg-red-50 border border-red-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                      stroke="#C4756B"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-base text-ink/70 mb-6">{active.errorMessage}</p>
                <button
                  type="button"
                  onClick={() => {
                    const { file, id } = active;
                    removeItem(id);
                    addFiles([file]);
                  }}
                  className="min-h-[44px] px-6 py-2.5 text-sm font-medium text-ink border border-warm-gray rounded-full hover:border-beige hover:bg-beige/10 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-warm-gray pt-4">
            <ThumbnailStrip
              items={items.map((item) => ({
                id: item.id,
                url: item.resultUrl ?? item.originalUrl,
                status: item.status,
              }))}
              activeId={activeId}
              onSelect={setActiveId}
              onRemove={removeItem}
              onAdd={addFiles}
            />
            {dropError && (
              <p className="mt-2 text-sm text-ink/70 animate-fade-in">{dropError}</p>
            )}
          </div>
        </div>
      )}

      {isDraggingFile && (
        <div className="fixed inset-0 z-40 bg-ivory/85 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="m-6 w-full max-w-3xl h-[60vh] rounded-3xl border-2 border-dashed border-beige flex flex-col items-center justify-center">
            <p className="text-2xl font-medium text-ink">Drop images anywhere</p>
            <p className="text-sm text-ink/50 mt-2">PNG, JPG, or WebP</p>
          </div>
        </div>
      )}
    </main>
  );
}
