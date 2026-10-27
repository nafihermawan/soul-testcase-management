"use client";

import { useState, type CSSProperties } from "react";
import { Info } from "lucide-react";
import { runStatusDotColor, runStatusLabel } from "@/components/test-runs/test-run-status-badge";
import { FONT_MONO, FONT_SANS } from "@/components/test-runs/run-executor-shared";

/** Isi sel: satu baris, kelebihan teks dipotong elipsis. */
const truncate: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** Padding horizontal baku sel (header & body sama). */
const CELL_X = 12;

/** Sel beku: tetap menempel di kiri saat tabel digeser mendatar. */
const stickyCell = (background: string): CSSProperties => ({
  position: "sticky",
  left: 0,
  zIndex: 20,
  background,
});

/**
 * Satu baris tabel Run History.
 *
 * Seluruh isi di sini PRESENTASI saja: data, urutan kolom, navigasi klik baris,
 * tombol Report (unduh PDF langsung), dan menu kebab tidak diubah.
 */
export function HistoryRunRow({
  id,
  name,
  projects,
  suites,
  platforms,
  sprint,
  status,
  qaName,
  createdAt,
  extraAction,
  last = false,
  stickyShadow = false,
  rightShadow = false,
}: {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
  suites: { id: string; name: string }[];
  platforms: string | null;
  sprint: string | null;
  status: string;
  qaName: string | null;
  createdAt: string;
  extraAction?: React.ReactNode;
  /** Baris terakhir: tanpa garis bawah (menghindari garis ganda di dasar tabel). */
  last?: boolean;
  /** Tabel sedang digeser mendatar: bayangan tipis di sel beku kiri (Run name). */
  stickyShadow?: boolean;
  /** Masih ada konten di kiri kolom Aksi: bayangan tipis di sel beku kanan. */
  rightShadow?: boolean;
}) {
  // Hover di-track di state supaya sel BEKU ikut berubah warna (background-nya
  // opaque, jadi tidak bisa ikut hover CSS baris).
  const [hovered, setHovered] = useState(false);

  const dateText = new Date(createdAt).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  /** Teks polos untuk sel yang isinya lebih dari satu nilai (mis. "3 suites"). */
  const multiLabel = (count: number, items: { name: string }[], noun: string): React.ReactNode =>
    count > 1 ? (
      <button
        type="button"
        // Daftar lengkapnya tetap lewat tooltip native (perilaku sama seperti
        // sebelumnya). `hist-plain-link` memberi underline saat hover.
        title={items.map((p) => `• ${p.name}`).join("\n")}
        className="hist-plain-link"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 0,
          border: "none",
          background: "transparent",
          fontFamily: FONT_SANS,
          fontSize: 13,
          fontWeight: 500,
          color: "#0F172A",
          cursor: "help",
          maxWidth: "100%",
        }}
      >
        <span style={{ ...truncate }}>{`${count} ${noun}`}</span>
        <Info size={13} color="#94A3B8" aria-hidden="true" style={{ flexShrink: 0 }} />
      </button>
    ) : count === 1 ? (
      <span title={items[0].name} style={truncate}>
        {items[0].name}
      </span>
    ) : (
      "—"
    );

  return (
    <tr
      style={{
        height: 48,
        cursor: "pointer",
        background: hovered ? "#FAFBFC" : "transparent",
        // Garis bawah SERAGAM untuk semua baris (kecuali baris terakhir).
        borderBottom: last ? "none" : "1px solid #F1F4F8",
        fontFamily: FONT_SANS,
        fontSize: 13,
      }}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 1. Run name — kolom beku, satu baris + tooltip nama lengkap. */}
      <td
        title={name}
        style={{
          ...truncate,
          ...stickyCell(hovered ? "#FAFBFC" : "#FFFFFF"),
          padding: `0 ${CELL_X}px 0 16px`,
          fontSize: 13,
          fontWeight: 600,
          color: "#0F172A",
          textAlign: "left",
          // Bayangan hanya saat tabel digeser mendatar (bukan garis permanen).
          boxShadow: stickyShadow ? "2px 0 6px -2px rgba(15, 23, 42, 0.12)" : "none",
        }}
      >
        {name}
      </td>
      {/* 2. Projects covered */}
      <td style={{ padding: `0 ${CELL_X}px`, color: "#334155", textAlign: "left", ...truncate }}>
        {multiLabel(projects.length, projects, "projects")}
      </td>
      {/* 3. Suites included — teks polos + ikon info (tanpa chip). */}
      <td style={{ padding: `0 ${CELL_X}px`, color: "#334155", textAlign: "left", ...truncate }}>
        {multiLabel(suites.length, suites, "suites")}
      </td>
      {/* 4. Platform */}
      <td
        title={platforms ?? undefined}
        style={{ padding: `0 ${CELL_X}px`, color: "#334155", textAlign: "left", ...truncate }}
      >
        {platforms ?? "—"}
      </td>
      {/* 5. Status — titik + label, tanpa background. */}
      <td style={{ padding: `0 ${CELL_X}px`, textAlign: "left", ...truncate }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            color: runStatusDotColor(status),
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: runStatusDotColor(status),
              flexShrink: 0,
            }}
          />
          {runStatusLabel(status)}
        </span>
      </td>
      {/* 6. Sprint — angka, rata kanan, Geist Mono. */}
      <td
        title={sprint ?? undefined}
        style={{
          padding: `0 ${CELL_X}px`,
          textAlign: "right",
          fontFamily: FONT_MONO,
          color: "#334155",
          ...truncate,
        }}
      >
        {sprint ?? "—"}
      </td>
      {/* 7. QA */}
      <td
        title={qaName ?? undefined}
        style={{ padding: `0 ${CELL_X}px`, color: "#334155", textAlign: "left", ...truncate }}
      >
        {qaName ?? "—"}
      </td>
      {/* 8. Execution date — Geist (bukan mono) + angka tabular, slate-500. */}
      <td
        title={dateText}
        style={{
          padding: `0 ${CELL_X}px`,
          fontFamily: FONT_SANS,
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color: "#64748B",
          textAlign: "left",
          whiteSpace: "nowrap",
          ...truncate,
        }}
      >
        {dateText}
      </td>
      {/* 9. Aksi — kolom BEKU KANAN: hanya tombol kebab (menu berisi aksi). */}
      <td
        style={{
          position: "sticky",
          right: 0,
          zIndex: 20,
          // Opaque supaya isi tabel yang lewat di bawahnya tidak tembus.
          background: hovered ? "#FAFBFC" : "#FFFFFF",
          // Bayangan hanya saat masih ada konten di kiri kolom ini.
          boxShadow: rightShadow ? "-8px 0 8px -8px rgba(15, 23, 42, 0.12)" : "none",
          padding: "0 12px 0 0",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {extraAction}
      </td>
    </tr>
  );
}
