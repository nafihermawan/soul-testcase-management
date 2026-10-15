import Link from "next/link";
import { Info } from "lucide-react";
import { pct } from "@/lib/qa-metrics";
import {
  cardStyle,
  LINE,
  HEAD_BG,
  ROW_DIVIDER,
  MONO,
  LINK,
  LINK_HOVER,
  DANGER,
  fmt,
} from "@/components/reports/report-tokens";
import type { ReportsSuiteGapItem } from "@/types/api";

/** Sel angka: Geist Mono; Belum & Gap lebih tebal. */
const monoCell = { fontFamily: MONO, fontWeight: 500 } as const;

/** Celah coverage per suite: TC yang belum pernah dieksekusi, gap terbesar dulu. */
export function CoverageGapTable({
  suites,
  noExecutionYet,
}: {
  suites: ReportsSuiteGapItem[];
  noExecutionYet: boolean;
}) {
  const rows = [...suites].sort((a, b) => {
    if (b.untested !== a.untested) return b.untested - a.untested;
    return b.total - a.total;
  });

  const th = {
    padding: "11px 10px",
    fontSize: 12,
    fontWeight: 500,
    color: "#64748B",
    textAlign: "right",
    whiteSpace: "nowrap",
  } as const;
  const td = { padding: "12px 10px", verticalAlign: "middle" } as const;

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px" }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: "#0F172A", margin: 0 }}>Celah Coverage per Suite</h2>
      </div>

      {noExecutionYet && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            margin: "0 22px 12px",
            padding: "10px 12px",
            background: "#FFF8E8",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            fontSize: 13,
            color: "#B45309",
            lineHeight: 1.5,
          }}
        >
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <span>
            <strong>Belum ada eksekusi sama sekali.</strong> Seluruh test case di bawah masih
            berstatus belum pernah di-test — angka ini akan turun setelah test run dijalankan dan
            diselesaikan.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: "2.5rem 1.5rem", textAlign: "center", fontSize: 14, color: "#64748B" }}>
          Belum ada suite dengan test case.
        </div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
          <table style={{ width: "100%", minWidth: 760, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 14 }}>
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr style={{ background: HEAD_BG, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
                <th style={{ ...th, textAlign: "left", paddingLeft: 22 }}>Suite</th>
                <th style={th}>TC</th>
                <th style={th}>Tested</th>
                <th style={th}>Belum</th>
                <th style={{ ...th, paddingRight: 22 }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const gapPct = pct(s.untested, s.total);
                return (
                  <tr key={s.suiteId} style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
                    <td style={{ ...td, paddingLeft: 22 }}>
                      <Link
                        href={`/suites/${s.suiteId}`}
                        title={`Buka suite ${s.name}`}
                        onMouseEnter={(e) => (e.currentTarget.style.color = LINK_HOVER)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = LINK)}
                        style={{
                          display: "block",
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
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 12,
                          color: "#64748B",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.projectName}
                      </div>
                    </td>
                    <td style={{ ...td, ...monoCell, color: "#334155" }}>{fmt(s.total)}</td>
                    <td style={{ ...td, ...monoCell, color: s.tested === 0 ? "#94A3B8" : "#334155" }}>
                      {fmt(s.tested)}
                    </td>
                    <td style={{ ...td, fontFamily: MONO, fontWeight: 600, color: "#0F172A" }}>{fmt(s.untested)}</td>
                    <td style={{ ...td, paddingRight: 22, fontFamily: MONO, fontWeight: 600, color: DANGER }}>
                      {gapPct === null ? "—" : `${gapPct}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
