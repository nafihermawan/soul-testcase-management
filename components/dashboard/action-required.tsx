import Link from "next/link";
import { Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CheckCircle2 } from "lucide-react";

export type ActionItem = {
  key: string;
  count: number;
  label: string;
  cta: string;
  href: string;
  tone: "danger" | "warning" | "info" | "brand";
};

const toneStyle: Record<ActionItem["tone"], { bg: string; color: string; border?: string }> = {
  danger: { bg: "var(--danger-bg)", color: "var(--danger)" },
  warning: { bg: "var(--warning-bg)", color: "#B45309" },
  info: { bg: "var(--info-bg)", color: "var(--info)" },
  // Kontras tinggi: badge solid untuk angka yang paling butuh perhatian.
  brand: { bg: "#FFB622", color: "#1F2937", border: "1px solid #E0A01E" },
};

/** Daftar tindakan yang perlu diambil — hanya item dengan count > 0 yang tampil. */
export function ActionRequired({ items }: { items: ActionItem[] }) {
  const visible = items.filter((i) => i.count > 0);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Action Required" />
      {visible.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title="All clear"
          subtext="Tidak ada item yang butuh tindakan saat ini."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visible.map((item, idx) => {
            const tone = toneStyle[item.tone];
            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.7rem 1.25rem",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    minWidth: 28,
                    height: 24,
                    padding: "0 0.4rem",
                    borderRadius: 6,
                    background: tone.bg,
                    color: tone.color,
                    border: tone.border,
                    fontWeight: 800,
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {item.count.toLocaleString("id-ID")}
                </span>
                <span style={{ fontSize: "0.84rem", color: "var(--text)", minWidth: 0 }}>
                  {item.label}
                </span>
                <Link
                  href={item.href}
                  style={{
                    marginLeft: "auto",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#2563EB",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {item.cta} →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
