"use client";

import {
  CheckCircle2,
  Circle,
  CircleDashed,
  FileEdit,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { RUN_STATUS_LABEL } from "@/lib/run-status";

type StatusConfig = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: LucideIcon;
};

const statusConfig: Record<string, StatusConfig> = {
  PENDING: {
    label: RUN_STATUS_LABEL.PENDING,
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    icon: Circle,
  },
  IN_PROGRESS: {
    label: RUN_STATUS_LABEL.IN_PROGRESS,
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    icon: CircleDashed,
  },
  COMPLETED: {
    label: RUN_STATUS_LABEL.COMPLETED,
    color: "#047857",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    icon: CheckCircle2,
  },
  RE_OPEN: {
    label: RUN_STATUS_LABEL.RE_OPEN,
    color: "#1D4ED8",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    icon: RotateCcw,
  },
  DRAFT: {
    label: "Draft",
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
    icon: FileEdit,
  },
  ABORTED: {
    label: "Aborted",
    color: "#BE123C",
    bg: "#FFF1F2",
    border: "#FECDD3",
    icon: XCircle,
  },
};

const FALLBACK: StatusConfig = {
  label: "—",
  color: "#475569",
  bg: "#F1F5F9",
  border: "#E2E8F0",
  icon: Circle,
};

/** Konfigurasi warna/ikon sebuah status (dipakai lintas komponen run). */
export function runStatusConfig(status: string): StatusConfig {
  return statusConfig[status] ?? { ...FALLBACK, label: status };
}

/** Label tampilan untuk status run (dipakai juga di luar komponen badge). */
export function runStatusLabel(status: string): string {
  return runStatusConfig(status).label;
}

/** Ikon status — untuk indikator ringkas di kolom Name. */
export function runStatusIcon(status: string): LucideIcon {
  return runStatusConfig(status).icon;
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
