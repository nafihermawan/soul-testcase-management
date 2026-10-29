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
 * Indikator scroll cue: layer gradient fade + tombol bulat berisi chevron ⌄.
 *
 * Dirender sebagai anak dari container yang `position: relative` (kartu modal
 * atau area isi) — `buttonBottom`/`fadeBottom` mengukur jarak dari dasar
 * container tersebut, supaya bisa dipakai di modal dengan tinggi footer berbeda.
 *
 * - `onClick` diisi  → tombol interaktif (klik = gulir ke bawah ±70%).
 * - `onClick` kosong → hanya dekoratif (tidak bisa diklik/difokus).
 *
 * Dipakai di: modal Laporkan Bug, Edit Bug, Detail Bug, dan preview Test Case.
 */
export function ScrollCue({
  visible,
  onClick,
  buttonBottom = 72,
  fadeBottom = 64,
}: {
  visible: boolean;
  onClick?: () => void;
  /** Jarak tombol dari dasar container (px). */
  buttonBottom?: number;
  /** Jarak gradien fade dari dasar container (px). */
  fadeBottom?: number;
}) {
  const icon = <ChevronDown size={18} strokeWidth={2.2} color="#F59E0B" aria-hidden="true" />;

  const boxStyle: React.CSSProperties = {
    position: "absolute",
    bottom: buttonBottom,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(15,23,42,0.10)",
    opacity: visible ? 1 : 0,
    transition: "opacity 150ms ease",
  };

  return (
    <>
      {/* Gradient fade: menutup konten yang masih ada di bawah. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: fadeBottom,
          left: 0,
          right: 0,
          height: 56,
          background: "linear-gradient(to bottom, rgba(255,255,255,0), #FFFFFF 85%)",
          pointerEvents: "none",
          zIndex: 1,
          opacity: visible ? 1 : 0,
          transition: "opacity 150ms ease",
        }}
      />

      {onClick ? (
        <button
          type="button"
          className="scroll-cue-btn"
          aria-label="Gulir ke konten berikutnya"
          aria-hidden={!visible}
          tabIndex={visible ? 0 : -1}
          onClick={onClick}
          style={{ ...boxStyle, pointerEvents: visible ? "auto" : "none", cursor: "pointer" }}
        >
          {icon}
        </button>
      ) : (
        // Dekoratif — background/border inline karena tidak memakai hover.
        <div
          aria-hidden="true"
          style={{
            ...boxStyle,
            background: "#FFFFFF",
            border: "1px solid #FDE68A",
            pointerEvents: "none",
          }}
        >
          {icon}
        </div>
      )}
    </>
  );
}

/**
 * Pembungkus isi modal: header + area scroll + footer, plus petunjuk scroll
 * (gradien fade + tombol bulat chevron) dan bayangan header/footer.
 *
 * KENAPA begini: modal hanya punya `max-height` (bukan tinggi tetap), jadi
 * ScrollArea TIDAK boleh memakai `height: 100%` — persen tidak punya acuan dan
 * area jadi tidak benar-benar menggulir. Ganti dengan rantai flex:
 *   BodyWrapper : position relative; flex 1 1 auto; min-height 0; display flex; flex-direction column
 *   ScrollArea  : flex 1 1 auto; min-height 0; overflow-y auto
 * `header`/`footer` diterima lewat props dan tetap diam (flex-shrink 0); hanya
 * ScrollArea yang menggulir.
 */
export function ScrollCueBody({
  header,
  footer,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const [canScroll, setCanScroll] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScroll(el.scrollHeight > el.clientHeight + 4);
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  }, []);

  // Ukur ulang tiap render (tinggi isi bisa berubah setelah modal dibuka) dan
  // saat viewport di-resize. Ini yang membuat cue benar-benar muncul — ukur
  // sekali di mount saja tidak cukup karena layout belum tentu sudah settle.
  useEffect(() => {
    update();
  });
  useEffect(() => {
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const showCue = canScroll && !atBottom;

  const scrollNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ top: el.clientHeight * 0.7, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div
      style={{
        position: "relative",
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header — bayangan muncul saat area isi sudah di-scroll. */}
      {header != null && (
        <div
          style={{
            flexShrink: 0,
            position: "relative",
            zIndex: 2,
            boxShadow: canScroll && !atTop ? "0 4px 12px rgba(15,23,42,0.06)" : "none",
            transition: "box-shadow 150ms ease",
          }}
        >
          {header}
        </div>
      )}

      {/* Area scroll + petunjuk scroll. Cue-nya absolute di container ini
          (relatif ke tepi bawah area scroll), jadi tidak ikut ter-scroll. */}
      <div
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          ref={scrollRef}
          onScroll={update}
          style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}
        >
          {children}
        </div>

        {/* Tombol bulat 12px di atas tepi bawah area scroll; gradient fade tepat
            di tepi bawahnya. */}
        <ScrollCue
          visible={showCue}
          onClick={scrollNext}
          buttonBottom={12}
          fadeBottom={0}
        />
      </div>

      {/* Footer — bayangan muncul saat masih ada konten di bawah. */}
      {footer != null && (
        <div
          style={{
            flexShrink: 0,
            position: "relative",
            zIndex: 2,
            boxShadow: showCue ? "0 -4px 12px rgba(15,23,42,0.06)" : "none",
            transition: "box-shadow 150ms ease",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
