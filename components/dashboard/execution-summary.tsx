import { Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatPct, pct, type ExecutionCounts } from "@/lib/qa-metrics";
import { PlayCircle } from "lucide-react";

const SEGMENTS = [
  { key: "passed", label: "Passed", color: "var(--success)" },
  { key: "failed", label: "Failed", color: "var(--danger)" },
  { key: "blocked", label: "Blocked", color: "var(--warning)" },
  { key: "notRun", label: "Not Run", color: "var(--border-strong)" },
] as const;

/** Ringkasan eksekusi: Passed / Failed / Blocked / Not Run sebagai satu bar
 *  bertingkat + legenda. Blocked dan Not Run adalah status yang berbeda. */
export function ExecutionSummary({
  counts,
  totalTC,
}: {
  counts: ExecutionCounts;
  totalTC: number;
}) {
  const hasExecution = counts.executed > 0;

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="Execution Summary" />
      {!hasExecution ? (
        <EmptyState
          icon={<PlayCircle size={22} />}
          title="No test execution yet"
          subtext={`${totalTC.toLocaleString("id-ID")} test cases are ready to be tested.`}
          actionLabel="Start Testing"
          actionHref="/test-runs"
        />
      ) : (
        <div
          style={{
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            flex: 1,
          }}
        >
          {/* Bar bertingkat */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 10,
              borderRadius: 999,
              overflow: "hidden",
              background: "var(--surface-muted)",
            }}
            role="img"
            aria-label={`Passed ${counts.passed}, Failed ${counts.failed}, Blocked ${counts.blocked}, Not Run ${counts.notRun}`}
          >
            {SEGMENTS.map((s) => {
              const value = counts[s.key];
              if (value <= 0) return null;
              return (
                <span
                  key={s.key}
                  style={{
                    flexGrow: value,
                    flexBasis: 0,
                    background: s.color,
                  }}
                />
              );
            })}
          </div>

          {/* Legenda + angka */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {SEGMENTS.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.82rem",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: s.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>
                  {counts[s.key].toLocaleString("id-ID")}
                </span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    width: 44,
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  {formatPct(pct(counts[s.key], counts.total))}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--border)",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
            }}
          >
            {counts.executed.toLocaleString("id-ID")} of {counts.total.toLocaleString("id-ID")} test
            cases executed
          </div>
        </div>
      )}
    </Card>
  );
}
