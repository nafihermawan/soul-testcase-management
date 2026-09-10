import { Card, PanelHeader } from "@/components/ui";
import { formatPct } from "@/lib/qa-metrics";
import type { ReportsCompositionItem } from "@/types/api";

/** Bar komposisi (priority / status) — dipakai ulang untuk kedua dimensi. */
export function CompositionCard({
  title,
  hint,
  items,
  colors,
}: {
  title: string;
  /** Keterangan kecil di header, mis. saat angkanya tidak mengikuti filter. */
  hint?: string;
  items: ReportsCompositionItem[];
  colors: Record<string, string>;
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title={title}
        action={
          hint ? (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{hint}</span>
          ) : undefined
        }
      />
      <div
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.7rem",
        }}
      >
        {items.map((item) => {
          const color = colors[item.key] ?? "var(--brand-500)";
          // Bar relatif terhadap nilai terbesar agar perbedaan tetap terbaca.
          const barWidth = (item.count / maxCount) * 100;
          return (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                style={{
                  width: 84,
                  flexShrink: 0,
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 60,
                  height: 8,
                  borderRadius: 999,
                  background: "var(--surface-muted)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${barWidth}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 999,
                  }}
                />
              </span>
              <span
                style={{
                  width: 48,
                  textAlign: "right",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  flexShrink: 0,
                }}
              >
                {item.count.toLocaleString("id-ID")}
              </span>
              <span
                style={{
                  width: 44,
                  textAlign: "right",
                  color: "var(--text-muted)",
                  fontSize: "0.78rem",
                  flexShrink: 0,
                }}
              >
                {formatPct(item.pct)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
