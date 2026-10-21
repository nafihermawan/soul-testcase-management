"use client";

import type { CSSProperties } from "react";

/** Baris yang diawali "•", "-", atau "*" dianggap item daftar (bullet). */
const BULLET_RE = /^[•\-*]\s*(.+)$/;

/**
 * Render teks multi-baris jadi paragraf + daftar berpoin.
 *
 * Dipakai bersama oleh modal Eksekusi (Actual Result) dan modal Complete Run
 * (Case Notes) supaya formatnya satu sumber: baris bullet tidak menumpuk jadi
 * satu paragraf panjang, dan wrap-nya alami (`pre-wrap` + `break-word`, bukan
 * potong di tengah kata).
 *
 * Baris kosong dibuang (tidak menghasilkan spasi menggantung).
 */
export function BulletText({
  text,
  style,
  itemStyle,
}: {
  text: string;
  /** Gaya wrapper (mis. gap). */
  style?: CSSProperties;
  /** Gaya tiap paragraf & item daftar — untuk versi rapat di dalam kartu. */
  itemStyle?: CSSProperties;
}) {
  const base: CSSProperties = {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: "#1E293B",
    // Wrap alami: baris panjang mengikuti spasi; kata panjang tanpa spasi
    // (mis. URL) tetap dipatahkan alih-alih meluber keluar kartu.
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    ...itemStyle,
  };

  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul
        key={key}
        style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}
      >
        {items.map((b, i) => (
          <li key={i} style={base}>
            {b}
          </li>
        ))}
      </ul>
    );
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(BULLET_RE);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flush(`u${i}`);
    blocks.push(
      <p key={`p${i}`} style={base}>
        {line}
      </p>
    );
  });
  flush("ulast");

  return <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>{blocks}</div>;
}
