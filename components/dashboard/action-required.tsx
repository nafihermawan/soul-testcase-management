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

/** Warna angka per tone — teks polos, tanpa pill/box. */
const toneText: Record<ActionItem["tone"], string> = {
  danger: "var(--danger)",
  warning: "#B45309",
  info: "var(--info)",
  brand: "var(--brand-600)",
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
          {visible.map((item, idx) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.8rem 1.25rem",
                borderTop: idx === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              {/* Angka polos berwarna — tanpa background/border pill. */}
              <span
                style={{
                  minWidth: 34,
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: toneText[item.tone],
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
          ))}
        </div>
      )}
    </Card>
  );
}
