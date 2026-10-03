"use client";

import { RUN_STATUS_LABEL } from "@/lib/run-status";

type StatusConfig = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

const statusConfig: Record<string, StatusConfig> = {
  PENDING: {
    label: RUN_STATUS_LABEL.PENDING,
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
  },
  IN_PROGRESS: {
    label: RUN_STATUS_LABEL.IN_PROGRESS,
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  COMPLETED: {
    label: RUN_STATUS_LABEL.COMPLETED,
    color: "#047857",
    bg: "#ECFDF5",
    border: "#A7F3D0",
  },
  RE_OPEN: {
    label: RUN_STATUS_LABEL.RE_OPEN,
    color: "#1D4ED8",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  DRAFT: {
    label: "Draft",
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
  },
  ABORTED: {
    label: "Aborted",
    color: "#BE123C",
    bg: "#FFF1F2",
    border: "#FECDD3",
  },
};

const FALLBACK: StatusConfig = {
  label: "—",
  color: "#475569",
  bg: "#F1F5F9",
  border: "#E2E8F0",
};

/** Konfigurasi warna sebuah status + label fallback ke nilai status itu sendiri. */
function runStatusConfig(status: string): StatusConfig {
  return statusConfig[status] ?? { ...FALLBACK, label: status };
}

/** Label tampilan untuk status run (dipakai juga di luar komponen badge). */
export function runStatusLabel(status: string): string {
  return runStatusConfig(status).label;
}

export function TestRunStatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = runStatusConfig(status);
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}
