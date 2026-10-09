import { Card } from "@/components/ui";

/**
 * Kartu KPI. `value` boleh "—" untuk kondisi tanpa data — sub-label yang
 * menjelaskan alasannya (mis. "No execution yet") wajib diisi di kasus itu.
 * `accent` = warna garis atas (aksen visual per metrik).
 * `dot` = gaya alternatif yang lebih bersih: tanpa garis atas, warna aksen
 * dipindah ke indicator dot kecil di dalam kartu.
 */
export function KpiCard({
  label,
  value,
  sub,
  accent = "#E2E8F0",
  dot,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  /** Warna aksen top-border kartu (mis. sky untuk Coverage, amber untuk Pass Rate). */
  accent?: string;
  /** Warna indicator dot; bila diisi, garis aksen atas tidak dirender. */
  dot?: string;
  /** Padding vertikal lebih rapat — untuk deretan kartu statistik yang ringkas. */
  compact?: boolean;
}) {
  return (
    <Card
      style={{
        padding: compact ? "0.75rem 1rem" : "1rem",
        height: "100%",
        ...(dot ? {} : { borderTop: `3px solid ${accent}` }),
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {dot && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: dot,
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 12, fontWeight: 500, color: "#64748B" }}>{label}</span>
        </div>
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
              fontSize: dot ? 11 : 12,
              fontWeight: 400,
              color: dot ? "#94A3B8" : "#64748B",
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
