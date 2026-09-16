"use client";

import type { CSSProperties, ReactNode } from "react";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import { RunStatusSelect } from "@/components/test-runs/run-status-select";
import { Select } from "@/components/ui/select";

/** Isi sel tabel: satu baris, kelebihan teks dipotong elipsis. */
const truncate: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

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
  assignee,
  executorNames,
  assigneeOptions,
  onAssigneeChange,
  assigneePending,
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
  /** Assignee tersimpan; null = belum ditugaskan. */
  assignee: { id: string; name: string | null } | null;
  /** Fallback saat belum di-assign: QA yang benar-benar mengeksekusi. */
  executorNames: string[];
  /** Kandidat assignee untuk dropdown. */
  assigneeOptions: { id: string; name: string | null }[];
  /** Bila diberikan, kolom Assignee jadi dropdown (bukan teks statis). */
  onAssigneeChange?: (assigneeId: string | null) => void;
  assigneePending?: boolean;
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
      <td style={{ padding: "0.6rem 1rem", fontWeight: 600, ...truncate }}>{name}</td>
      {/* 3. Projects Covered */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)", ...truncate }}>
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
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)", ...truncate }}>
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
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)", ...truncate }}>
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
      {/* 8. Created By — pembuat run (bukan eksekutor) */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)", ...truncate }}>
        {createdByName ?? "—"}
      </td>
      {/* 9. Assignee — dropdown bila boleh edit; teks statis bila read-only.
          Fallback: kalau belum di-assign, pakai eksekutor hasil eksekusi. */}
      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)", ...truncate }}>
        {onAssigneeChange ? (
          <AssigneeSelect
            assigneeId={assignee?.id ?? ""}
            assigneeName={assignee?.name ?? null}
            executorNames={executorNames}
            options={assigneeOptions}
            pending={assigneePending}
            onChange={onAssigneeChange}
          />
        ) : assignee ? (
          assignee.name ?? "—"
        ) : executorNames.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ) : executorNames.length === 1 ? (
          executorNames[0]
        ) : (
          <span title={executorNames.map((n) => `• ${n}`).join("\n")}>
            {executorNames.length} Tester
          </span>
        )}
      </td>
      {/* 10. Tanggal */}
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

/**
 * Dropdown assignee inline di kolom Assignee.
 *
 * Kalau run belum punya assignee tersimpan, nilainya diambil dari eksekutor
 * hasil eksekusi — hanya bila eksekutornya satu orang dan orang itu ada di
 * daftar QA. Jadi kolom tetap informatif untuk data lama, dan begitu QA memilih
 * sendiri, nilai tersimpan yang dipakai.
 */
function AssigneeSelect({
  assigneeId,
  assigneeName,
  executorNames,
  options,
  pending,
  onChange,
}: {
  assigneeId: string;
  assigneeName: string | null;
  executorNames: string[];
  options: { id: string; name: string | null }[];
  pending?: boolean;
  onChange: (assigneeId: string | null) => void;
}) {
  const derivedId =
    !assigneeId && executorNames.length === 1
      ? options.find((o) => o.name === executorNames[0])?.id ?? ""
      : "";
  const value = assigneeId || derivedId;
  const isFallback = !assigneeId && derivedId !== "";

  // Assignee lama bisa saja sudah tidak ber-role QA, jadi tetap disertakan
  // supaya dropdown tidak kehilangan nilainya.
  const list =
    assigneeId && !options.some((o) => o.id === assigneeId)
      ? [{ id: assigneeId, name: assigneeName }, ...options]
      : options;

  return (
    <span
      style={{
        display: "inline-flex",
        width: "100%",
        minWidth: 0,
        // Batas lebar pasti supaya dropdown tidak menabrak kolom Created Date.
        maxWidth: 140,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Select
        size="sm"
        value={value}
        disabled={pending}
        title={
          isFallback
            ? `Belum di-assign — dari hasil eksekusi: ${executorNames.join(", ")}`
            : "Ubah assignee"
        }
        ariaLabel="Ubah assignee"
        // Menyatu dengan baris tabel: tanpa border, hanya teks + chevron.
        // Penanda fokus tetap ada lewat ring dari komponen Select.
        style={{
          border: "none",
          background: isFallback ? "#FFFBEB" : "transparent",
          color: isFallback ? "#B45309" : "#334155",
          paddingLeft: 4,
        }}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Belum ditugaskan —</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ?? "(tanpa nama)"}
          </option>
        ))}
      </Select>
    </span>
  );
}
