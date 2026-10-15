"use client";

import type { CSSProperties } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bug,
  ExternalLink,
  Play,
  SlidersHorizontal,
} from "lucide-react";

/* ------------------------------- Tokens ------------------------------- */

const SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';

/** Gaya angka bersama: Geist Mono 600, tracking rapat, tinggi baris 1. */
const num: CSSProperties = {
  fontFamily: MONO,
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1,
};

/** Label aksesibilitas yang disembunyikan secara visual. */
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Kartu utama: putih, border #E3E7EE, radius 18, isi tidak menyembul. */
const CARD: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E3E7EE",
  borderRadius: 18,
  overflow: "hidden",
};

const CARD_TITLE: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: "#0F172A",
  margin: 0,
};

/** Tombol sekunder (Filter & footer). */
const SECONDARY_BTN: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 44,
  padding: "0 16px",
  background: "#ffffff",
  border: "1px solid #DDE2E9",
  borderRadius: 11,
  fontSize: 14,
  fontWeight: 500,
  color: "#0F172A",
};

const SEG_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "7px 0",
  fontSize: 13,
};

/* -------------------------------- Data -------------------------------- */

type SuiteRow = {
  name: string;
  tc: number;
  tested: number;
  pass: number;
  failed: number;
  passRate: number | null;
  coverage: number;
  lastActivity: string | null;
  external?: boolean;
};

const SUITES: SuiteRow[] = [
  { name: "Edit Detail Location", tc: 129, tested: 16, pass: 16, failed: 0, passRate: 100, coverage: 12, lastActivity: "Oct 14, 2026" },
  { name: "Side Menu", tc: 29, tested: 29, pass: 28, failed: 0, passRate: 97, coverage: 100, lastActivity: "Oct 13, 2026" },
  { name: "Kehadiran - Jadwal Shift", tc: 44, tested: 1, pass: 1, failed: 0, passRate: 100, coverage: 2, lastActivity: "Oct 13, 2026" },
  { name: "Membership - Bulk Upload", tc: 71, tested: 71, pass: 61, failed: 0, passRate: 86, coverage: 100, lastActivity: "Oct 09, 2026" },
  { name: "LPR Iteration", tc: 10, tested: 10, pass: 10, failed: 0, passRate: 100, coverage: 100, lastActivity: "Oct 05, 2026" },
  { name: "Pay First QRIS", tc: 30, tested: 30, pass: 22, failed: 0, passRate: 73, coverage: 100, lastActivity: "Sep 24, 2026", external: true },
  { name: "Attendence", tc: 66, tested: 26, pass: 18, failed: 0, passRate: 69, coverage: 39, lastActivity: "Sep 24, 2026" },
  { name: "Appeal", tc: 61, tested: 1, pass: 0, failed: 0, passRate: 0, coverage: 2, lastActivity: "Sep 24, 2026" },
  { name: "Izin", tc: 15, tested: 2, pass: 2, failed: 0, passRate: 100, coverage: 13, lastActivity: "Sep 21, 2026" },
  { name: "Detail Gaji", tc: 3, tested: 3, pass: 3, failed: 0, passRate: 100, coverage: 100, lastActivity: "Sep 14, 2026" },
  { name: "Dashboard Login", tc: 11, tested: 0, pass: 0, failed: 0, passRate: null, coverage: 0, lastActivity: null },
  { name: "HRIS Dashboard Login", tc: 16, tested: 0, pass: 0, failed: 0, passRate: null, coverage: 0, lastActivity: null },
  { name: "Login SPN Finder", tc: 21, tested: 0, pass: 0, failed: 0, passRate: null, coverage: 0, lastActivity: null },
  { name: "Login User App - IOS", tc: 35, tested: 0, pass: 0, failed: 0, passRate: null, coverage: 0, lastActivity: null },
];

type RunRow = {
  name: string;
  project: string;
  env: string;
  progress: number;
  passRate: number | null;
  status: "In Progress" | "Completed";
  updated: string;
};

const RUNS: RunRow[] = [
  { name: "Disable Extend with QR", project: "Hardware Dispenser", env: "DEV", progress: 0, passRate: null, status: "In Progress", updated: "Oct 15" },
  { name: "[HRIS] Iteration Timezone", project: "HRIS SPN Finder", env: "DEV", progress: 25, passRate: 20, status: "In Progress", updated: "Oct 05" },
  { name: '[Bug Test] Field "Kategori Pe…', project: "Main Dashboard", env: "DEV", progress: 100, passRate: 100, status: "Completed", updated: "Oct 14" },
];

/** Warna titik status run (tanpa pill). */
const RUN_STATUS_DOT: Record<RunRow["status"], string> = {
  "In Progress": "#D97706",
  Completed: "#15803D",
};

type BugRow = {
  title: string;
  module: string;
  env: string;
  severity: "Critical" | "High" | "Medium";
  status: "Open" | "In Progress";
};

const BUGS: BugRow[] = [
  { title: '"Check Out" Renders In…', module: "Attendence", env: "DEV", severity: "Critical", status: "Open" },
  { title: 'Tap Button "Check Out…', module: "Attendence", env: "DEV", severity: "High", status: "Open" },
  { title: "Tidak ada notification…", module: "Side Menu", env: "DEV", severity: "Medium", status: "In Progress" },
];

/** Warna severity (kotak + teks), Title Case tanpa pill. */
const SEVERITY: Record<BugRow["severity"], { square: string; text: string }> = {
  Critical: { square: "#B91C1C", text: "#B91C1C" },
  High: { square: "#EA580C", text: "#C2410C" },
  Medium: { square: "#CA8A04", text: "#854D0E" },
};

/** Warna titik status bug (tanpa pill). */
const BUG_STATUS_DOT: Record<BugRow["status"], string> = {
  Open: "#C2410C",
  "In Progress": "#1D4ED8",
};

/** Warna teks Pass Rate per ambang; null (tanpa data) → muted. */
function passRateColor(v: number | null): string {
  if (v === null) return "#94A3B8";
  if (v >= 80) return "#15803D";
  if (v >= 50) return "#B45309";
  return "#B91C1C";
}

/* ------------------------------ Primitives ---------------------------- */

function Square({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 2,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
    />
  );
}

function Bar({
  pct,
  track,
  fill,
  height,
  width,
}: {
  pct: number;
  track: string;
  fill: string;
  height: number;
  width?: number;
}) {
  return (
    <div
      style={{
        width: width ?? "100%",
        maxWidth: "100%",
        height,
        borderRadius: 999,
        background: track,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: fill }} />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Square color={color} />
      {label}
    </span>
  );
}

/* ------------------------------- Header ------------------------------- */

function PageHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#0F172A",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Good afternoon, Nafi
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "#475569",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Here&apos;s your QA testing overview</span>
          <span aria-hidden="true" style={{ color: "#94A3B8" }}>
            ·
          </span>
          <span>
            <strong style={{ fontWeight: 600, color: "#0F172A" }}>Release 19</strong>{" "}
            <span>(All Platforms, Modules &amp; Envs)</span>
          </span>
        </p>
      </div>

      <button type="button" className="btn-radius-11" style={SECONDARY_BTN}>
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filter
      </button>
    </header>
  );
}

/* ------------------------------- KPI row ------------------------------ */

const KPI_CARD: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E3E7EE",
  borderRadius: 16,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const KPI_LABEL: CSSProperties = { fontSize: 13, fontWeight: 500, color: "#475569" };
const KPI_CAPTION: CSSProperties = { fontSize: 13, color: "#64748B" };

/** Baris 1 (label): tinggi tetap 24px agar label & select sejajar antar kartu. */
const KPI_ROW_LABEL: CSSProperties = {
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

/** Baris 2 (nilai): angka + caption inline pada baseline yang sama. */
const KPI_ROW_VALUE: CSSProperties = { display: "flex", alignItems: "baseline", gap: 10 };

/** Baris 3 (bawah): tinggi tetap 18px — berisi bar progres atau baris teks. */
const KPI_ROW_BOTTOM: CSSProperties = { height: 18, display: "flex", alignItems: "center" };

/** Nilai KPI: font "Geist" (bukan Geist Mono), 32px/600, angka tabular. */
const KPI_VALUE: CSSProperties = {
  fontFamily: SANS,
  fontSize: 32,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  color: "#0F172A",
};

const KPI_SELECT: CSSProperties = {
  height: 24,
  boxSizing: "border-box",
  padding: "0 6px",
  fontSize: 12,
  color: "#334155",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 6,
  cursor: "pointer",
};

/** Bar progres baris bawah: mengisi sisa lebar kartu, tinggi 6px. */
function KpiBar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#E5E9EF", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: fill }} />
    </div>
  );
}

function KpiRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      {/* 1. Total Test Cases */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Total Test Cases</span>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={KPI_VALUE}>1,482</span>
        </div>
        <div style={KPI_ROW_BOTTOM}>
          <span style={KPI_CAPTION}>Across all active suites</span>
        </div>
      </div>

      {/* 2. Execution Progress */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Execution Progress</span>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={KPI_VALUE}>13%</span>
          <span style={KPI_CAPTION}>189 / 1,482 executed</span>
        </div>
        <div style={KPI_ROW_BOTTOM}>
          <KpiBar pct={12.8} fill="#0F172A" />
        </div>
      </div>

      {/* 3. Pass Rate */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Pass Rate</span>
          <label style={{ display: "inline-flex" }}>
            <span style={srOnly}>Pass rate range</span>
            <select defaultValue="all-time" style={KPI_SELECT}>
              <option value="all-time">All Time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={{ ...KPI_VALUE, color: "#15803D" }}>85%</span>
          <span style={KPI_CAPTION}>161 / 189 passed</span>
        </div>
        <div style={KPI_ROW_BOTTOM}>
          <KpiBar pct={85} fill="#15803D" />
        </div>
      </div>

      {/* 4. Open Bugs */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Open Bugs</span>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={KPI_VALUE}>7</span>
        </div>
        <div style={{ ...KPI_ROW_BOTTOM, gap: 14, fontSize: 13, color: "#475569" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Square color="#B91C1C" />
            <span style={{ ...num, color: "#0F172A" }}>1</span> Critical
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Square color="#EA580C" />
            <span style={{ ...num, color: "#0F172A" }}>1</span> High
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Coverage by Suite ----------------------- */

const TH: CSSProperties = {
  padding: "11px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  whiteSpace: "nowrap",
  textAlign: "right",
};

const TD: CSSProperties = { padding: "13px 10px", whiteSpace: "nowrap", textAlign: "right" };

function CoverageBySuite() {
  return (
    <section style={{ ...CARD, display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <h2 style={CARD_TITLE}>Coverage by Suite</h2>
          <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>{SUITES.length} suites</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#64748B", flexWrap: "wrap" }}>
          <LegendItem color="#15803D" label="≥ 80%" />
          <LegendItem color="#B45309" label="50–79%" />
          <LegendItem color="#B91C1C" label="< 50%" />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr
              style={{
                background: "#F8FAFC",
                borderTop: "1px solid #EEF1F5",
                borderBottom: "1px solid #EEF1F5",
              }}
            >
              <th style={{ ...TH, textAlign: "left", paddingLeft: 22 }}>Suite</th>
              <th style={TH}>TC</th>
              <th style={TH}>Tested</th>
              <th style={TH}>Pass</th>
              <th style={TH}>Failed</th>
              <th style={TH}>Pass Rate</th>
              <th style={{ ...TH, paddingLeft: 24 }}>Coverage</th>
              <th style={{ ...TH, paddingRight: 22, fontWeight: 600, color: "#0F172A" }}>Last Activity ↓</th>
            </tr>
          </thead>
          <tbody>
            {SUITES.map((s) => (
              <tr key={s.name} style={{ borderBottom: "1px solid #F1F4F8" }}>
                <td style={{ ...TD, textAlign: "left", paddingLeft: 22, fontWeight: 500, color: "#0F172A" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {s.name}
                    {s.external && <ExternalLink size={13} color="#1D4ED8" aria-hidden="true" />}
                  </span>
                </td>
                <td style={{ ...TD, ...num, color: "#334155" }}>{s.tc}</td>
                <td style={{ ...TD, ...num, color: "#334155" }}>{s.tested}</td>
                <td style={{ ...TD, ...num, color: "#334155" }}>{s.pass}</td>
                <td style={{ ...TD, ...num, color: "#94A3B8" }}>{s.failed}</td>
                <td style={{ ...TD, ...num, color: passRateColor(s.passRate) }}>
                  {s.passRate === null ? "—" : `${s.passRate}%`}
                </td>
                <td style={{ ...TD, ...num, color: "#334155", paddingLeft: 24 }}>{s.coverage}%</td>
                <td style={{ ...TD, color: "#64748B" }}>{s.lastActivity ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --------------------------- Release Readiness ------------------------ */

const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R;
const RING_SCORE = 10;

function ScoreRing() {
  return (
    <div style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}>
      <svg width={92} height={92} viewBox="0 0 92 92" role="img" aria-label="Readiness score 10 of 100">
        <circle cx={46} cy={46} r={RING_R} fill="none" stroke="#EEF1F5" strokeWidth={9} />
        <circle
          cx={46}
          cy={46}
          r={RING_R}
          fill="none"
          stroke="#DC2626"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${(RING_SCORE / 100) * RING_C} ${RING_C}`}
          transform="rotate(-90 46 46)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <span style={{ ...num, fontSize: 26, color: "#0F172A" }}>10</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>of 100</span>
      </div>
    </div>
  );
}

function ReleaseReadiness() {
  return (
    <section style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <h2 style={CARD_TITLE}>Release Readiness</h2>
          <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>Release 19</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Dot color="#DC2626" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C", whiteSpace: "nowrap" }}>Not Ready</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <ScoreRing />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Blockers</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>
              1 Critical · 1 High
            </span>
            <span style={{ ...num, color: "#B91C1C", minWidth: 24, textAlign: "right" }}>2</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Test runs</span>
            <span style={{ ...num, marginLeft: "auto", color: "#0F172A" }}>5</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ color: "#475569" }}>
                Executed <span style={{ color: "#94A3B8" }}>· 11 / 37</span>
              </span>
              <span style={{ ...num, marginLeft: "auto", color: "#0F172A" }}>30%</span>
            </div>
            <Bar pct={30} track="#E5E9EF" fill="#0F172A" height={5} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Health & Action ------------------------ */

const HEALTH_LEGEND = [
  { color: "#15803D", label: "Passed", count: "161", countColor: "#14532D", pct: "10.9%" },
  { color: "#DC2626", label: "Failed", count: "0", countColor: "#94A3B8", pct: "0%" },
  { color: "#D97706", label: "Blocked", count: "0", countColor: "#94A3B8", pct: "0%" },
  { color: "#64748B", label: "Skipped", count: "28", countColor: "#334155", pct: "1.9%" },
  { color: "#CBD5E1", label: "Untested", count: "1,293", countColor: "#334155", pct: "87.2%" },
];

function HealthAction() {
  return (
    <section style={{ ...CARD, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 6px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h2 style={CARD_TITLE}>Health &amp; Action</h2>
          <span style={{ fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>1,482 cases</span>
        </div>

        {/* Segmented bar: Passed (ujung kiri membulat) · Skipped · Untested (sisa) */}
        <div style={{ display: "flex", gap: 3, height: 10 }}>
          <div style={{ width: "10.9%", background: "#15803D", borderRadius: "999px 0 0 999px" }} />
          <div style={{ width: "1.9%", background: "#64748B", borderRadius: 3 }} />
          <div style={{ flex: 1, background: "#E2E8F0", borderRadius: "0 999px 999px 0" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {HEALTH_LEGEND.map((r, i) => (
            <div
              key={r.label}
              style={{ ...SEG_ROW, borderBottom: i < HEALTH_LEGEND.length - 1 ? "1px solid #F1F4F8" : "none" }}
            >
              <Square color={r.color} />
              <span style={{ flex: 1, color: "#334155" }}>{r.label}</span>
              <span style={{ ...num, color: r.countColor }}>{r.count}</span>
              <span style={{ width: 48, textAlign: "right", fontSize: 12, color: "#64748B" }}>{r.pct}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Needs Attention — flex: 1 menyerap sisa tinggi, sehingga footer button
          selalu menempel di dasar card. */}
      <div style={{ flex: 1, padding: "12px 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#475569", margin: 0 }}>Needs Attention</h3>

        <a
          href="/test-runs"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #FBE1E1",
            background: "#FFFBFB",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "#FEE2E2",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} color="#B91C1C" aria-hidden="true" />
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#0F172A", whiteSpace: "nowrap" }}>
            <span style={{ ...num, color: "#B91C1C" }}>1</span> Test run with failures
          </span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#B91C1C", whiteSpace: "nowrap" }}>
            View →
          </span>
        </a>

        <a
          href="/test-runs"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #E2E8F0",
            background: "#ffffff",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "#EFF4FF",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Play size={18} color="#1D4ED8" aria-hidden="true" />
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#0F172A", whiteSpace: "nowrap" }}>
            <span style={{ ...num, color: "#1D4ED8" }}>1,293</span> Test cases ready to run
          </span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#1D4ED8", whiteSpace: "nowrap" }}>
            Start →
          </span>
        </a>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "14px 20px",
          borderTop: "1px solid #EEF1F5",
          background: "#FAFBFC",
        }}
      >
        <button type="button" className="btn-radius-11" style={{ ...SECONDARY_BTN, flex: 1, padding: 0 }}>
          <Bug size={15} aria-hidden="true" />
          Bugs
        </button>
        <button type="button" className="btn-radius-11" style={{ ...SECONDARY_BTN, flex: 1, padding: 0 }}>
          <BarChart3 size={15} aria-hidden="true" />
          Reports
        </button>
      </div>
    </section>
  );
}

/* ------------------------------- Bottom row --------------------------- */

function RecentTestRuns() {
  return (
    <section style={{ ...CARD, flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={CARD_TITLE}>Recent Test Runs</h2>
        <a href="/test-runs/history" style={{ fontSize: 13, fontWeight: 600, color: "#1D4ED8", textDecoration: "none" }}>
          View all →
        </a>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", borderTop: "1px solid #EEF1F5", borderBottom: "1px solid #EEF1F5" }}>
              <th style={{ ...TH, textAlign: "left", paddingLeft: 22 }}>Test Run</th>
              <th style={{ ...TH, textAlign: "left" }}>Progress</th>
              <th style={TH}>Pass Rate</th>
              <th style={{ ...TH, textAlign: "left" }}>Status</th>
              <th style={{ ...TH, paddingRight: 22 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {RUNS.map((r, i) => (
              <tr key={r.name} style={{ borderBottom: i < RUNS.length - 1 ? "1px solid #F1F4F8" : "none" }}>
                <td style={{ padding: "12px 10px", paddingLeft: 22 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 240 }}>
                    <span
                      style={{
                        fontWeight: 500,
                        color: "#0F172A",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.name}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.project} <span aria-hidden="true">·</span>{" "}
                      <span style={{ fontWeight: 600, color: "#475569" }}>{r.env}</span>
                    </span>
                  </div>
                </td>
                <td style={{ padding: "12px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Bar pct={r.progress} track="#E9EDF2" fill="#1D4ED8" height={6} width={90} />
                    <span style={{ ...num, fontSize: 12, color: "#334155" }}>{r.progress}%</span>
                  </div>
                </td>
                <td style={{ padding: "12px 10px", textAlign: "right", ...num, color: passRateColor(r.passRate) }}>
                  {r.passRate === null ? "—" : `${r.passRate}%`}
                </td>
                <td style={{ padding: "12px 10px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#334155", whiteSpace: "nowrap" }}>
                    <Dot color={RUN_STATUS_DOT[r.status]} />
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: "12px 10px", paddingRight: 22, textAlign: "right", color: "#64748B", whiteSpace: "nowrap" }}>
                  {r.updated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentBugs() {
  return (
    <section style={{ ...CARD, flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={CARD_TITLE}>Recent / Critical Bugs</h2>
        <a href="/bugs" style={{ fontSize: 13, fontWeight: 600, color: "#1D4ED8", textDecoration: "none" }}>
          View all →
        </a>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F8FAFC", borderTop: "1px solid #EEF1F5", borderBottom: "1px solid #EEF1F5" }}>
              <th style={{ ...TH, textAlign: "left", paddingLeft: 22 }}>Bug</th>
              <th style={{ ...TH, textAlign: "left" }}>Severity</th>
              <th style={{ ...TH, textAlign: "left", paddingRight: 22 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {BUGS.map((b, i) => {
              const sev = SEVERITY[b.severity];
              return (
                <tr key={b.title} style={{ borderBottom: i < BUGS.length - 1 ? "1px solid #F1F4F8" : "none" }}>
                  <td style={{ padding: "12px 10px", paddingLeft: 22 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 280 }}>
                      <span
                        style={{
                          fontWeight: 500,
                          color: "#0F172A",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.title}
                      </span>
                      <span style={{ fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {b.module} <span aria-hidden="true">·</span>{" "}
                        <span style={{ fontWeight: 600, color: "#475569" }}>{b.env}</span>
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: sev.text, whiteSpace: "nowrap" }}>
                      <Square color={sev.square} />
                      {b.severity}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", paddingRight: 22, textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#334155", whiteSpace: "nowrap" }}>
                      <Dot color={BUG_STATUS_DOT[b.status]} />
                      {b.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------- Page --------------------------------- */

export function Dashboard() {
  return (
    <div
      style={{
        fontFamily: SANS,
        color: "#0F172A",
        background: "#F1F3F6",
        // Full-bleed ke dalam area konten AppShell (padding 1rem dibatalkan),
        // lalu diberi padding halaman sesuai spesifikasi.
        margin: "-1rem",
        padding: "28px 24px 40px",
        minHeight: "calc(100% + 2rem)",
      }}
    >
      {/* Konten mengisi penuh lebar area konten (rata kiri), dengan padding halaman. */}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <PageHeader />
        <KpiRow />

        {/* Main row: Coverage (kiri) + Release Readiness & Health (kanan).
            `align-items: stretch` membuat kolom kanan setinggi kolom Coverage,
            sehingga tepi bawah Health & Action sejajar dengan card Coverage. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
          <div style={{ flex: "999 1 640px", minWidth: 0 }}>
            <CoverageBySuite />
          </div>
          <div
            style={{
              flex: "1 0 400px",
              maxWidth: 440,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <ReleaseReadiness />
            <HealthAction />
          </div>
        </div>

        {/* Bottom row: Recent Test Runs / Recent & Critical Bugs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          <RecentTestRuns />
          <RecentBugs />
        </div>
      </div>
    </div>
  );
}
