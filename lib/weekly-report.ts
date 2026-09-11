import { formatPct, type ExecutionCounts } from "@/lib/qa-metrics";
import type { WeeklyReportPayload, WeeklyReportTask } from "@/types/api";

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

const fmtDateFull = (iso: string): string =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const periodLabel = (from: string, to: string): string => {
  const sameYear = new Date(from).getFullYear() === new Date(to).getFullYear();
  return sameYear
    ? `${fmtDate(from)} – ${fmtDateFull(to)}`
    : `${fmtDateFull(from)} – ${fmtDateFull(to)}`;
};

/** Baris meta: hanya field yang terisi, digabung dengan " · ". */
const metaLine = (t: WeeklyReportTask): string =>
  [t.project, t.sprint, t.environment, t.activityType].filter(Boolean).join(" · ");

const countsLine = (c: ExecutionCounts): string => {
  const parts = [`Pass ${c.passed}`, `Fail ${c.failed}`];
  if (c.blocked > 0) parts.push(`Blocked ${c.blocked}`);
  parts.push(`Not Run ${c.notRun}`);
  return parts.join(" · ");
};

const bugLine = (t: WeeklyReportTask): string => {
  if (t.openBugs === 0) return "Bug terbuka: tidak ada";
  const ch = t.criticalHighBugs > 0 ? ` (${t.criticalHighBugs} Critical/High)` : "";
  return `Bug terbuka: ${t.openBugs}${ch}`;
};

const taskBlock = (t: WeeklyReportTask, index: number): string[] => {
  const lines = [`${index + 1}. ${t.name}`];
  const meta = metaLine(t);
  if (meta) lines.push(`   ${meta}`);
  if (t.counts.total === 0) {
    lines.push("   Progress: belum ada test case");
  } else if (t.counts.executed === 0) {
    lines.push(`   Progress: 0/${t.counts.total} TC — belum ada eksekusi`);
  } else {
    lines.push(
      `   Progress: ${t.counts.executed}/${t.counts.total} TC (${formatPct(t.progressPct)})`
    );
  }
  lines.push(`   ${countsLine(t.counts)}`);
  if (t.openBugs > 0) lines.push(`   ${bugLine(t)}`);
  if (t.completedAt) lines.push(`   Selesai: ${fmtDate(t.completedAt)}`);
  if (t.taskLink) lines.push(`   Task: ${t.taskLink}`);
  return lines;
};

/**
 * Susun subject + body email laporan mingguan.
 * Field opsional yang kosong dilewati (bukan ditulis "—") supaya body tetap bersih.
 */
export function buildWeeklyReportEmail(payload: WeeklyReportPayload): {
  subject: string;
  body: string;
} {
  const { running, done, summary, period } = payload;
  const label = periodLabel(period.from, period.to);

  const subject = `Weekly QA Progress — ${label}`;

  const lines: string[] = ["Halo semua,", "", `Berikut progres testing periode ${label}.`];

  if (running.length > 0) {
    lines.push("", `SEDANG BERJALAN (${running.length})`);
    running.forEach((t, i) => lines.push(...taskBlock(t, i)));
  }

  if (done.length > 0) {
    lines.push("", `BARU SELESAI MINGGU INI (${done.length})`);
    done.forEach((t, i) => {
      // Untuk task selesai, ringkas jadi 2 baris saja (nomor, hasil, tanggal).
      const meta = metaLine(t);
      const hasil =
        t.counts.total > 0
          ? `${formatPct(t.progressPct)} (${t.counts.passed}/${t.counts.total})`
          : "tidak ada test case";
      const tanggal = t.completedAt ? ` · ${fmtDate(t.completedAt)}` : "";
      lines.push(`${i + 1}. ${t.name} — ${hasil}${tanggal}`);
      if (meta) lines.push(`   ${meta}`);
      if (t.openBugs > 0) lines.push(`   ${bugLine(t)}`);
    });
  }

  if (running.length === 0 && done.length === 0) {
    lines.push("", "Belum ada task yang sedang atau baru selesai dalam tahap testing.");
  } else {
    lines.push(
      "",
      "RINGKASAN",
      [
        `${summary.runningTasks} task berjalan`,
        `${summary.doneTasks} selesai`,
        `${summary.totalTC} TC`,
        `pass rate ${formatPct(summary.passRate)}`,
        `${summary.openBugs} bug terbuka`,
      ].join(" · ")
    );
  }

  return { subject, body: lines.join("\n") };
}
