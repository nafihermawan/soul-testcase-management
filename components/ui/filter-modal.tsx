"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

/** Selector elemen yang bisa menerima fokus (untuk focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Kumpulkan elemen fokusable di dalam dialog — PLUS menu field yang di-portal
 * ke body (ditandai `data-filter-menu`), supaya navigasi keyboard di dalam
 * dropdown yang terbuka tidak dianggap "keluar" dari modal.
 */
function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  const inDialog = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  const inMenus = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-filter-menu] ${FOCUSABLE}`)
  );
  return [...inDialog, ...inMenus].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Filter = SATU tombol + modal terpusat yang dipakai SEMUA halaman
 * (Run History, Dashboard, Bugs, Reports). Isi field diserahkan lewat
 * `children` supaya logika tiap halaman tetap ada di halamannya.
 *
 * Nilai filter ditahan sebagai draft oleh pemanggil: `onReset` mengembalikan
 * draft, `onApply` dipanggil saat "Terapkan Filter" diklik (lalu modal menutup).
 */
export function FilterModal({
  title,
  activeCount,
  onReset,
  onApply,
  children,
}: {
  title: string;
  activeCount: number;
  onReset: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // `mounted` menahan portal selama animasi keluar; `shown` adalah target
  // transisi (fade + scale-up) supaya buka & tutup sama-sama halus.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    // Tutup: biarkan transisi keluar selesai dulu, baru lepas dari DOM.
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  /**
   * Animasi MASUK dijalankan terpisah dari `mounted`, dengan DUA rAF: satu rAF
   * saja bisa ter-batch dengan commit React sehingga frame awal (opacity 0)
   * tidak pernah dilukis dan transisinya tidak jalan.
   */
  useEffect(() => {
    if (!mounted) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mounted]);

  // Esc menutup, Tab berputar di dalam modal, body tidak ikut ter-scroll.
  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const nodes = focusablesIn(dialog);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active === dialog || (!!active && nodes.includes(active));
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Fokus awal dipindah ke dalam dialog; saat ditutup dikembalikan ke tombol
  // Filter. `wasOpen` mencegah focus-steal saat komponen pertama kali mount.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (mounted) {
      wasOpen.current = true;
      dialogRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
  }, [mounted]);

  return (
    <>
      {/* Tombol pemicu — satu gaya untuk seluruh aplikasi. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="btn-radius-10"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 40,
          boxSizing: "border-box",
          padding: "0 14px",
          border: "1px solid #FFC348",
          borderRadius: 10,
          background: "#FFF8E8",
          color: "#0F172A",
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: "nowrap",
          cursor: "pointer",
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 251, 235, 0.6)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFF8E8")}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filter
        {activeCount > 0 && (
          <span
            style={{
              background: "#FFC348",
              color: "#0F172A",
              padding: "1px 6px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            {activeCount}
          </span>
        )}
      </button>

      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(4px)",
              opacity: shown ? 1 : 0,
              transition: "opacity 0.2s ease-out",
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 480,
                maxWidth: "calc(100vw - 32px)",
                maxHeight: "calc(100vh - 48px)",
                background: "#FFFFFF",
                borderRadius: 18,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 48px -12px rgba(15, 23, 42, 0.28)",
                outline: "none",
                opacity: shown ? 1 : 0,
                transform: shown ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
                transition: "opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                willChange: "opacity, transform",
              }}
            >
              {/* Header — seluruh modal putih (tidak ada latar abu). */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "18px 16px 16px 24px",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: "#FFF8E8",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <SlidersHorizontal size={16} color="#0F172A" aria-hidden="true" />
                  </span>
                  <h3
                    id={titleId}
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#0F172A",
                      letterSpacing: "-0.01em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup"
                  style={{
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    borderRadius: 9,
                    color: "#64748B",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Divider INSET (elemen tersendiri, berhenti 24px dari tepi). */}
              <div style={{ height: 1, margin: "0 24px", background: "#EEF1F5", flexShrink: 0 }} />

              {/* Body — men-scroll bila field-nya banyak; header/footer tetap. */}
              <div
                style={{
                  padding: "20px 24px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  overflowY: "auto",
                  minHeight: 0,
                }}
              >
                {children}
              </div>

              {/* Divider INSET di atas footer. */}
              <div style={{ height: 1, margin: "0 24px", background: "#EEF1F5", flexShrink: 0 }} />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 24px",
                  background: "#FFFFFF",
                  flexShrink: 0,
                }}
              >
                {/* Reset: tombol teks tanpa border/background. */}
                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 40,
                    padding: "0 12px",
                    marginLeft: -12,
                    border: "none",
                    borderRadius: 10,
                    background: "transparent",
                    color: "#475569",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Reset Filter
                </button>

                {/* Terapkan: primer kuning, teks saja. */}
                <button
                  type="button"
                  onClick={() => {
                    onApply();
                    setOpen(false);
                  }}
                  style={{
                    height: 40,
                    boxSizing: "border-box",
                    padding: "0 18px",
                    border: "1px solid #FFC348",
                    borderRadius: 10,
                    background: "#FFC348",
                    color: "#0F172A",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  Terapkan Filter
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
