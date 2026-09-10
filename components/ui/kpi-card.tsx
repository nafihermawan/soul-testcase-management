import { Card } from "@/components/ui";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneColor: Record<Tone, string | undefined> = {
  neutral: undefined,
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  brand: "var(--brand-600)",
};

/**
 * Kartu KPI. `value` boleh "—" untuk kondisi tanpa data — sub-label yang
 * menjelaskan alasannya (mis. "No execution yet") wajib diisi di kasus itu.
 */
export function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <Card style={{ padding: "1.25rem", height: "100%" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: "1.7rem",
            fontWeight: 800,
            marginTop: "0.2rem",
            lineHeight: 1.2,
            color: toneColor[tone],
          }}
        >
          {value}
        </div>
        {sub && (
          <div
            style={{
              fontSize: "0.76rem",
              color: "var(--text-muted)",
              marginTop: "0.15rem",
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
