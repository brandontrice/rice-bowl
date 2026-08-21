"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard permission denied — silently no-op, the value is still visible to copy by hand
        }
      }}
      className="shrink-0 rounded-lg border border-seam px-2.5 py-1 text-xs font-semibold text-ink-dim hover:border-accent hover:text-ink"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
