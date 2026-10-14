import { Card, PanelHeader, ProgressBar } from "@/components/ui";
import {
  ACTIVE_BUG_STATUSES,
  formatPct,
  pct,
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

type Band = { label: string; color: string };

function bandOf(score: number): Band {
  if (score >= RELEASE_READINESS_BANDS.ready) return { label: "Ready", color: "#047857" };
  if (score >= RELEASE_READINESS_BANDS.atRisk) return { label: "At Risk", color: "#B45309" };
  return { label: "Not Ready", color: "#BE123C" };
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
  const progress = pct(counts.executed, counts.total) ?? 0;
  const penalty = critical * RELEASE_BLOCKER_PENALTY.CRITICAL + high * RELEASE_BLOCKER_PENALTY.HIGH;
  const score = Math.max(0, Math.min(100, progress - penalty));
  const band = bandOf(score);

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <PanelHeader
        title="Release Readiness"
        compact
        action={
          <span style={{ fontSize: "0.78rem", color: activeSprint ? "#475569" : "#94A3B8", fontWeight: 600 }}>
            {activeSprint ? activeSprint : "No active release"}
          </span>
        }
      />
      <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Rocket size={15} style={{ color: band.color }} />
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#1E293B" }}>
              {score}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>/ 100</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: band.color }}>{band.label}</span>
        </div>

        <ProgressBar value={score} color={band.color} track="#F1F5F9" height={6} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.4rem",
            fontSize: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: blockers > 0 ? "#BE123C" : "#047857" }}>
              {blockers}
            </div>
            <div style={{ color: "#64748B" }}>Blockers</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              {critical} Critical · {high} High
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#1E293B" }}>{scoped.length}</div>
            <div style={{ color: "#64748B" }}>Test Runs</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#1E293B" }}>{formatPct(pct(counts.executed, counts.total))}</div>
            <div style={{ color: "#64748B" }}>Executed</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              {counts.executed} / {counts.total}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
