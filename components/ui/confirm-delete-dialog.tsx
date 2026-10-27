"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";

/**
 * Durasi animasi keluar (ms) — samakan dengan `.overlay-out` / `.modal-out`
 * di `globals.css`. Dipakai untuk menahan dialog sebentar supaya penutupannya
 * ikut beranimasi, bukan hilang mendadak.
 */
const EXIT_MS = 200;

type Phase = "closed" | "open" | "leaving";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * SATU-SATUNYA dialog konfirmasi hapus di aplikasi ini.
 *
 * Semua permukaan (test case, section, suite, project, bug, test run, akses
 * user, link automation) memakai komponen ini supaya tampilan & perilakunya
 * identik; yang berbeda hanya teksnya. Logika hapus tetap milik pemanggil —
 * komponen ini hanya memanggil `onConfirm`.
 *
 * Perilaku penting:
 * - `role="alertdialog"` + aria-labelledby/aria-describedby.
 * - Fokus awal ke "Batal" (pilihan aman), fokus terperangkap selama terbuka,
 *   dan kembali ke elemen pemicu saat ditutup.
 * - Esc, tombol X, "Batal", dan klik overlay menutup tanpa menghapus. Semua
 *   jalur itu (termasuk Esc) mati selama `pending` — permintaan hapus yang
 *   sudah berjalan tidak bisa dibatalkan dari dialog.
 * - Animasi masuk 280ms / keluar 200ms; dihilangkan bila pengguna memilih
 *   `prefers-reduced-motion`.
 */
export function ConfirmDeleteDialog({
  open,
  itemType,
  itemName,
  impact,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** Nama jenis item — dipakai di judul: "Hapus {itemType}?". */
  itemType: string;
  /** Nama item yang dihapus; dikutip & ditebalkan di dalam pesan. */
  itemName?: React.ReactNode;
  /** Kalimat tambahan, mis. dampak ke item di dalamnya. */
  impact?: React.ReactNode;
  /** Sedang menghapus: tombol nonaktif, tombol Hapus menampilkan spinner. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** Elemen yang memicu dialog — fokus dikembalikan ke sini saat ditutup. */
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  const shown = phase !== "closed";

  // Buka: langsung tampil. Tutup: masuk fase "leaving" dulu (animasi keluar).
  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    setPhase((prev) => (prev === "open" ? "leaving" : prev));
  }, [open]);

  // Setelah animasi keluar selesai, lepas dari DOM.
  useEffect(() => {
    if (phase !== "leaving") return;
    const delay = prefersReducedMotion() ? 0 : EXIT_MS;
    const timer = window.setTimeout(() => setPhase("closed"), delay);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Fokus awal ke "Batal" + catat elemen pemicu untuk pemulihan fokus.
  useEffect(() => {
    if (phase !== "open") return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    cancelRef.current?.focus();
  }, [phase]);

  // Kunci scroll body selama tampil; saat benar-benar tertutup, kembalikan fokus.
  useEffect(() => {
    if (!shown) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    };
  }, [shown]);

  // Esc (tutup) + jebakan fokus (Tab/Shift+Tab tetap di dalam dialog).
  useEffect(() => {
    if (phase !== "open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Selama menghapus, dialog tidak bisa dibatalkan.
        if (!pending) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = dialogRef.current?.contains(active) ?? false;
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, pending, onCancel]);

  if (!shown) return null;

  return createPortal(
    <div
      className={`confirm-delete-font ${phase === "leaving" ? "overlay-out" : "overlay-in"}`}
      style={{
        position: "fixed",
        inset: 0,
        /**
         * Dialog ini bisa dipicu dari DALAM modal (mis. hapus attachment di
         * panel Evidence), jadi z-index-nya harus di atas seluruh lapisan app:
         * modal ≤ 320, popover/preview ≤ 400, toast 9999. 450 = di atas modal &
         * popover, tetap di bawah toast.
         */
        zIndex: 450,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.45)",
      }}
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={phase === "leaving" ? "modal-out" : "modal-pop-in"}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "calc(100vw - 32px)",
          background: "#FFFFFF",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 24px 48px -12px rgba(15,23,42,0.28)",
        }}
      >
        {/* Baris konten: ikon | teks | tombol tutup */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "22px 16px 20px 24px",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#FEF2F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Trash2 size={18} strokeWidth={2} color="#B91C1C" />
          </span>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingTop: 2,
            }}
          >
            <h2
              id={titleId}
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#0F172A",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              Hapus {itemType}?
            </h2>
            <p
              id={messageId}
              style={{ fontSize: 14, lineHeight: 1.55, color: "#475569", margin: 0 }}
            >
              Apakah Anda yakin ingin menghapus{" "}
              {itemName ? (
                <strong style={{ fontWeight: 600, color: "#0F172A" }}>
                  &quot;{itemName}&quot;
                </strong>
              ) : (
                `${itemType} ini`
              )}
              ? Tindakan ini tidak dapat dibatalkan.{impact ? <> {impact}</> : null}
            </p>
          </div>

          <button
            type="button"
            aria-label="Tutup"
            onClick={() => {
              if (!pending) onCancel();
            }}
            style={{
              width: 32,
              height: 32,
              marginTop: -4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: 8,
              cursor: pending ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <X size={16} color="#94A3B8" />
          </button>
        </div>

        {/* Aksi — rata kanan, lebar mengikuti isi (tidak dibagi dua) */}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "4px 24px 20px" }}
        >
          <button
            ref={cancelRef}
            type="button"
            className="cd-btn cd-btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Batal
          </button>
          <button
            type="button"
            className="cd-btn cd-btn-danger"
            onClick={onConfirm}
            disabled={pending}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {pending ? (
              <>
                <Spinner size={14} />
                Menghapus…
              </>
            ) : (
              "Hapus"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
