"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/** Singkatan bulan gaya Indonesia (sama dengan yang dipakai filter Run History). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Batas bawah navigasi tahun; batas atas mengikuti tahun berjalan. */
const MIN_YEAR = 2000;

/** "2026-09" -> "Sep-2026". */
function formatMonth(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return "";
  const idx = Number(m[2]) - 1;
  return `${MONTHS[idx] ?? m[2]}-${m[1]}`;
}

/**
 * Pemilih bulan-tahun (label tampil `Mmm-YYYY`).
 *
 * Menu kalendernya dirender lewat portal + posisi fixed dengan alasan yang sama
 * seperti komponen Select: kalau dirender inline, ia akan terpotong
 * `overflow: hidden` milik dialog modal tempat picker ini dipakai.
 */
export function MonthPicker({
  value,
  onChange,
  ariaLabel,
  placeholder = "Semua Periode",
}: {
  /** Format "YYYY-MM"; string kosong = tanpa filter. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [year, setYear] = useState(() => {
    const m = /^(\d{4})/.exec(value);
    return m ? Number(m[1]) : new Date().getFullYear();
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const PANEL_WIDTH = 248;
  const PANEL_HEIGHT = 244;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.bottom + PANEL_HEIGHT > window.innerHeight - 8 && r.top > PANEL_HEIGHT;
    setPos({
      top: up ? r.top - PANEL_HEIGHT - 4 : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8),
      width: r.width,
    });
  };

  // Saat dibuka, tahun yang ditampilkan mengikuti nilai terpilih (atau tahun ini).
  useEffect(() => {
    if (!open) return;
    const m = /^(\d{4})/.exec(value);
    setYear(m ? Number(m[1]) : new Date().getFullYear());
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
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

  const selectedMonth = /^(\d{4})-(\d{2})$/.exec(value)?.[2] ?? "";
  const selectedYear = Number(/^(\d{4})/.exec(value)?.[1] ?? NaN);

  // Bulan yang belum terlewati tidak bisa dipilih (mengikuti acuan desain:
  // Okt/Nov/Des tahun berjalan tampil pudar).
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const pick = (monthIndex: number) => {
    onChange(`${year}-${String(monthIndex + 1).padStart(2, "0")}`);
    setOpen(false);
  };

  const navStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#94A3B8",
    cursor: "pointer",
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          width: "100%",
          height: 36,
          padding: "0 0.6rem",
          borderRadius: 8,
          border: `1px solid ${open || hovered ? "#CBD5E1" : "#E2E8F0"}`,
          background: "#fff",
          color: value ? "#1E293B" : "#94A3B8",
          fontSize: "0.8rem",
          fontWeight: 600,
          cursor: "pointer",
          boxSizing: "border-box",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxShadow: open ? "0 0 0 3px rgba(255, 195, 72, 0.25)" : "none",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? formatMonth(value) : placeholder}
        </span>
        <ChevronRight
          size={14}
          style={{
            color: "#94A3B8",
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "none",
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
            role="dialog"
            aria-label={ariaLabel ?? "Pilih periode"}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: PANEL_WIDTH,
              zIndex: 400,
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 10,
              animation: "dropdownIn 0.12s ease-out",
            }}
          >
            {/* Navigasi tahun: panah ganda `<<` `>>` warna soft slate */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                aria-label="Tahun sebelumnya"
                disabled={year <= MIN_YEAR}
                onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))}
                style={{ ...navStyle, opacity: year <= MIN_YEAR ? 0.35 : 1 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <ChevronsLeft size={16} />
              </button>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#64748B" }}>{year}</span>
              <button
                type="button"
                aria-label="Tahun berikutnya"
                // Tidak ada bulan yang bisa dipilih di tahun mendatang.
                disabled={year >= curYear}
                onClick={() => setYear((y) => Math.min(curYear, y + 1))}
                style={{ ...navStyle, opacity: year >= curYear ? 0.35 : 1 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <ChevronsRight size={16} />
              </button>
            </div>

            {/* Grid 3x4 tanpa border/outline individual di tiap item */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {MONTHS.map((label, i) => {
                const mm = String(i + 1).padStart(2, "0");
                const isActive = selectedYear === year && selectedMonth === mm;
                const isFuture = year > curYear || (year === curYear && i > curMonth);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isActive}
                    disabled={isFuture}
                    onClick={() => pick(i)}
                    style={{
                      height: 32,
                      border: "none",
                      // Sudut tajam/minimal sesuai acuan.
                      borderRadius: isActive ? 3 : 2,
                      background: isActive
                        ? "#FBBF24"
                        : isFuture
                          ? "rgba(248, 250, 252, 0.8)"
                          : "transparent",
                      color: isActive ? "#fff" : isFuture ? "#CBD5E1" : "#334155",
                      fontSize: "0.75rem",
                      fontWeight: isActive ? 700 : 600,
                      cursor: isFuture ? "default" : "pointer",
                      pointerEvents: isFuture ? "none" : "auto",
                      transition: "background-color 0.12s ease, color 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive && !isFuture) e.currentTarget.style.background = "#F1F5F9";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive && !isFuture) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Bersihkan filter */}
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "6px 0",
                  border: "1px solid #E2E8F0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#475569",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                Bersihkan periode
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
