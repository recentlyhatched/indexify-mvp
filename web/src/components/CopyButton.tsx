"use client";
import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="rounded p-0.5 text-faint transition hover:bg-primary-50 hover:text-primary"
    >
      {done ? (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor"><path d="M7.7 13.3 4.4 10l-1.2 1.2 4.5 4.5 9.5-9.5-1.2-1.2z" /></svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" /></svg>
      )}
    </button>
  );
}
