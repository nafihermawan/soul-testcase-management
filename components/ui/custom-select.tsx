"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type CustomSelectOption = { value: string; label: string; /** Tag kecil di samping label (mis. platform). */ badge?: string };

/** Gaya label field di dalam modal/popover filter (dipakai Dashboard & Reports). */
export const filterLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const badgeStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: "0 6px",
  borderRadius: 4,
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  color: "#475569",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: "16px",
  letterSpacing: "0.02em",
};

/**
 * Dropdown select bertema terang (pengganti <select> native yang tampilannya
 * mengikuti OS). Trigger + menu melayang dengan z-index di atas popover.
 *
 * `searchable` menambahkan input pencarian di atas menu — dipakai kalau
 * opsinya banyak (mis. daftar Suite/Module).
 */
export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  searchable = false,
  placeholder = "Pilih...",
}: {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  searchable?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const MENU_MAX_HEIGHT = 240;
  const ITEM_HEIGHT = 32;

  /** Letakkan menu di bawah trigger; dibalik ke atas kalau ruang bawah kurang. */
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const est = Math.min(MENU_MAX_HEIGHT, (searchable ? 42 : 0) + options.length * ITEM_HEIGHT + 8);
    const up = r.bottom + est > window.innerHeight - 8 && r.top > est;
    setPos({
      top: up ? r.top - est - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  };

  useEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Menu kini di portal (di luar `ref`), jadi harus dicek terpisah —
      // tanpa ini, mousedown di dalam menu menutupnya sebelum klik terpilih.
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((o) => `${o.label} ${o.badge ?? ""}`.toLowerCase().includes(needle))
    : options;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{
          width: "100%",
          height: 36,
          padding: "0 12px",
          // Token visual disamakan dengan komponen Select (satu bahasa desain).
          border: `1px solid ${focused ? "#FFC348" : hovered ? "#CBD5E1" : "#E2E8F0"}`,
          borderRadius: 8,
          boxShadow: focused ? "0 0 0 3px rgba(255, 195, 72, 0.25)" : "none",
          background: "#fff",
          color: "#1E293B",
          fontSize: 12,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.badge && <span style={badgeStyle}>{selected.badge}</span>}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "#94A3B8",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Portal + posisi fixed: menu di dalam dialog modal (yang punya
              // overflow: hidden) akan terpotong kalau dirender inline.
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 400,
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 4,
              animation: "dropdownIn 0.12s ease-out",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {searchable && (
            <div style={{ padding: "4px 8px 6px", position: "sticky", top: 0, background: "#fff" }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari…"
                aria-label="Cari opsi"
                style={{
                  width: "100%",
                  height: 30,
                  padding: "0 8px",
                  border: "1px solid #E2E8F0",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#1E293B",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
          {visible.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "#94A3B8" }}>
              Tidak ada hasil.
            </div>
          )}
          {visible.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 12px",
                  border: "none",
                  background: isSelected ? "#FFFBEB" : "transparent",
                  color: isSelected ? "#0F172A" : "#334155",
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.label}
                  </span>
                  {o.badge && <span style={badgeStyle}>{o.badge}</span>}
                </span>
                {isSelected && <Check size={13} style={{ color: "#B45309", flexShrink: 0 }} />}
              </button>
            );
          })}
          </div>,
          document.body
        )}
    </div>
  );
}
