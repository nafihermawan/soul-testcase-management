"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Hook indikator scroll: pasang `ref` + `onScroll` ke container yang bisa
 * di-scroll, lalu pakai `canScrollMore` untuk menampilkan/menyembunyikan cue.
 *
 * Container dianggap "masih bisa scroll ke bawah" bila sisa jarak lebih dari
 * 10px (toleransi pembulatan), dan cue hilang otomatis begitu mentok dasar.
 */
export function useScrollCue() {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollMore(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
  }, []);

  // Ukur ulang tiap render (isi bisa berubah tinggi) + saat viewport di-resize.
  useEffect(() => {
    update();
  });
  useEffect(() => {
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return { ref, canScrollMore, onScroll: update };
}

/**
 * Indikator scroll cue: layer gradient fade + ikon chevron kuning yang memantul.
 * Dirender sebagai anak dari KARTU modal yang `position: relative` — posisinya
 * absolut terhadap kartu, jadi `bottom` diukur dari dasar kartu (tepat di atas
 * footer action). `pointer-events: none` supaya tidak pernah menghalangi form.
 *
 * Dipakai di: modal Laporkan Bug, Edit Bug, dan Detail Bug.
 */
export function ScrollCue({ visible }: { visible: boolean }) {
  return (
    <>
      {/* Gradient fade: menutup konten yang masih ada di bawah. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 64,
          left: 0,
          right: 0,
          height: 48,
          background: "linear-gradient(to top, #fff, rgba(255, 255, 255, 0.8), transparent)",
          pointerEvents: "none",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Chevron kuning melayang di tengah area fade. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 72,
          left: "50%",
          // `-translate-x-1/2` di wrapper agar animasi bounce di dalamnya tidak
          // menimpa transform pemusatan ini.
          transform: "translateX(-50%)",
          zIndex: 10,
          pointerEvents: "none",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        <div
          className="scroll-cue-bounce"
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            background: "#fff",
            border: "1px solid rgba(253, 230, 138, 0.5)",
            boxShadow: "0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.1)",
            // Warna kuning Soulparking (sama dengan tombol aksi utama).
            color: "#FFC348",
          }}
        >
          <ChevronDown size={16} />
        </div>
      </div>
    </>
  );
}
