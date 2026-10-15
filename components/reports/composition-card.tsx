import { cardStyle, numMono, ROW_DIVIDER, fmt } from "@/components/reports/report-tokens";
import type { ReportsCompositionItem } from "@/types/api";

function Square({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
    />
  );
}

/**
 * Bar komposisi (priority / status): satu bar tersegmentasi + legend list.
 * Lebar segmen = persentase tiap item; item bernilai 0 tidak dapat segmen.
 */
export function CompositionCard({
  title,
  caption,
  items,
  colors,
}: {
  title: string;
  /** Keterangan kanan header, mis. "1.482 test case". */
  caption: string;
  items: ReportsCompositionItem[];
  colors: Record<string, string>;
}) {
  const segments = items.filter((i) => i.count > 0);

  return (
    <section
      style={{
        ...cardStyle,
        flex: "1 1 520px",
        minWidth: 0,
        padding: "18px 22px 20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: "#0F172A", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>{caption}</span>
      </div>

      {/* Bar tersegmentasi: ujung luar membulat penuh, sudut dalam radius 3px. */}
      <div style={{ display: "flex", gap: 3, height: 10 }}>
        {segments.map((s, i) => {
          const first = i === 0;
          const last = i === segments.length - 1;
          const radius = first && last ? 999 : first ? "999px 3px 3px 999px" : last ? "3px 999px 999px 3px" : 3;
          return (
            <div
              key={s.key}
              style={{
                flexGrow: s.pct ?? 0,
                flexBasis: 0,
                minWidth: 2,
                background: colors[s.key] ?? "#94A3B8",
                borderRadius: radius,
              }}
            />
          );
        })}
      </div>

      {/* Legend list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item, i) => (
          <div
            key={item.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              fontSize: 14,
              borderBottom: i < items.length - 1 ? `1px solid ${ROW_DIVIDER}` : "none",
            }}
          >
            <Square color={colors[item.key] ?? "#94A3B8"} />
            <span style={{ flex: 1, color: "#334155" }}>{item.label}</span>
            <span style={{ ...numMono, color: item.count > 0 ? "#0F172A" : "#94A3B8" }}>{fmt(item.count)}</span>
            <span style={{ width: 48, textAlign: "right", fontSize: 13, color: "#64748B" }}>
              {item.pct === null ? "—" : `${item.pct}%`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
