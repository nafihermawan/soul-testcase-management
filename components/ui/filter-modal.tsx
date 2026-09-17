"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Filter sebagai SATU tombol + MODAL TERPUSAT (backdrop overlay), dipakai
 * halaman Reports. Isi field diserahkan lewat `children`.
 *
 * Nilai filter ditahan sebagai draft oleh pemanggil; `onApply` dipanggil saat
 * tombol Terapkan diklik, `onReset` hanya mengembalikan draft.
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
   * Animasi MASUK dijalankan terpisah dari `mounted`, dengan DUA rAF.
   *
   * Satu rAF saja tidak cukup: callback-nya bisa ikut ter-batch dengan commit
   * React yang baru memasang elemen, sehingga frame "kondisi awal" (opacity 0)
   * tidak pernah dilukis dan transisinya tidak jalan sama sekali. rAF kedua
   * memastikan frame awal sudah tergambar sebelum target transisi dipasang.
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

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          // Ringkas & sejajar dengan search bar di sebelahnya: h-8 (32px),
          // padding horizontal 12px, teks text-xs (12px).
          height: 32,
          padding: "0 12px",
          // Outlined/ghost amber: border tipis, latar putih, teks + ikon amber.
          border: "1px solid #FFC348",
          background: "#fff",
          color: "#F59E0B",
          fontWeight: 500,
          fontSize: 12,
          borderRadius: 8,
          cursor: "pointer",
          transition: "background-color 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          // amber-50/50 — tint kuning sangat tipis saat hover.
          e.currentTarget.style.background = "rgba(255, 251, 235, 0.5)";
          e.currentTarget.style.borderColor = "#FBBF24";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#fff";
          e.currentTarget.style.borderColor = "#FFC348";
        }}
      >
        <SlidersHorizontal size={13} />
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
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(4px)",
              opacity: shown ? 1 : 0,
              transition: "opacity 0.2s ease-out",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 448,
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #F1F5F9",
                boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
                opacity: shown ? 1 : 0,
                // Naik sedikit sambil membesar — gerakan kecil ini membuat
                // transisinya terasa jelas, bukan sekadar kedip.
                transform: shown ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
                transition:
                  "opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                willChange: "opacity, transform",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  // Garis pemisah di bawah judul; ter-inset oleh padding dialog.
                  paddingBottom: 14,
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0F172A" }}>
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup"
                  style={{
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    color: "#6B7280",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {children}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  paddingTop: 12,
                  borderTop: "1px solid #F1F5F9",
                }}
              >
                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    color: "#475569",
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    fontWeight: 600,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply();
                    setOpen(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    fontSize: 12,
                    background: "#FFC348",
                    color: "#0F172A",
                    fontWeight: 700,
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
