import { CSSProperties } from "react";

/* ---------- Card ---------- */
export function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Badge ---------- */
const badgeTones: Record<string, { color: string; bg: string }> = {
  success: { color: "var(--success)", bg: "var(--success-bg)" },
  warning: { color: "var(--warning)", bg: "var(--warning-bg)" },
  danger: { color: "var(--danger)", bg: "var(--danger-bg)" },
  info: { color: "var(--info)", bg: "var(--info-bg)" },
  brand: { color: "var(--brand-600)", bg: "var(--brand-100)" },
  neutral: { color: "var(--text-secondary)", bg: "var(--surface-muted)" },
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: React.ReactNode;
}) {
  const t = badgeTones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 600,
        color: t.color,
        background: t.bg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({
  value,
  color = "var(--brand-500)",
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 999,
        background: "var(--surface-muted)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, value))}%`,
          borderRadius: 999,
          background: color,
        }}
      />
    </div>
  );
}

/* ---------- Sparkline ---------- */
export function Sparkline({
  points,
  color = "var(--brand-500)",
  width = 96,
  height = 32,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - 4 - ((p - min) / range) * (height - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- DonutChart ---------- */
export function DonutChart({
  segments,
  size = 180,
  thickness = 22,
  centerLabel,
  centerSub,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const dashOffset = -offset;
          offset += len;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </g>
      {centerLabel && (
        <>
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 26, fontWeight: 700, fill: "var(--text)" }}>
            {centerLabel}
          </text>
          {centerSub && (
            <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12, fill: "var(--text-muted)" }}>
              {centerSub}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

/* ---------- Panel header ---------- */
export function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.25rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>{title}</h3>
      {action}
    </div>
  );
}
