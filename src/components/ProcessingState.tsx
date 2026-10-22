"use client";

import { useEffect, useState } from "react";

interface ProcessingStateProps {
  imageUrl: string;
  queued?: boolean;
}

export function ProcessingState({ imageUrl, queued }: ProcessingStateProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (queued) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(id);
  }, [queued]);

  return (
    <div className="flex flex-col items-center animate-fade-in">
      <div className="relative w-full overflow-hidden rounded-2xl border border-warm-gray shadow-lg shadow-ink/5 bg-warm-gray-light">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Uploaded"
          className="w-full h-auto max-h-[60vh] object-contain mx-auto opacity-60"
        />
        {!queued && (
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-beige/40 to-transparent animate-scan" />
        )}
      </div>
      <div className="flex items-center gap-2.5 mt-6">
        {!queued && (
          <span className="w-4 h-4 rounded-full border-2 border-beige/30 border-t-beige-dark animate-spin" />
        )}
        <p className="text-base text-ink">
          {queued ? "Waiting in queue…" : "Removing background…"}
        </p>
      </div>
      {!queued && (
        <p className="text-sm text-ink/50 mt-1.5">
          {elapsed < 8000
            ? "This usually takes a few seconds"
            : "First run loads the model into memory — this can take up to a minute"}
        </p>
      )}
    </div>
  );
}
