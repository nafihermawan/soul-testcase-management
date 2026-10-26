"use client";

import type { CSSProperties } from "react";
import { AlertTriangle, BarChart3, Bug, ExternalLink, Play, SlidersHorizontal } from "lucide-react";

import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { runStatusLabel } from "@/components/test-runs/test-run-status-badge";
import { useApi } from "@/lib/client/use-api";
import {
  addCounts,
  effectiveTotal,
  emptyCounts,
  executedValidCount,
  executionProgress,
  passRateOf,
} from "@/lib/qa-metrics";
import type { DashboardPayload } from "@/types/api";
import { RELEASE_BLOCKER_PENALTY, RELEASE_READINESS_BANDS } from "./release-readiness";

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

/** Kerangka halaman: full-bleed ke dalam area konten AppShell (padding 1rem
 *  dibatalkan), lalu diberi padding halaman sesuai spesifikasi. */
const PAGE: CSSProperties = {
  fontFamily: SANS,
  color: "#0F172A",
  background: "#F1F3F6",
  margin: "-1rem",
  padding: "28px 24px 40px",
  minHeight: "calc(100% + 2rem)",
};

/** Konten mengisi penuh lebar area konten (rata kiri). */
const PAGE_COLUMN: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

/* --------------------------------- Model ------------------------------ */

type SuiteRow = {
  id: string;
  name: string;
  tc: number;
  tested: number;
  pass: number;
  failed: number;
  passRate: number | null;
  coverage: number;
  lastActivity: string | null;
  external: boolean;
};

type RunRow = {
  id: string;
  name: string;
  project: string;
  env: string;
  progress: number;
  passRate: number | null;
  status: string;
  updated: string;
};

type BugRow = {
  id: string;
  title: string;
  module: string;
  env: string;
  severity: string;
  status: string;
};

type HealthRow = {
  color: string;
  label: string;
  count: number;
  countColor: string;
  pct: string;
  pctNum: number;
};

type Readiness = {
  score: number;
  label: string;
  color: string;
  critical: number;
  high: number;
  runTotal: number;
  executedValid: number;
  effective: number;
  progress: number;
};

/* ------------------------------ Derivations --------------------------- */

const nf = new Intl.NumberFormat("en-US");

/** Tanggal panjang sesuai desain: "Oct 14, 2026". */
const fmtLongDate = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    : null;

/** Tanggal ringkas untuk tabel: "Oct 15". */
const fmtShortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });

function greetingLabel(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Warna severity bug (kotak + teks), Title Case tanpa pill. */
const SEVERITY: Record<string, { square: string; text: string }> = {
  CRITICAL: { square: "#B91C1C", text: "#B91C1C" },
  HIGH: { square: "#EA580C", text: "#C2410C" },
  MEDIUM: { square: "#CA8A04", text: "#854D0E" },
  LOW: { square: "#94A3B8", text: "#64748B" },
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Severity asing/kosong diperlakukan sebagai Medium (paling netral). */
const severityKey = (s: string | null): string => (s && SEVERITY[s] ? s : "MEDIUM");

/** Warna titik status bug (tanpa pill). */
const BUG_STATUS_DOT: Record<string, string> = {
  OPEN: "#C2410C",
  IN_PROGRESS: "#1D4ED8",
  RESOLVED: "#7C3AED",
  CLOSED: "#15803D",
};

const BUG_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const bugStatusDot = (s: string): string => BUG_STATUS_DOT[s] ?? "#94A3B8";
const bugStatusLabel = (s: string): string => BUG_STATUS_LABEL[s] ?? s;

/** Warna titik status run (tanpa pill) — kuncinya nilai status mentahnya. */
const RUN_STATUS_DOT: Record<string, string> = {
  PENDING: "#64748B",
  IN_PROGRESS: "#D97706",
  RE_OPEN: "#2563EB",
  COMPLETED: "#15803D",
};

/** Warna teks Pass Rate per ambang; null (tanpa data) → muted. */
function passRateColor(v: number | null): string {
  if (v === null) return "#94A3B8";
  if (v >= 80) return "#15803D";
  if (v >= 50) return "#B45309";
  return "#B91C1C";
}

/**
 * Satu-satunya tempat angka dashboard diturunkan dari payload API.
 *
 * Semua persentase memakai definisi kanonik di `lib/qa-metrics`
 * (progress & pass rate mengeluarkan SKIPPED) supaya angka di dashboard tidak
 * pernah menyimpang dari halaman lain.
 */
function derive(data: DashboardPayload) {
  /* ---- Totals (dasar KPI & Health) ---- */
  const totals = data.suiteCoverage.reduce((acc, s) => addCounts(acc, s.counts), emptyCounts());
  const totalTc = totals.total;
  const progress = executionProgress(totals);
  const passRate = passRateOf(totals);
  const executedValid = executedValidCount(totals);
  const effective = effectiveTotal(totals);

  /* ---- Coverage by Suite (urut aktivitas terakhir, terbaru dulu) ---- */
  const suites: SuiteRow[] = [...data.suiteCoverage]
    .sort((a, b) => {
      const at = a.lastExecutedAt ? Date.parse(a.lastExecutedAt) : Number.NEGATIVE_INFINITY;
      const bt = b.lastExecutedAt ? Date.parse(b.lastExecutedAt) : Number.NEGATIVE_INFINITY;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      tc: s.total,
      tested: s.counts.executed,
      pass: s.counts.passed,
      failed: s.counts.failed,
      passRate: passRateOf(s.counts),
      coverage: executionProgress(s.counts) ?? 0,
      lastActivity: fmtLongDate(s.lastExecutedAt),
      external: Boolean(s.docUrl),
    }));

  /* ---- Recent runs (urut pembaruan terakhir) ---- */
  const runs: RunRow[] = [...data.runs]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      name: r.name,
      project: r.project,
      env: r.environment ?? "—",
      progress: executionProgress(r.counts) ?? 0,
      passRate: passRateOf(r.counts),
      // Status mentahnya; label tampilan diambil dari `runStatusLabel` supaya
      // "Open" (PENDING) tidak lagi terbaca sebagai "In Progress".
      status: r.status,
      updated: fmtShortDate(r.updatedAt),
    }));

  /* ---- Recent / Critical bugs (API hanya mengirim bug aktif) ---- */
  const bugs: BugRow[] = data.bugs.slice(0, 5).map((b) => ({
    id: b.id,
    title: b.title,
    module: b.suiteName ?? "—",
    env: b.environment ?? "—",
    severity: severityKey(b.severity),
    status: b.status,
  }));

  /* ---- Health & Action ---- */
  const shareOf = (v: number): number => (totalTc > 0 ? (v / totalTc) * 100 : 0);
  const health: HealthRow[] = [
    { color: "#15803D", label: "Passed", count: totals.passed, positive: "#14532D" },
    { color: "#DC2626", label: "Failed", count: totals.failed, positive: "#B91C1C" },
    { color: "#D97706", label: "Blocked", count: totals.blocked, positive: "#B45309" },
    { color: "#64748B", label: "Skipped", count: totals.skipped, positive: "#334155" },
    { color: "#CBD5E1", label: "Untested", count: totals.notRun, positive: "#334155" },
  ].map((r) => ({
    color: r.color,
    label: r.label,
    count: r.count,
    countColor: r.count > 0 ? r.positive : "#94A3B8",
    pct: `${shareOf(r.count).toFixed(1)}%`,
    pctNum: shareOf(r.count),
  }));

  /* ---- Release Readiness: progress − penalti blocker (aturan bersama) ---- */
  const raw =
    (progress ?? 0) -
    data.bugStats.critical * RELEASE_BLOCKER_PENALTY.CRITICAL -
    data.bugStats.high * RELEASE_BLOCKER_PENALTY.HIGH;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const readiness: Readiness = {
    score,
    label:
      score >= RELEASE_READINESS_BANDS.ready
        ? "Ready"
        : score >= RELEASE_READINESS_BANDS.atRisk
          ? "At Risk"
          : "Not Ready",
    color:
      score >= RELEASE_READINESS_BANDS.ready
        ? "#15803D"
        : score >= RELEASE_READINESS_BANDS.atRisk
          ? "#B45309"
          : "#DC2626",
    critical: data.bugStats.critical,
    high: data.bugStats.high,
    runTotal: data.runTotal,
    executedValid,
    effective,
    progress: progress ?? 0,
  };

  return {
    userName: data.user.name?.trim().split(/\s+/)[0] || "there",
    greeting: greetingLabel(),
    totalTc,
    progress,
    executedValid,
    effective,
    passRate,
    passed: totals.passed,
    openBugs: data.bugStats.active,
    criticalBugs: data.bugStats.critical,
    highBugs: data.bugStats.high,
    suites,
    runs,
    bugs,
    health,
    readiness,
    runsWithFailures: data.runs.filter((r) => r.counts.failed > 0).length,
    notRunTc: totals.notRun,
  };
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

/** Baris kosong di dalam tabel — data live bisa benar-benar kosong. */
function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "26px 22px", textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
        {label}
      </td>
    </tr>
  );
}

/* ------------------------------- Header ------------------------------- */

function PageHeader({ greeting, userName }: { greeting: string; userName: string }) {
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
          {greeting}, {userName}
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
            <strong style={{ fontWeight: 600, color: "#0F172A" }}>All releases</strong>{" "}
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

function KpiRow({
  totalTc,
  progress,
  executedValid,
  effective,
  passRate,
  passed,
  openBugs,
  criticalBugs,
  highBugs,
}: {
  totalTc: number;
  progress: number | null;
  executedValid: number;
  effective: number;
  passRate: number | null;
  passed: number;
  openBugs: number;
  criticalBugs: number;
  highBugs: number;
}) {
  const rateColor = passRateColor(passRate);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      {/* 1. Total Test Cases */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Total Test Cases</span>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={KPI_VALUE}>{nf.format(totalTc)}</span>
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
          <span style={KPI_VALUE}>{progress === null ? "—" : `${progress}%`}</span>
          <span style={KPI_CAPTION}>
            {nf.format(executedValid)} / {nf.format(effective)} executed
          </span>
        </div>
        <div style={KPI_ROW_BOTTOM}>
          <KpiBar pct={progress ?? 0} fill="#0F172A" />
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
          <span style={{ ...KPI_VALUE, color: rateColor }}>{passRate === null ? "—" : `${passRate}%`}</span>
          <span style={KPI_CAPTION}>
            {nf.format(passed)} / {nf.format(executedValid)} passed
          </span>
        </div>
        <div style={KPI_ROW_BOTTOM}>
          <KpiBar pct={passRate ?? 0} fill={rateColor} />
        </div>
      </div>

      {/* 4. Open Bugs */}
      <div style={KPI_CARD}>
        <div style={KPI_ROW_LABEL}>
          <span style={KPI_LABEL}>Open Bugs</span>
        </div>
        <div style={KPI_ROW_VALUE}>
          <span style={KPI_VALUE}>{nf.format(openBugs)}</span>
        </div>
        <div style={{ ...KPI_ROW_BOTTOM, gap: 14, fontSize: 13, color: "#475569" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Square color="#B91C1C" />
            <span style={{ ...num, color: criticalBugs > 0 ? "#0F172A" : "#94A3B8" }}>{criticalBugs}</span> Critical
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Square color="#EA580C" />
            <span style={{ ...num, color: highBugs > 0 ? "#0F172A" : "#94A3B8" }}>{highBugs}</span> High
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

/** Header tabel tetap terlihat saat isi card di-scroll (background solid). */
const STICKY_TH: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "#F8FAFC",
};

const TD: CSSProperties = { padding: "13px 10px", whiteSpace: "nowrap", textAlign: "right" };

/** Tinggi maksimum area tabel: jumlah suite nyata bisa panjang. */
const COVERAGE_MAX_H = 460;

function CoverageBySuite({ rows }: { rows: SuiteRow[] }) {
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
          <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>{rows.length} suites</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#64748B", flexWrap: "wrap" }}>
          <LegendItem color="#15803D" label="≥ 80%" />
          <LegendItem color="#B45309" label="50–79%" />
          <LegendItem color="#B91C1C" label="< 50%" />
        </div>
      </div>

      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: COVERAGE_MAX_H }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr
              style={{
                background: "#F8FAFC",
                borderTop: "1px solid #EEF1F5",
                borderBottom: "1px solid #EEF1F5",
              }}
            >
              <th style={{ ...TH, ...STICKY_TH, textAlign: "left", paddingLeft: 22 }}>Suite</th>
              <th style={{ ...TH, ...STICKY_TH }}>TC</th>
              <th style={{ ...TH, ...STICKY_TH }}>Tested</th>
              <th style={{ ...TH, ...STICKY_TH }}>Pass</th>
              <th style={{ ...TH, ...STICKY_TH }}>Failed</th>
              <th style={{ ...TH, ...STICKY_TH }}>Pass Rate</th>
              <th style={{ ...TH, ...STICKY_TH, paddingLeft: 24 }}>Coverage</th>
              <th style={{ ...TH, ...STICKY_TH, paddingRight: 22, fontWeight: 600, color: "#0F172A" }}>
                Last Activity ↓
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8} label="Belum ada suite yang bisa dihitung." />
            ) : (
              rows.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #F1F4F8" }}>
                  <td style={{ ...TD, textAlign: "left", paddingLeft: 22, fontWeight: 500, color: "#0F172A" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {s.name}
                      {s.external && <ExternalLink size={13} color="#1D4ED8" aria-hidden="true" />}
                    </span>
                  </td>
                  <td style={{ ...TD, ...num, color: "#334155" }}>{s.tc}</td>
                  <td style={{ ...TD, ...num, color: "#334155" }}>{s.tested}</td>
                  <td style={{ ...TD, ...num, color: "#334155" }}>{s.pass}</td>
                  <td style={{ ...TD, ...num, color: s.failed > 0 ? "#B91C1C" : "#94A3B8" }}>{s.failed}</td>
                  <td style={{ ...TD, ...num, color: passRateColor(s.passRate) }}>
                    {s.passRate === null ? "—" : `${s.passRate}%`}
                  </td>
                  <td style={{ ...TD, ...num, color: "#334155", paddingLeft: 24 }}>{s.coverage}%</td>
                  <td style={{ ...TD, color: "#64748B" }}>{s.lastActivity ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --------------------------- Release Readiness ------------------------ */

const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R;

function ScoreRing({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}>
      <svg width={92} height={92} viewBox="0 0 92 92" role="img" aria-label={`Readiness score ${score} of 100`}>
        <circle cx={46} cy={46} r={RING_R} fill="none" stroke="#EEF1F5" strokeWidth={9} />
        <circle
          cx={46}
          cy={46}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * RING_C} ${RING_C}`}
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
        <span style={{ ...num, fontSize: 26, color: "#0F172A" }}>{score}</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>of 100</span>
      </div>
    </div>
  );
}

function ReleaseReadiness({ readiness }: { readiness: Readiness }) {
  const blockers = readiness.critical + readiness.high;
  return (
    <section style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <h2 style={CARD_TITLE}>Release Readiness</h2>
          <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>All releases</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <Dot color={readiness.color} />
          <span style={{ fontSize: 13, fontWeight: 600, color: readiness.color, whiteSpace: "nowrap" }}>
            {readiness.label}
          </span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <ScoreRing score={readiness.score} color={readiness.color} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Blockers</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>
              {readiness.critical} Critical · {readiness.high} High
            </span>
            <span
              style={{
                ...num,
                color: blockers > 0 ? "#B91C1C" : "#94A3B8",
                minWidth: 24,
                textAlign: "right",
              }}
            >
              {blockers}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ color: "#475569" }}>Test runs</span>
            <span style={{ ...num, marginLeft: "auto", color: "#0F172A" }}>{readiness.runTotal}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ color: "#475569" }}>
                Executed{" "}
                <span style={{ color: "#94A3B8" }}>
                  · {nf.format(readiness.executedValid)} / {nf.format(readiness.effective)}
                </span>
              </span>
              <span style={{ ...num, marginLeft: "auto", color: "#0F172A" }}>{readiness.progress}%</span>
            </div>
            <Bar pct={readiness.progress} track="#E5E9EF" fill="#0F172A" height={5} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Health & Action ------------------------ */

function HealthAction({
  health,
  totalTc,
  runsWithFailures,
  notRunTc,
}: {
  health: HealthRow[];
  totalTc: number;
  runsWithFailures: number;
  notRunTc: number;
}) {
  // Segmen bar hanya untuk kategori yang ada isinya, supaya celah antar segmen
  // tidak menumpuk jadi garis kosong.
  const segments = health.filter((r) => r.count > 0);
  return (
    <section style={{ ...CARD, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 6px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h2 style={CARD_TITLE}>Health &amp; Action</h2>
          <span style={{ fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>
            {nf.format(totalTc)} cases
          </span>
        </div>

        {/* Segmented bar: ujung kiri & kanan membulat, proporsi dari data nyata */}
        <div style={{ display: "flex", gap: 3, height: 10 }}>
          {segments.length === 0 ? (
            <div style={{ flex: 1, background: "#E2E8F0", borderRadius: 999 }} />
          ) : (
            segments.map((r, i) => (
              <div
                key={r.label}
                style={{
                  width: `${r.pctNum}%`,
                  background: r.color,
                  borderRadius:
                    segments.length === 1
                      ? 999
                      : i === 0
                        ? "999px 0 0 999px"
                        : i === segments.length - 1
                          ? "0 999px 999px 0"
                          : 3,
                }}
              />
            ))
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {health.map((r, i) => (
            <div
              key={r.label}
              style={{ ...SEG_ROW, borderBottom: i < health.length - 1 ? "1px solid #F1F4F8" : "none" }}
            >
              <Square color={r.color} />
              <span style={{ flex: 1, color: "#334155" }}>{r.label}</span>
              <span style={{ ...num, color: r.countColor }}>{nf.format(r.count)}</span>
              <span style={{ width: 48, textAlign: "right", fontSize: 12, color: "#64748B" }}>{r.pct}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Needs Attention — flex: 1 menyerap sisa tinggi, sehingga footer button
          selalu menempel di dasar card. */}
      <div style={{ flex: 1, padding: "12px 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#475569", margin: 0 }}>Needs Attention</h3>

        {runsWithFailures > 0 ? (
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
              <span style={{ ...num, color: "#B91C1C" }}>{nf.format(runsWithFailures)}</span>{" "}
              {runsWithFailures === 1 ? "Test run" : "Test runs"} with failures
            </span>
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#B91C1C", whiteSpace: "nowrap" }}>
              View →
            </span>
          </a>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #DCFCE7",
              background: "#F7FEF9",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "#334155" }}>
              Tidak ada test run dengan kegagalan.
            </span>
          </div>
        )}

        {notRunTc > 0 && (
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
              <span style={{ ...num, color: "#1D4ED8" }}>{nf.format(notRunTc)}</span> Test cases ready to run
            </span>
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#1D4ED8", whiteSpace: "nowrap" }}>
              Start →
            </span>
          </a>
        )}
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

function RecentTestRuns({ rows }: { rows: RunRow[] }) {
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
            {rows.length === 0 ? (
              <EmptyRow colSpan={5} label="Belum ada test run." />
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F4F8" : "none" }}>
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
                      <Dot color={RUN_STATUS_DOT[r.status] ?? "#94A3B8"} />
                      {runStatusLabel(r.status)}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", paddingRight: 22, textAlign: "right", color: "#64748B", whiteSpace: "nowrap" }}>
                    {r.updated}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentBugs({ rows }: { rows: BugRow[] }) {
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
            {rows.length === 0 ? (
              <EmptyRow colSpan={3} label="Tidak ada bug aktif." />
            ) : (
              rows.map((b, i) => {
                const sev = SEVERITY[b.severity] ?? SEVERITY.MEDIUM;
                return (
                  <tr key={b.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid #F1F4F8" : "none" }}>
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
                        {SEVERITY_LABEL[b.severity] ?? b.severity}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px", paddingRight: 22, textAlign: "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#334155", whiteSpace: "nowrap" }}>
                        <Dot color={bugStatusDot(b.status)} />
                        {bugStatusLabel(b.status)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------- Page --------------------------------- */

/** Interval polling statistik dashboard (background, tanpa skeleton). */
const DASHBOARD_POLL_MS = 45_000;

export function Dashboard() {
  const { data, error, loading, reload } = useApi<DashboardPayload>("/api/dashboard", {
    pollMs: DASHBOARD_POLL_MS,
    refetchOnFocus: true,
    alwaysFresh: true,
  });

  if (error) {
    return (
      <div style={PAGE}>
        <div style={PAGE_COLUMN}>
          <ErrorBlock message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={PAGE}>
        <div style={PAGE_COLUMN}>
          <StatsCardsSkeleton />
          <TableCardSkeleton />
        </div>
      </div>
    );
  }

  const d = derive(data);

  return (
    <div style={PAGE}>
      <div style={PAGE_COLUMN}>
        <PageHeader greeting={d.greeting} userName={d.userName} />
        <KpiRow
          totalTc={d.totalTc}
          progress={d.progress}
          executedValid={d.executedValid}
          effective={d.effective}
          passRate={d.passRate}
          passed={d.passed}
          openBugs={d.openBugs}
          criticalBugs={d.criticalBugs}
          highBugs={d.highBugs}
        />

        {/* Main row: Coverage (kiri) + Release Readiness & Health (kanan).
            `align-items: stretch` membuat kolom kanan setinggi kolom Coverage,
            sehingga tepi bawah Health & Action sejajar dengan card Coverage. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
          <div style={{ flex: "999 1 640px", minWidth: 0 }}>
            <CoverageBySuite rows={d.suites} />
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
            <ReleaseReadiness readiness={d.readiness} />
            <HealthAction
              health={d.health}
              totalTc={d.totalTc}
              runsWithFailures={d.runsWithFailures}
              notRunTc={d.notRunTc}
            />
          </div>
        </div>

        {/* Bottom row: Recent Test Runs / Recent & Critical Bugs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          <RecentTestRuns rows={d.runs} />
          <RecentBugs rows={d.bugs} />
        </div>
      </div>
    </div>
  );
}
