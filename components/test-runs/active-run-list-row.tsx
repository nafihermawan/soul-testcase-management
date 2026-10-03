"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { FolderOpen, Tag } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AssigneeSelect } from "@/components/test-runs/assignee-select";
import { RunStatusSelect } from "@/components/test-runs/run-status-select";
import {
  TestRunStatusBadge,
  runStatusConfig,
  runStatusIcon,
} from "@/components/test-runs/test-run-status-badge";

/**
 * Template kolom list Active Runs — dipakai bersama oleh baris header grup dan
 * baris data supaya kolom selalu sejajar.
 *
 * Name fleksibel (min 260px); sisanya lebar tetap. Kolom Actions hanya muncul
 * saat user boleh mengedit.
 */
export function listGridTemplate(showActions: boolean): string {
  return showActions
    ? "minmax(260px, 1fr) 180px 150px 130px 130px 110px 80px"
    : "minmax(260px, 1fr) 180px 150px 130px 130px 110px";
}

/** Lebar minimum konten (px) agar tabel tetap bisa discroll mendatar. */
export function listMinWidth(showActions: boolean): number {
  return showActions ? 1120 : 1030;
}

/** Label kolom untuk baris header (urutannya sama dengan grid di atas). */
export function listColumnLabels(showActions: boolean): string[] {
  const labels = ["Run", "Projects", "Assignee", "Status", "Progress", "Created"];
  return showActions ? [...labels, ""] : labels;
}

/** Pill kecil untuk metadata (jumlah suite, sprint). */
function MiniPill({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.6,
        background: "#F1F5F9",
        color: "#475569",
        border: "1px solid #E2E8F0",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {children}
    </span>
  );
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
  suites,
  sprint,
  status,
  pct,
  assignee,
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
  suites: { id: string; name: string }[];
  sprint: string | null;
  status: string;
  pct: number;
  assignee: { id: string; name: string | null } | null;
  executorNames: string[];
  /** Kandidat assignee untuk dropdown. */
  assigneeOptions: { id: string; name: string | null }[];
  /** Bila diberikan, kolom Assignee jadi dropdown (bukan avatar statis). */
  onAssigneeChange?: (assigneeId: string | null) => void;
  assigneePending?: boolean;
  createdAt: string;
  showActions: boolean;
  extraAction?: ReactNode;
  /** Bila diberikan, kolom Status jadi dropdown (bukan badge read-only). */
  onStatusChange?: (status: string) => void;
  statusPending?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const cfg = runStatusConfig(status);
  const StatusIcon = runStatusIcon(status);

  // Avatar = assignee tersimpan; kalau belum ada, pakai eksekutor (bisa banyak).
  const avatarNames = assignee?.name ? [assignee.name] : executorNames;

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
      {/* 1. Run — ikon status, judul, mini-badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <StatusIcon size={16} color={cfg.color} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{ ...truncate, fontSize: 12, fontWeight: 500, color: "#334155" }}
            title={name}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
              minWidth: 0,
            }}
          >
            <MiniPill icon={<FolderOpen size={11} />} title="Jumlah suite">
              {suites.length}
            </MiniPill>
            {sprint && (
              <MiniPill icon={<Tag size={11} />} title="Sprint">
                {sprint}
              </MiniPill>
            )}
          </div>
        </div>
      </div>

      {/* 2. Projects — teks polos */}
      <div style={{ ...truncate, fontSize: 12, fontWeight: 500, color: "#475569" }}>
        {projectText}
      </div>

      {/* 3. Assignee — avatar stack (+ dropdown saat boleh edit) */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AvatarStack names={avatarNames} max={3} size={22} />
        {onAssigneeChange && (
          <AssigneeSelect
            assigneeId={assignee?.id ?? ""}
            assigneeName={assignee?.name ?? null}
            executorNames={executorNames}
            options={assigneeOptions}
            pending={assigneePending}
            maxWidth={84}
            onChange={onAssigneeChange}
          />
        )}
      </div>

      {/* 4. Status — dropdown bila bisa diubah, badge bila read-only */}
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

      {/* 5. Progress / Pass Rate */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 24 }}>
          <ProgressBar value={pct} color={progressColor} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", width: 34 }}>
          {pct}%
        </span>
      </div>

      {/* 6. Created */}
      <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>
        {new Date(createdAt).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </div>

      {/* 7. Actions */}
      {showActions && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{extraAction}</div>
      )}
    </div>
  );
}
