"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";
import { RunStatusSelect } from "@/components/test-runs/run-status-select";
import { STICKY_ID_WIDTH } from "@/components/test-runs/run-list-columns";

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

export function HistoryRunRow({
  id,
  runCode,
  name,
  projects,
  suites,
  platforms,
  sprint,
  status,
  qaName,
  createdAt,
  extraAction,
  onStatusChange,
  statusPending,
}: {
  id: string;
  runCode: string;
  name: string;
  projects: { id: string; name: string }[];
  suites: { id: string; name: string }[];
  platforms: string | null;
  sprint: string | null;
  status: string;
  qaName: string | null;
  createdAt: string;
  extraAction?: ReactNode;
  /** Bila diberikan, kolom Status jadi dropdown (untuk membuka run lagi). */
  onStatusChange?: (status: string) => void;
  statusPending?: boolean;
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
        borderTop: "1px solid #E2E8F0",
        cursor: "pointer",
        background: hovered ? "#F8FAFC" : "transparent",
      }}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 1. Run ID — kolom BEKU (sticky kiri) */}
      <td style={{ padding: "0.7rem 1rem", ...stickyCell(0, frozenBg) }}>
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            fontWeight: 400,
            color: "#64748B",
          }}
        >
          {runCode}
        </span>
      </td>
      {/* 2. Nama Run — kolom BEKU kedua; diberi shadow sebagai batas area scroll */}
      <td
        style={{
          padding: "0.7rem 1rem",
          fontWeight: 700,
          color: "#0F172A",
          ...truncate,
          ...stickyCell(STICKY_ID_WIDTH, frozenBg),
          boxShadow: "2px 0 5px -2px rgba(0, 0, 0, 0.1)",
        }}
      >
        {name}
      </td>
      {/* 3. Projects Covered */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", ...truncate }}>{projectLabel}</td>
      {/* 4. Suites Included */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", ...truncate }}>{suiteLabel}</td>
      {/* 5. Platform */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", ...truncate }}>{platforms ?? "—"}</td>
      {/* 6. Status — dropdown bila boleh diubah (mis. buka lagi run selesai) */}
      <td style={{ padding: "0.7rem 0.5rem" }}>
        {onStatusChange ? (
          <RunStatusSelect
            runCode={runCode}
            status={status}
            pending={statusPending}
            onChange={onStatusChange}
          />
        ) : (
          <span style={{ fontSize: "0.78rem", color: "#475569" }}>{status}</span>
        )}
      </td>
      {/* 7. Sprint */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", ...truncate }}>{sprint ?? "—"}</td>
      {/* QA & Tanggal Execution (terpisah) */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", fontSize: "0.82rem", ...truncate }}>
        {qaName ?? "—"}
      </td>
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", fontSize: "0.82rem", ...truncate }}>
        {new Date(createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
      </td>
      {/* 10. Aksi */}

      <td style={{ padding: "0.7rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
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
              fontSize: "0.78rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <FileText size={13} /> Report
          </Link>
          {extraAction}
        </span>
      </td>
    </tr>
  );
}
