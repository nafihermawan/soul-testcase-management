"use client";

import { BADGE_LABEL } from "@/lib/qa-performance";
import type { QaPerformancePayload } from "@/types/api";

/** Nama file: periode + timestamp lokal (pola sama dengan export test case). */
function fileBase(period: QaPerformancePayload["period"]): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const slug = period.mode === "quarter" ? `q${period.quarter}-${period.year}` : `year-${period.year}`;
  return `qa-performance-${slug}-${stamp}`;
}

/**
 * Baris laporan: judul + periode, ringkasan 4 metrik, lalu tabel member.
 * Sengaja satu bentuk untuk CSV & XLSX supaya isinya identik.
 */
function reportRows(data: QaPerformancePayload): Record<string, string | number>[] {
  const t = data.totals;
  const blank = { "QA Member": "" };
  return [
    { "QA Member": `QA Performance Analytics — ${data.period.label}` },
    blank,
    { "QA Member": "Total Executed Test Cases", Role: t.executedCases },
    { "QA Member": "Total Test Cases Created", Role: t.createdCases },
    { "QA Member": "Average Pass Rate (%)", Role: t.passRate ?? "—" },
    { "QA Member": "Total Bugs Reported", Role: t.bugsReported },
    { "QA Member": "Resolved / Re-opened Runs", Role: `${t.completedRuns} / ${t.reopenedRuns}` },
    blank,
    ...data.members.map((m) => ({
      "QA Member": m.name ?? "(tanpa nama)",
      Role: m.roleLabel,
      "Assigned Runs": m.assignedRuns,
      "Executed Cases": m.executedCases,
      "TCs Created": m.createdCases,
      "Pass Rate (%)": m.passRate ?? "—",
      "Bugs Found": m.bugsFound,
      Score: m.score,
      Status: BADGE_LABEL[m.badge],
    })),
  ];
}

/** Export CSV (papaparse, di-import dinamis seperti export test case). */
export async function exportQaPerformanceCsv(data: QaPerformancePayload): Promise<void> {
  const Papa = (await import("papaparse")).default;
  const csv = Papa.unparse(reportRows(data));
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBase(data.period)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export Excel (.xlsx). */
export async function exportQaPerformanceXlsx(data: QaPerformancePayload): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(reportRows(data));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "QA Performance");
  XLSX.writeFile(wb, `${fileBase(data.period)}.xlsx`);
}
