"use client";

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  IN_PROGRESS: {
    label: "In Progress",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  COMPLETED: {
    label: "Completed",
    color: "#047857",
    bg: "#ECFDF5",
    border: "#A7F3D0",
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

export function TestRunStatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = statusConfig[status] ?? {
    label: status,
    color: "#475569",
    bg: "#F1F5F9",
    border: "#E2E8F0",
  };
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
