import { Badge } from "@/components/ui";
import { HEALTH_META, type Health } from "@/lib/qa-metrics";

/** Indikator ringkas kesehatan QA: Healthy / Attention Needed / Critical / No Data. */
export function TestingHealth({ health }: { health: Health }) {
  const meta = HEALTH_META[health];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        Testing Health
      </span>
      <Badge tone={meta.tone}>{meta.label}</Badge>
      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{meta.hint}</span>
    </div>
  );
}
