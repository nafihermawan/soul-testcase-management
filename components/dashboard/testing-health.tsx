import { HEALTH_META, type Health } from "@/lib/qa-metrics";

/** Warna indikator per tone (dipakai teks + titik, tanpa pill). */
const TONE_COLOR: Record<string, string> = {
  success: "var(--success)",
  warning: "#B45309",
  danger: "var(--danger)",
  neutral: "var(--text-muted)",
};

/**
 * Indikator kesehatan QA — teks minimalis (titik warna + label), tanpa pill
 * badge. Dipakai di dalam card sidebar, jadi judulnya disediakan PanelHeader.
 */
export function TestingHealth({ health }: { health: Health }) {
  const meta = HEALTH_META[health];
  const color = TONE_COLOR[meta.tone] ?? "var(--text-muted)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          fontSize: "0.95rem",
          fontWeight: 700,
          color,
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }}
        />
        {meta.label}
      </span>
      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {meta.hint}
      </span>
    </div>
  );
}
