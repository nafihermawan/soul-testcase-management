import Link from "next/link";
import {
  cardStyle,
  SANS,
  ROW_DIVIDER,
  LINK,
  LINK_HOVER,
  numMono,
  fmt,
} from "@/components/reports/report-tokens";
import type { ReportsPayload } from "@/types/api";

const H2 = { fontSize: 17, fontWeight: 600, color: "#0F172A", margin: 0 } as const;

/** Higienitas repository: celah struktural yang tidak terlihat di laporan coverage. */
export function RepositoryHygiene({
  suitesWithoutTc,
  automation,
}: {
  suitesWithoutTc: ReportsPayload["suitesWithoutTc"];
  automation: ReportsPayload["automation"];
}) {
  const hasAutomation = automation.automated > 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
      {/* 8a. Suite Tanpa Test Case */}
      <section
        style={{
          ...cardStyle,
          flex: "1 1 520px",
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px 12px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h2 style={H2}>Suite Tanpa Test Case</h2>
          <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>
            <span style={{ ...numMono, color: "#0F172A" }}>{fmt(suitesWithoutTc.length)}</span> suite
          </span>
        </div>

        <div style={{ padding: "0 22px 10px" }}>
          {suitesWithoutTc.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
              Semua suite sudah punya test case.
            </div>
          ) : (
            suitesWithoutTc.map((s) => (
              <div
                key={s.suiteId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderTop: `1px solid ${ROW_DIVIDER}`,
                }}
              >
                <Link
                  href={`/suites/${s.suiteId}`}
                  title={`Buka suite ${s.name}`}
                  onMouseEnter={(e) => (e.currentTarget.style.color = LINK_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = LINK)}
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: LINK,
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name}
                </Link>
                <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {s.projectName}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 8b. Cakupan Otomasi */}
      <section
        style={{
          ...cardStyle,
          flex: "1 1 520px",
          minWidth: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "18px 22px 12px" }}>
          <h2 style={H2}>Cakupan Otomasi</h2>
        </div>

        <div style={{ padding: "0 22px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
          {hasAutomation ? (
            <>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 32,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  color: "#0F172A",
                }}
              >
                {automation.pct === null ? "—" : `${automation.pct}%`}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#64748B" }}>
                {fmt(automation.automated)} test case ter-automate
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 120,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 6,
                padding: "1.5rem",
                border: "1px dashed #DDE2E9",
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 13, color: "#94A3B8" }}>Belum ada data otomasi</span>
              <span style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.5 }}>
                Belum ada test case yang di-link ke skrip otomasi, jadi persentase otomasi belum bisa
                dihitung.
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
