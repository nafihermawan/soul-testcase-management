"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function TestDataCodeblock({ data }: { data: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };

  return (
    <div
      style={{
        position: "relative",
        background: "#0F172A",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => void copy()}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.25rem 0.6rem",
          borderRadius: 6,
          border: "none",
          background: "rgba(255, 255, 255, 0.12)",
          color: "#CBD5E1",
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(2px)",
        }}
      >
        {copied ? (
          <>
            <Check size={12} /> Tersalin
          </>
        ) : (
          <>
            <Copy size={12} /> Salin
          </>
        )}
      </button>
      <pre
        style={{
          margin: 0,
          padding: "0.8rem 0.9rem",
          fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
          fontSize: "0.78rem",
          color: "#E2E8F0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.65,
        }}
      >
        {data}
      </pre>
    </div>
  );
}
