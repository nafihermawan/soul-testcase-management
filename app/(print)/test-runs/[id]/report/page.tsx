import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { runCodeOf } from "@/lib/format";
import { requireUser } from "@/lib/hierarchy";
import { ReportActionBar } from "@/components/test-runs/report-action-bar";

export default async function RunReportPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();

  const run = await prisma.testRun.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { name: true } },
      createdBy: { select: { name: true } },
      results: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          titleSnapshot: true,
          actualResult: true,
          notes: true,
          testCase: {
            select: {
              tcId: true,
              suite: { select: { name: true, project: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  if (!run) notFound();

  const total = run.results.length;
  const passed = run.results.filter((r) => r.status === "PASS").length;
  const failed = run.results.filter((r) => r.status === "FAIL").length;
  const blocked = run.results.filter((r) => r.status === "BLOCKED").length;
  const skipped = run.results.filter((r) => r.status === "SKIPPED").length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  // Grouping per project -> per suite
  const projectMap = new Map<string, Map<string, typeof run.results>>();
  for (const r of run.results) {
    const suite = r.testCase?.suite;
    const pname = suite?.project?.name ?? "Unknown";
    const sname = suite?.name ?? "Tanpa Suite";
    if (!projectMap.has(pname)) projectMap.set(pname, new Map());
    const suiteMap = projectMap.get(pname)!;
    if (!suiteMap.has(sname)) suiteMap.set(sname, []);
    suiteMap.get(sname)!.push(r);
  }

  const runCode = runCodeOf({ id: run.id, sprint: run.sprint, createdAt: run.createdAt });

  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  const statusColor: Record<string, string> = {
    PASS: "#059669",
    FAIL: "#E11D48",
    BLOCKED: "#D97706",
    SKIPPED: "#6B7280",
    NOT_RUN: "#94A3B8",
  };

  return (
    <div
      className="report-container"
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "#0F172A",
        padding: "2rem",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <ReportActionBar detailUrl={`/test-runs/${run.id}`} fileName={`test-run-${runCode}`} />

      {/* Document header */}
      <div
        style={{
          borderBottom: "2px solid #0F172A",
          paddingBottom: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#475569", fontWeight: 700 }}>
          TEST EXECUTION REPORT
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{run.name}</div>
        <div style={{ marginTop: 4 }}>
          <span
            style={{
              display: "inline-block",
              padding: "0.1rem 0.6rem",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: run.status === "COMPLETED" ? "#ECFDF5" : "#FFFBEB",
              color: run.status === "COMPLETED" ? "#047857" : "#B45309",
              border: `1px solid ${run.status === "COMPLETED" ? "#A7F3D0" : "#FDE68A"}`,
            }}
          >
            {run.status === "COMPLETED" ? "Completed" : "In Progress"}
          </span>
        </div>
      </div>

      {/* Metadata grid — 3 kolom seimbang, label + ":" sejajar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.55rem 1.5rem",
          alignItems: "baseline",
          fontSize: 12,
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: "0.9rem 1rem",
          marginBottom: "1.25rem",
        }}
      >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>ID</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600, flex: 1 }}>{runCode}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Project</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.project.name}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Sprint</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.sprint ?? "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Tipe Activity</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.activityType ?? "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Platform</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.platforms ?? "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Environment</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.environment ?? "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>QA / Tester</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.createdBy?.name ?? "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Task Link</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ flex: 1 }}>
          {run.taskLink ? (
            <a
              href={run.taskLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}
            >
              ↗ Open Card
            </a>
          ) : (
            "—"
          )}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Created</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{fmt(run.createdAt)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
        <span style={{ flex: "0 0 100px", color: "#64748B", fontWeight: 600 }}>Completed</span>
        <span style={{ color: "#CBD5E1" }}>:</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{run.completedAt ? fmt(run.completedAt) : "—"}</span>
      </div>
      </div>

      {/* Summary metrics table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          marginBottom: "1.5rem",
          border: "1px solid #E2E8F0",
        }}
      >
        <thead>
          <tr style={{ background: "#F1F5F9", color: "#475569" }}>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Total TC</th>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Passed</th>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Failed</th>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Blocked</th>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Skipped</th>
            <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>Pass Rate (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ textAlign: "center", fontWeight: 700 }}>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>{total}</td>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", color: "#059669" }}>
              {passed}
            </td>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", color: "#E11D48" }}>
              {failed}
            </td>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>{blocked}</td>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>{skipped}</td>
            <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>{passRate}%</td>
          </tr>
        </tbody>
      </table>

      {/* Detailed breakdown per project & suite */}
      {Array.from(projectMap.entries()).map(([pname, suiteMap]) => (
        <div key={pname} style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: "0.25rem", borderBottom: "1px solid #CBD5E1" }}>
            🔹 Project: {pname}
          </div>
          {Array.from(suiteMap.entries()).map(([sname, rows]) => (
            <div key={sname} style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: "0.35rem" }}>
                🔸 Suite: {sname}
              </div>
              {rows.map((r) => {
                const color = statusColor[r.status] ?? "#0F172A";
                return (
                  <div
                    key={r.id}
                    style={{
                      marginBottom: "0.75rem",
                      border: "1px solid #E2E8F0",
                      borderRadius: 6,
                      padding: "0.5rem 0.75rem",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ color, fontWeight: 700 }}>[{r.status}]</span>{" "}
                      {r.testCase?.tcId ?? "—"} - {r.titleSnapshot}
                    </div>
                    <div style={{ marginTop: "0.25rem", color: "#334155" }}>
                      <span style={{ color: "#64748B" }}>• Actual Result : </span>
                      {r.actualResult ?? "—"}
                    </div>
                    <div style={{ color: "#334155" }}>
                      <span style={{ color: "#64748B" }}>• Notes : </span>
                      {r.notes ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: "1.5rem", textAlign: "center" }}>
        Generated by Soulparking Test Case Management · {new Date().toLocaleString("id-ID")}
      </div>
    </div>
  );
}
