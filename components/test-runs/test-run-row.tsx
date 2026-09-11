"use client";

import type { ReactNode } from "react";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import { RunStatusSelect } from "@/components/test-runs/run-status-select";

export function TestRunRow({
  id,
  runCode,
  name,
  projects,
  suites,
  sprint,
  status,
  pct,
  createdByName,
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
  sprint: string | null;
  status: string;
  pct: number;
  createdByName: string | null;
  createdAt: string;
  extraAction?: ReactNode;
  /** Bila diberikan, kolom Status jadi dropdown (bukan badge read-only). */
  onStatusChange?: (status: string) => void;
  statusPending?: boolean;
}) {
  return (
    <tr
      style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* 1. Run ID */}
      <td style={{ padding: "0.6rem 1rem" }}>
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 13,
            fontWeight: 600,
            color: "#475569",
          }}
        >
          {runCode}
        </span>
      </td>
      {/* 2. Nama Run */}
      <td style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>{name}</td>
      {/* 3. Projects Covered */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
        {projects.length === 1 ? (
          projects[0].name
        ) : projects.length > 1 ? (
          <span title={projects.map((p) => `• ${p.name}`).join("\n")}>
            {projects.length} Projects
          </span>
        ) : (
          "—"
        )}
      </td>
      {/* 4. Suites Included */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
        {suites.length === 1 ? (
          suites[0].name
        ) : suites.length > 1 ? (
          <span title={suites.map((s) => `• ${s.name}`).join("\n")}>
            {suites.length} Suites
          </span>
        ) : (
          "—"
        )}
      </td>
      {/* 5. Sprint */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
        {sprint ?? "—"}
      </td>
      {/* 6. Status — dropdown bila bisa diubah, badge bila read-only */}
      <td style={{ padding: "0.6rem 0.5rem" }}>
        {onStatusChange ? (
          <RunStatusSelect
            runCode={runCode}
            status={status}
            pending={statusPending}
            onChange={onStatusChange}
          />
        ) : (
          <TestRunStatusBadge status={status} />
        )}
      </td>
      {/* 7. Pass Rate */}
      <td style={{ padding: "0.6rem 0.5rem", fontWeight: 700 }}>{pct}%</td>
      {/* 8. Dibuat Oleh */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
        {createdByName ?? "—"}
      </td>
      {/* 9. Tanggal */}
      <td style={{ padding: "0.6rem 1rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {new Date(createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
      </td>
      {extraAction && (
        <td style={{ padding: "0.6rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
          {extraAction}
        </td>
      )}
    </tr>
  );
}
