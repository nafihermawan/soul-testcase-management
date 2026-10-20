import { Card } from "@/components/ui";
import {
  ACTIVE_BUG_STATUSES,
  effectiveTotal,
  executedValidCount,
  executionProgress,
  formatPct,
  severityRank,
  type ExecutionCounts,
} from "@/lib/qa-metrics";
import type { DashboardBugItem, DashboardRunItem } from "@/types/api";
import { Rocket } from "lucide-react";

/**
 * Penalti skor kesiapan rilis per blocker — ubah ambangnya di sini saja.
 * Blocker = bug OPEN/IN_PROGRESS dengan severity CRITICAL/HIGH pada scope ini.
 */
export const RELEASE_BLOCKER_PENALTY = { CRITICAL: 15, HIGH: 5 } as const;

/** Ambang band kesiapan (skor 0–100). */
export const RELEASE_READINESS_BANDS = {
  ready: 80,
  atRisk: 50,
} as const;

type Band = { label: string; color: string; bg: string; border: string };

function bandOf(score: number): Band {
  if (score >= RELEASE_READINESS_BANDS.ready)
    return { label: "Ready", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" };
  if (score >= RELEASE_READINESS_BANDS.atRisk)
    return { label: "At Risk", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" };
  return { label: "Not Ready", color: "#E11D48", bg: "#FFF1F2", border: "#FECDD3" };
}

/**
 * Ringkasan kesiapan rilis untuk sprint/release aktif:
 * skor = progress eksekusi − penalti blocker (critical 15, high 5), dibatasi 0–100.
 */
export function ReleaseReadiness({
  activeSprint,
  runs,
  bugs,
}: {
  activeSprint: string | null;
  runs: DashboardRunItem[];
  bugs: DashboardBugItem[];
}) {
  // Bug yang masih hidup & severity tinggi = blocker rilis.
  let critical = 0;
  let high = 0;
  for (const b of bugs) {
    if (!(ACTIVE_BUG_STATUSES as readonly string[]).includes(b.status)) continue;
    const rank = severityRank(b.severity);
    if (rank === 0) critical++;
    else if (rank === 1) high++;
  }
  const blockers = critical + high;

  // Progress eksekusi pada scope release (bila ada sprint aktif) atau seluruh run.
  const scoped = activeSprint ? runs.filter((r) => r.sprint === activeSprint) : runs;
  const counts: ExecutionCounts = scoped.reduce(
    (acc, r) => ({
      passed: acc.passed + r.counts.passed,
      failed: acc.failed + r.counts.failed,
      blocked: acc.blocked + r.counts.blocked,
      skipped: acc.skipped + r.counts.skipped,
      notRun: acc.notRun + r.counts.notRun,
      total: acc.total + r.counts.total,
      executed: acc.executed + r.counts.executed,
    }),
    { passed: 0, failed: 0, blocked: 0, skipped: 0, notRun: 0, total: 0, executed: 0 }
  );
  const progress = executionProgress(counts) ?? 0;
  const penalty = critical * RELEASE_BLOCKER_PENALTY.CRITICAL + high * RELEASE_BLOCKER_PENALTY.HIGH;
  const score = Math.max(0, Math.min(100, progress - penalty));
  const band = bandOf(score);

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      {/* Header + divider inset (bukan full-bleed) */}
      <div
        style={{
          padding: "0.75rem 1rem 0.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          borderBottom: "1px solid #F1F5F9",
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1E293B", margin: 0 }}>
          Release Readiness
        </h3>
        <span
          style={{
            padding: "0.125rem 0.5rem",
            fontSize: 12,
            fontWeight: 600,
            background: "#F1F5F9",
            color: "#475569",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {activeSprint ? `Release ${activeSprint}` : "No active release"}
        </span>
      </div>

      {/* Skor + badge status (space-between) */}
      <div
        style={{
          padding: "0.75rem 1rem 0.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Rocket size={16} style={{ color: band.color }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
            {score}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#94A3B8" }}> / 100</span>
          </span>
        </div>
        <span
          style={{
            padding: "0.125rem 0.5rem",
            fontSize: 12,
            fontWeight: 600,
            background: band.bg,
            color: band.color,
            border: `1px solid ${band.border}`,
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          {band.label}
        </span>
      </div>

      {/* Progress bar dengan padding horizontal */}
      <div style={{ padding: "0 1rem", marginBottom: "0.75rem" }}>
        <div
          style={{
            width: "100%",
            background: "#F1F5F9",
            height: 8,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${score}%`,
              height: "100%",
              background: band.color,
              borderRadius: 999,
            }}
          />
        </div>
      </div>

      {/* 3 indikator bawah + pembatas vertikal inset */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.5rem",
          padding: "0.5rem 1rem 0.75rem",
          textAlign: "left",
        }}
      >
        <div style={{ borderRight: "1px solid #F1F5F9", paddingRight: "0.5rem" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: blockers > 0 ? "#E11D48" : "#047857", margin: 0 }}>
            {blockers}
          </p>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#475569", margin: 0 }}>Blockers</p>
          <p style={{ fontSize: 9, color: "#94A3B8", margin: 0 }}>
            {critical} Critical · {high} High
          </p>
        </div>
        <div style={{ borderRight: "1px solid #F1F5F9", padding: "0 0.5rem" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", margin: 0 }}>{scoped.length}</p>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#475569", margin: 0 }}>Test Runs</p>
        </div>
        <div style={{ paddingLeft: "0.5rem" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", margin: 0 }}>
            {formatPct(executionProgress(counts))}
          </p>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#475569", margin: 0 }}>Executed</p>
          {/* Penyebut = beban efektif (Total − Skipped), bukan total mentah,
              supaya angka kecil di bawah persen ikut rumus yang sama. */}
          <p style={{ fontSize: 9, color: "#94A3B8", margin: 0 }}>
            {executedValidCount(counts)} / {effectiveTotal(counts)}
          </p>
        </div>
      </div>
    </Card>
  );
}
