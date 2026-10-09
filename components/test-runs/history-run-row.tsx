"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { runStatusLabel } from "@/components/test-runs/test-run-status-badge";

/** Isi sel tabel: satu baris, kelebihan teks dipotong elipsis. */
const truncate: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** Sel beku: tetap menempel di kiri saat tabel digeser mendatar. */
const stickyCell = (left: number, background: string): CSSProperties => ({
  position: "sticky",
  left,
  zIndex: 20,
  background,
});

/**
 * Garis divider horizontal INSET — background-image 1px di TEPI ATAS elemen
 * dengan jarak kiri/kanan tertentu, supaya divider baris tidak menempel tepi
 * tabel. Baris pertama sekaligus jadi pemisah di bawah header.
 */
const insetDivider = (insetLeft: number, insetRight: number): CSSProperties => ({
  backgroundImage: "linear-gradient(to right, #E2E8F0, #E2E8F0)",
  backgroundSize: `calc(100% - ${insetLeft + insetRight}px) 1px`,
  backgroundPosition: `${insetLeft}px 0`,
  backgroundRepeat: "no-repeat",
});

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
  extraAction?: ReactNode;
}) {
  // Hover di-track di state supaya sel BEKU ikut berubah warna — kalau tidak,
  // kolom beku tetap putih saat barisnya di-hover (background-nya opaque).
  const [hovered, setHovered] = useState(false);
  const frozenBg = hovered ? "#F8FAFC" : "#fff";

  const projectLabel =
    projects.length > 1 ? (
      <span
        title={projects.map((p) => `• ${p.name}`).join("\n")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "#FCD34D",
          color: "#0F172A",
          border: "1px solid #FBBF24",
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {projects.length} Projects ⓘ
      </span>
    ) : projects.length === 1 ? (
      projects[0].name
    ) : (
      "—"
    );

  const suiteLabel =
    suites.length > 1 ? (
      <span
        title={suites.map((s) => `• ${s.name}`).join("\n")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "#F5F3FF",
          color: "#7C3AED",
          border: "1px solid #DDD6FE",
          padding: "2px 8px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {suites.length} Suites ⓘ
      </span>
    ) : suites.length === 1 ? (
      suites[0].name
    ) : (
      "—"
    );

  return (
    <tr
      style={{
        cursor: "pointer",
        background: hovered ? "#F8FAFC" : "transparent",
        // Divider baris INSET 16px (tidak menyentuh tepi tabel). Sel beku di
        // bawah menambahkan segmennya sendiri agar garis tetap bersambung.
        ...insetDivider(16, 16),
      }}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 1. Nama Run — kolom BEKU (sticky kiri); shadow sebagai batas area scroll */}
      <td
        style={{
          padding: "0.6rem 1rem",
          fontSize: 12,
          fontWeight: 600,
          color: "#1E293B",
          textAlign: "left",
          ...truncate,
          ...stickyCell(0, frozenBg),
          boxShadow: "2px 0 5px -2px rgba(0, 0, 0, 0.1)",
          // Segmen divider untuk sel beku (menutupi bagian kiri garis baris).
          ...insetDivider(16, 0),
        }}
      >
        {name}
      </td>
      {/* 2. Projects Covered */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>{projectLabel}</td>
      {/* 3. Suites Included */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>{suiteLabel}</td>
      {/* 4. Platform */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>{platforms ?? "—"}</td>
      {/* 5. Status — filled pill hijau solid + ikon centang putih */}
      <td style={{ padding: "0.7rem 0.5rem", textAlign: "center" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 999,
            background: "#059669",
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          <CheckCircle2 size={12} color="#FFFFFF" strokeWidth={3} />
          {runStatusLabel(status)}
        </span>
      </td>
      {/* 6. Sprint */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>{sprint ?? "—"}</td>
      {/* 7. QA */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>
        {qaName ?? "—"}
      </td>
      {/* 8. Execution date */}
      <td style={{ padding: "0.6rem 0.5rem", fontSize: 12, fontWeight: 400, color: "#475569", textAlign: "center", ...truncate }}>
        {new Date(createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
      </td>
      {/* 9. Aksi */}

      <td style={{ padding: "0.6rem 1rem", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <Link
            href={`/test-runs/${id}/report`}
            title="Export Report PDF"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.35rem 0.7rem",
              borderRadius: 6,
              border: "1px solid #E2E8F0",
              background: "#F8FAFC",
              color: "#475569",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <FileText size={12} /> Report
          </Link>
          {extraAction}
        </span>
      </td>
    </tr>
  );
}
