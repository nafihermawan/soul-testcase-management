"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * Tooltip ringan berbasis hover: bubble gelap melayang di atas pemicunya.
 * Dipakai untuk memindahkan detail (mis. rincian progress) ke lapisan hover
 * agar baris tabel tetap ringkas satu baris.
 */
export function Tooltip({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            whiteSpace: "nowrap",
            // bg-slate-900 · text-white · text-[11px] · px-2 py-1 · rounded · shadow-md
            background: "#0F172A",
            color: "#FFFFFF",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "0.25rem 0.5rem",
            borderRadius: 6,
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
