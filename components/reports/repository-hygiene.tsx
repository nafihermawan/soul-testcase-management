import Link from "next/link";
import { Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatPct } from "@/lib/qa-metrics";
import type { ReportsPayload } from "@/types/api";
import { Layers, Link2Off, Sparkles } from "lucide-react";

function HygieneBlock({
  icon,
  title,
  count,
  emptyText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title={title}
        action={
          count > 0 ? (
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-muted)",
              }}
            >
              {count}
            </span>
          ) : undefined
        }
      />
      {count === 0 ? (
        <EmptyState icon={icon} title="Bersih" subtext={emptyText} />
      ) : (
        <div style={{ padding: "0.75rem 1.25rem", overflowY: "auto", maxHeight: 260 }}>{children}</div>
      )}
    </Card>
  );
}

/** Higienitas repository: celah struktural yang tidak terlihat di laporan coverage. */
export function RepositoryHygiene({
  suitesWithoutTc,
  orphanTc,
  automation,
}: {
  suitesWithoutTc: ReportsPayload["suitesWithoutTc"];
  orphanTc: ReportsPayload["orphanTc"];
  automation: ReportsPayload["automation"];
}) {
  const hasAutomation = automation.automated > 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "1.5rem",
        alignItems: "stretch",
      }}
    >
      <HygieneBlock
        icon={<Layers size={22} />}
        title="Suite Tanpa Test Case"
        count={suitesWithoutTc.length}
        emptyText="Semua suite sudah punya test case."
      >
        {suitesWithoutTc.map((s) => (
          <div
            key={s.suiteId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.45rem 0",
              borderBottom: "1px solid var(--border)",
              fontSize: "0.8rem",
            }}
          >
            <Link
              href={`/suites/${s.suiteId}`}
              style={{ fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
            >
              {s.name}
            </Link>
            <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.74rem" }}>
              {s.projectName}
            </span>
          </div>
        ))}
      </HygieneBlock>

      <HygieneBlock
        icon={<Link2Off size={22} />}
        title="Test Case Tanpa Suite"
        count={orphanTc.length}
        emptyText="Semua test case terhubung ke suite."
      >
        {orphanTc.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.1rem",
              padding: "0.45rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "0.72rem",
                color: "#4B5563",
              }}
            >
              {t.tcId}
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={t.title}
            >
              {t.title}
            </span>
          </div>
        ))}
      </HygieneBlock>

      <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <PanelHeader title="Cakupan Otomasi" />
        <div
          style={{
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            justifyContent: "center",
            flex: 1,
          }}
        >
          {hasAutomation ? (
            <>
              <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                {formatPct(automation.pct)}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {automation.automated.toLocaleString("id-ID")} test case ter-automate
              </div>
            </>
          ) : (
            <>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                <Sparkles size={15} /> Belum ada data otomasi
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Belum ada test case yang di-link ke skrip otomasi, jadi persentase otomasi belum
                bisa dihitung.
              </span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
