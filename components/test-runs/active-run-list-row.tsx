"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AssigneeSelect } from "@/components/test-runs/assignee-select";
import { RunStatusSelect } from "@/components/test-runs/run-status-select";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";

/**
 * Template kolom list Active Runs — dipakai bersama oleh baris header grup dan
 * baris data supaya kolom selalu sejajar.
 *
 * Name fleksibel (min 260px); sisanya lebar tetap. Kolom Actions hanya muncul
 * saat user boleh mengedit.
 */
export function listGridTemplate(showActions: boolean): string {
  return showActions
    ? "minmax(260px, 1fr) 180px 100px 150px 130px 130px 110px 80px"
    : "minmax(260px, 1fr) 180px 100px 150px 130px 130px 110px";
}

/** Lebar minimum konten (px) agar tabel tetap bisa discroll mendatar. */
export function listMinWidth(showActions: boolean): number {
  return showActions ? 1230 : 1140;
}

/** Label kolom untuk baris header (urutannya sama dengan grid di atas). */
export function listColumnLabels(showActions: boolean): string[] {
  const labels = ["Run", "Projects", "Sprint", "Assignee", "Status", "Progress", "Created"];
  return showActions ? [...labels, "Actions"] : labels;
}

const truncate: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function ActiveRunListRow({
  id,
  runCode,
  name,
  projects,
  sprint,
  status,
  pct,
  assignees,
  executorNames,
  assigneeOptions,
  onAssigneeChange,
  assigneePending,
  createdAt,
  showActions,
  extraAction,
  onStatusChange,
  statusPending,
}: {
  id: string;
  runCode: string;
  name: string;
  projects: { id: string; name: string }[];
  sprint: string | null;
  status: string;
  pct: number;
  /** Penugasan tersimpan (multi-assignee). */
  assignees: { id: string; name: string | null }[];
  executorNames: string[];
  /** Kandidat assignee untuk dropdown. */
  assigneeOptions: { id: string; name: string | null }[];
  /** Bila diberikan, kolom Assignee jadi dropdown multi-select. */
  onAssigneeChange?: (userIds: string[]) => void;
  assigneePending?: boolean;
  createdAt: string;
  showActions: boolean;
  extraAction?: ReactNode;
  /** Bila diberikan, kolom Status jadi dropdown (bukan badge read-only). */
  onStatusChange?: (status: string) => void;
  statusPending?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  // Avatar = assignee tersimpan (bisa banyak); kalau belum ada, pakai eksekutor.
  const avatarNames =
    assignees.length > 0
      ? assignees.map((a) => a.name ?? "(tanpa nama)")
      : executorNames;

  // Progress hijau saat penuh, indigo saat berjalan.
  const progressColor = pct >= 100 ? "#059669" : "#4F46E5";

  // Projects ditampilkan sebagai teks polos (tanpa pill) di kolomnya.
  const projectText =
    projects.length === 0 ? (
      <span style={{ color: "#94A3B8" }}>—</span>
    ) : projects.length === 1 ? (
      <span title={projects[0].name}>{projects[0].name}</span>
    ) : (
      <span title={projects.map((p) => `• ${p.name}`).join("\n")}>
        {projects.length} Projects
      </span>
    );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        window.location.href = `/test-runs/${id}`;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = `/test-runs/${id}`;
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: listGridTemplate(showActions),
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderBottom: "1px solid #CBD5E1",
        background: hovered ? "#F8FAFC" : "transparent",
        cursor: "pointer",
        transition: "background-color 0.12s ease",
      }}
    >
      {/* 1. Run — hanya nama run */}
      <div
        style={{ ...truncate, fontSize: 12, fontWeight: 500, color: "#334155" }}
        title={name}
      >
        {name}
      </div>

      {/* 2. Projects — teks polos */}
      <div style={{ ...truncate, fontSize: 12, fontWeight: 500, color: "#475569" }}>
        {projectText}
      </div>

      {/* 3. Sprint — teks polos */}
      <div style={{ ...truncate, fontSize: 12, fontWeight: 500, color: "#475569" }}>
        {sprint?.trim() ? sprint : <span style={{ color: "#94A3B8" }}>—</span>}
      </div>

      {/* 4. Assignee — avatar stack + chevron dropdown multi-assignee */}
      {onAssigneeChange ? (
        <AssigneeSelect
          assignees={assignees}
          executorNames={executorNames}
          options={assigneeOptions}
          pending={assigneePending}
          onChange={onAssigneeChange}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
          <AvatarStack names={avatarNames} max={3} size={22} />
        </div>
      )}

      {/* 5. Status — dropdown bila bisa diubah, badge bila read-only */}
      <div>
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
      </div>

      {/* 6. Progress / Pass Rate */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 24 }}>
          <ProgressBar value={pct} color={progressColor} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", width: 34 }}>
          {pct}%
        </span>
      </div>

      {/* 7. Created */}
      <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>
        {new Date(createdAt).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </div>

      {/* 8. Actions */}
      {showActions && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{extraAction}</div>
      )}
    </div>
  );
}
