"use client";

/** Bar tipis untuk progress / pass rate (0–100). */
export function ProgressBar({
  value,
  color = "#4F46E5",
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        display: "block",
        width: "100%",
        height,
        borderRadius: 999,
        background: "#E2E8F0",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "block",
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
          transition: "width 0.2s ease",
        }}
      />
    </span>
  );
}
