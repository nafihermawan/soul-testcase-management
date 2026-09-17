"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Marker list yang dikenali di awal baris: bullet "•" atau angka "1.".
 * Formatnya sengaja tetap PLAIN TEXT (bukan HTML) supaya nilai yang tersimpan
 * tetap terbaca di report, CSV, PDF, dan modal eksekusi.
 */
const BULLET = "•";
const LINE_RE = /^(\s*)(•|\d+\.)\s+(.*)$/;
/** "-" atau "*" yang berdiri sendiri di awal baris (pemicu bullet saat diberi spasi). */
const BULLET_TRIGGER_RE = /^(\s*)[-*]$/;

/**
 * Textarea dengan format daftar otomatis TANPA toolbar:
 * - mengetik `- ` atau `* ` di awal baris otomatis jadi `• `;
 * - `1. ` dikenali sebagai item numbered list (Enter melanjutkan nomornya);
 * - Enter di baris list membuat item baru di bawahnya (• / nomor berikutnya);
 * - Enter di item yang masih kosong keluar dari list (hapus markernya).
 */
export function ListTextarea({
  value,
  onChange,
  name,
  rows = 3,
  required,
  disabled,
  hasError,
  placeholder,
  ariaLabel,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Override tampilan agar cocok dengan field di sekitarnya (mis. modal eksekusi). */
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Posisi caret yang dipulihkan setelah nilai berubah; tanpa ini caret
  // melompat ke akhir teks karena textarea dirender ulang sebagai controlled.
  const caret = useRef<number | null>(null);

  /**
   * Auto-grow: tinggi textarea mengikuti isi (jumlah baris/list), tanpa
   * scrollbar sendiri — overflow-nya diserahkan ke area scroll modal.
   */
  const autoGrow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight tidak menghitung border; dengan box-sizing: border-box
    // selisih ini harus ditambahkan agar baris terakhir tidak terpotong.
    const borderY = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borderY}px`;
  };

  // useLayoutEffect supaya tinggi sudah benar sebelum frame pertama dilukis
  // (termasuk saat modal edit dibuka dengan isi yang sudah ada).
  useLayoutEffect(() => {
    autoGrow();
  }, [value]);

  useEffect(() => {
    window.addEventListener("resize", autoGrow);
    return () => window.removeEventListener("resize", autoGrow);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || caret.current === null) return;
    const pos = caret.current;
    caret.current = null;
    el.focus();
    el.setSelectionRange(pos, pos);
  });

  const commit = (next: string, nextCaret: number) => {
    caret.current = nextCaret;
    onChange(next);
  };

  /** Awal baris tempat caret berada. */
  const lineStartOf = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    const lineStart = lineStartOf(el.value, pos);

    // Spasi setelah "-" / "*" yang berdiri sendiri -> bullet "• ".
    if (e.key === " ") {
      const m = BULLET_TRIGGER_RE.exec(el.value.slice(lineStart, pos));
      if (!m) return;
      e.preventDefault();
      const marker = `${m[1]}${BULLET} `;
      commit(
        el.value.slice(0, lineStart) + marker + el.value.slice(pos),
        lineStart + marker.length
      );
      return;
    }

    if (e.key !== "Enter" || e.shiftKey) return;
    const m = LINE_RE.exec(el.value.slice(lineStart, pos));
    if (!m) return;

    e.preventDefault();
    const [, indent, marker, body] = m;

    // Enter di item yang masih kosong = keluar dari list (Enter kedua).
    if (!body.trim()) {
      commit(el.value.slice(0, lineStart) + el.value.slice(pos), lineStart);
      return;
    }

    const nextMarker = marker === BULLET ? `${BULLET} ` : `${Number.parseInt(marker, 10) + 1}. `;
    const insert = `\n${indent}${nextMarker}`;
    commit(el.value.slice(0, pos) + insert + el.value.slice(pos), pos + insert.length);
  };

  return (
    <textarea
      ref={ref}
      name={name}
      rows={rows}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={{
        width: "100%",
        padding: "0.5rem 0.75rem",
        border: `1px solid ${hasError ? "#EF4444" : "var(--border-strong)"}`,
        borderRadius: 8,
        fontSize: "0.875rem",
        fontFamily: "inherit",
        color: "var(--text)",
        background: "#fff",
        boxSizing: "border-box",
        // Tinggi diatur autoGrow; tanpa scrollbar & handle resize sendiri.
        overflowY: "hidden",
        resize: "none",
        ...style,
      }}
    />
  );
}
