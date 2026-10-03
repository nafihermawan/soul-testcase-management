import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { runCodeOf } from "@/lib/format";
import { RUN_STATUS_LABEL, type RunStatusValue } from "@/lib/run-status";
import { requireUser } from "@/lib/hierarchy";
import { ReportActionBar } from "@/components/test-runs/report-action-bar";

/** Warna pill status untuk versi cetak (server component — tanpa modul client). */
const PRINT_RUN_STATUS_TONE: Record<string, { color: string; bg: string; border: string }> = {
  PENDING: { color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" },
  IN_PROGRESS: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  COMPLETED: { color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
  RE_OPEN: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
};

/** Label + warna pill status bug untuk versi cetak. */
const PRINT_BUG_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  OPEN: { label: "Open", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  IN_PROGRESS: { label: "In Progress", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  RESOLVED: { label: "Resolved", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
  CLOSED: { label: "Closed", color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" },
};

export default async function RunReportPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser();

  const run = await prisma.testRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      status: true,
      sprint: true,
      activityType: true,
      platforms: true,
      environment: true,
      taskLink: true,
      createdAt: true,
      completedAt: true,
      /** Catatan makro run yang diisi QA di Completion Summary Modal. */
      overallNotes: true,
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
          /** Bug yang ditautkan ke hasil eksekusi ini (dipakai seksi Bugs Found). */
          bugs: {
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              externalLink: true,
            },
          },
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

  // Bug unik yang ditautkan ke hasil eksekusi run ini (satu bug bisa dirujuk
  // dari beberapa hasil, jadi didedupe berdasarkan id).
  const bugMap = new Map<
    string,
    {
      id: string;
      title: string;
      severity: string | null;
      status: string;
      externalLink: string | null;
    }
  >();
  for (const r of run.results) {
    for (const b of r.bugs) if (!bugMap.has(b.id)) bugMap.set(b.id, b);
  }
  const bugList = Array.from(bugMap.values());

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
        // Ruang bawah ekstra supaya tombol aksi (fixed, kanan bawah) tidak
        // menutupi konten terakhir saat dokumen digulir sampai bawah.
        paddingBottom: "4rem",
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
              ...(() => {
                const tone =
                  PRINT_RUN_STATUS_TONE[run.status] ?? PRINT_RUN_STATUS_TONE.IN_PROGRESS;
                return {
                  background: tone.bg,
                  color: tone.color,
                  border: `1px solid ${tone.border}`,
                };
              })(),
            }}
          >
            {RUN_STATUS_LABEL[run.status as RunStatusValue] ?? run.status}
          </span>
        </div>
      </div>

      {/* Metadata grid — 3 kolom seimbang, label + ":" sejajar */}
      <div
        data-pdf-avoid-break=""
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
        data-pdf-avoid-break=""
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

      {/* Catatan Tambahan / Execution Notes — highlight summary utama, tepat
          di bawah ringkasan metrik dan di atas daftar bug. Diisi QA saat
          Complete Test Run (overallNotes). */}
      <div
        data-pdf-avoid-break=""
        style={{
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: "0.9rem 1rem",
          marginBottom: "1.5rem",
          background: "#F8FAFC",
          breakInside: "avoid",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#475569",
            marginBottom: "0.4rem",
          }}
        >
          CATATAN TAMBAHAN / EXECUTION NOTES
        </div>
        {run.overallNotes?.trim() ? (
          <div
            style={{
              fontSize: 12,
              color: "#334155",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {run.overallNotes.trim()}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#94A3B8" }}>Tidak ada catatan tambahan.</div>
        )}
      </div>

      {/* Bugs Found — daftar bug yang ditautkan ke hasil eksekusi run ini.
          Diletakkan tepat di bawah ringkasan metrik (Execution Overview). */}
      <div data-pdf-avoid-break="" style={{ marginBottom: "1.5rem", breakInside: "avoid" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#475569",
            marginBottom: "0.5rem",
          }}
        >
          BUGS FOUND
        </div>

        {bugList.length === 0 ? (
          <div
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "0.9rem 1rem",
              background: "#F8FAFC",
              fontSize: 12,
              color: "#64748B",
            }}
          >
            Tidak ada bug yang ditemukan selama eksekusi ini.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              border: "1px solid #E2E8F0",
            }}
          >
            <thead>
              <tr style={{ background: "#F1F5F9", color: "#475569" }}>
                <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", textAlign: "left" }}>
                  Title / Summary
                </th>
                <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", textAlign: "left" }}>
                  Severity
                </th>
                <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", textAlign: "left" }}>
                  Status
                </th>
                <th style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem", textAlign: "left" }}>
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {bugList.map((b) => {
                const tone = PRINT_BUG_STATUS[b.status] ?? PRINT_BUG_STATUS.OPEN;
                return (
                  <tr key={b.id}>
                    <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>
                      {b.title}
                    </td>
                    <td
                      style={{
                        border: "1px solid #E2E8F0",
                        padding: "0.4rem 0.5rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.severity ?? "—"}
                    </td>
                    <td style={{ border: "1px solid #E2E8F0", padding: "0.4rem 0.5rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.05rem 0.5rem",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: tone.bg,
                          color: tone.color,
                          border: `1px solid ${tone.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tone.label}
                      </span>
                    </td>
                    <td
                      style={{
                        border: "1px solid #E2E8F0",
                        padding: "0.4rem 0.5rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.externalLink ? (
                        <a
                          href={b.externalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}
                        >
                          ↗ Link
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detailed breakdown per project & suite */}
      {Array.from(projectMap.entries()).map(([pname, suiteMap]) => (
        <div key={pname} style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              paddingBottom: "0.25rem",
              borderBottom: "1px solid #CBD5E1",
              // Header project jangan menggantung sendiri di dasar halaman.
              breakAfter: "avoid",
            }}
          >
            🔹 Project: {pname}
          </div>
          {Array.from(suiteMap.entries()).map(([sname, rows]) => (
            <div key={sname} style={{ marginTop: "0.75rem" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#475569",
                  marginBottom: "0.35rem",
                  // Header suite ikut dengan minimal satu kartu di bawahnya.
                  breakAfter: "avoid",
                }}
              >
                🔸 Suite: {sname}
              </div>
              {rows.map((r) => {
                const color = statusColor[r.status] ?? "#0F172A";
                return (
                  <div
                    key={r.id}
                    data-pdf-avoid-break=""
                    style={{
                      marginBottom: "0.75rem",
                      border: "1px solid #E2E8F0",
                      borderRadius: 6,
                      padding: "0.5rem 0.75rem",
                      fontSize: 12,
                      // Kartu item tidak boleh terpotong di tengah halaman;
                      // kalau tidak muat, pindah utuh ke halaman berikutnya.
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
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
                      {r.notes?.trim() || "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {/* Footer HTML — tampil di Print. Saat export PDF baris ini dibuang dari
          kanvas (lihat report-action-bar) karena digantikan footer per-halaman. */}
      <div
        className="report-footer"
        style={{ fontSize: 11, color: "#94A3B8", marginTop: "1.5rem", textAlign: "center" }}
      >
        Generated by Soulparking Test Case Management · {new Date().toLocaleString("id-ID")}
      </div>
    </div>
  );
}
