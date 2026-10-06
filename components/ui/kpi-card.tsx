import { Card } from "@/components/ui";

/**
 * Kartu KPI. `value` boleh "—" untuk kondisi tanpa data — sub-label yang
 * menjelaskan alasannya (mis. "No execution yet") wajib diisi di kasus itu.
 * `accent` = warna garis atas (aksen visual per metrik).
 */
export function KpiCard({
  label,
  value,
  sub,
  accent = "#E2E8F0",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Warna aksen top-border kartu (mis. sky untuk Coverage, amber untuk Pass Rate). */
  accent?: string;
}) {
  return (
    <Card style={{ padding: "1.25rem", height: "100%", borderTop: `3px solid ${accent}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#64748B" }}>{label}</div>
        <div
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            marginTop: "0.3rem",
            lineHeight: 1.2,
            color: "#1E293B",
          }}
        >
          {value}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#64748B",
              marginTop: "0.25rem",
              lineHeight: 1.4,
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </Card>
  );
}
