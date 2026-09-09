"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";

export function HistoryRunRow({
  id,
  runCode,
  name,
  projects,
  suites,
  platforms,
  sprint,
  qaName,
  createdAt,
  extraAction,
}: {
  id: string;
  runCode: string;
  name: string;
  projects: { id: string; name: string }[];
  suites: { id: string; name: string }[];
  platforms: string | null;
  sprint: string | null;
  qaName: string | null;
  createdAt: string;
  extraAction?: ReactNode;
}) {
  const projectLabel =
    projects.length > 1 ? (
      <span
        title={projects.map((p) => `• ${p.name}`).join("\n")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "#EFF6FF",
          color: "#2563EB",
          border: "1px solid #BFDBFE",
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
      style={{ borderTop: "1px solid #E2E8F0", cursor: "pointer" }}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* 1. Run ID */}
      <td style={{ padding: "0.7rem 1rem" }}>
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            fontWeight: 700,
            color: "#334155",
          }}
        >
          {runCode}
        </span>
      </td>
      {/* 2. Nama Run */}
      <td style={{ padding: "0.7rem 1rem", fontWeight: 600 }}>{name}</td>
      {/* 3. Projects Covered */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569" }}>{projectLabel}</td>
      {/* 4. Suites Included */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569" }}>{suiteLabel}</td>
      {/* 5. Platform */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569" }}>{platforms ?? "—"}</td>
      {/* 6. Sprint */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569" }}>{sprint ?? "—"}</td>
      {/* QA & Tanggal Execution (terpisah) */}
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
        {qaName ?? "—"}
      </td>
      <td style={{ padding: "0.7rem 0.5rem", color: "#475569", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
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
