/**
 * Status TestRun dan aturan turunannya.
 *
 * Dipisah dari `lib/actions/test-runs.ts` karena file server action hanya
 * boleh mengekspor fungsi async — konstanta runtime tidak diizinkan di sana.
 *
 * - PENDING     : run sudah dibuat, testing belum dimulai
 * - IN_PROGRESS : sedang dieksekusi
 * - COMPLETED   : selesai (punya completedAt)
 * - RE_OPEN     : pernah COMPLETED, dibuka lagi untuk retest/regresi
 */
export type RunStatusValue = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "RE_OPEN";

/** Urutan tampilan (untuk dropdown status). */
export const RUN_STATUS_ORDER: RunStatusValue[] = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "RE_OPEN",
];

export const RUN_STATUS_LABEL: Record<RunStatusValue, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  RE_OPEN: "Re-Open",
};

/** "Belum selesai" — inilah yang tampil di halaman Active Runs. */
export const OPEN_RUN_STATUSES: RunStatusValue[] = ["PENDING", "IN_PROGRESS", "RE_OPEN"];

/** Run yang boleh menerima hasil eksekusi baru (PENDING belum dimulai). */
export const ACTIVE_RUN_STATUSES: RunStatusValue[] = ["IN_PROGRESS", "RE_OPEN"];

/**
 * Status yang dianggap "punya bukti eksekusi" untuk metrik coverage.
 * RE_OPEN tetap dihitung: run itu pernah tuntas, isinya evidence nyata —
 * kalau dikecualikan, membuka ulang sebuah run akan membuat angka coverage
 * turun palsu.
 */
export const EXECUTED_RUN_STATUSES: RunStatusValue[] = ["COMPLETED", "RE_OPEN"];
