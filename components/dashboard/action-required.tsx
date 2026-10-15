import Link from "next/link";
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

/**
 * Daftar tindakan yang perlu diambil — hanya item dengan count > 0 yang tampil.
 * Tanpa kartu/judul sendiri; di-embed ke kartu terpadu "Health & Action".
 */
export function ActionRequiredList({ items }: { items: ActionItem[] }) {
  const visible = items.filter((i) => i.count > 0);

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 size={22} />}
        title="All clear"
        subtext="No items need attention right now."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {visible.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            // Tanpa garis pemisah penuh: cukup padding vertikal tipis.
            padding: "0.5rem 1rem",
          }}
        >
          {/* Angka polos berwarna — tanpa background/border pill. */}
          <span
            style={{
              minWidth: 30,
              fontWeight: 800,
              fontSize: "0.9rem",
              color: toneText[item.tone],
              flexShrink: 0,
            }}
          >
            {item.count.toLocaleString("en-US")}
          </span>
          <span style={{ fontSize: "0.84rem", color: "var(--text)", minWidth: 0 }}>
            {item.label}
          </span>
          <Link
            href={item.href}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 400,
              color: "#2563EB",
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1D4ED8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#2563EB")}
          >
            {item.cta} →
          </Link>
        </div>
      ))}
    </div>
  );
}
