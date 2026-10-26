/**
 * Status TestRun dan aturan turunannya.
 *
 * Dipisah dari `lib/actions/test-runs.ts` karena file server action hanya
 * boleh mengekspor fungsi async — konstanta runtime tidak diizinkan di sana.
 *
 * - PENDING     : run sudah dibuat & siap ditest, belum ada eksekusi.
 *                 Nilai enum di DB tetap PENDING; label tampilannya "Open".
 * - IN_PROGRESS : sedang dieksekusi (otomatis begitu hasil pertama masuk)
 * - COMPLETED   : selesai (punya completedAt)
 * - RE_OPEN     : pernah COMPLETED, dibuka lagi untuk retest/regresi
 */
export type RunStatusValue = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "RE_OPEN";

/** Label tampilan sebuah status. */
export const RUN_STATUS_LABEL: Record<RunStatusValue, string> = {
  PENDING: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  RE_OPEN: "Re-Open",
};

/** "Belum selesai" — inilah yang tampil di halaman Active Runs. */
export const OPEN_RUN_STATUSES: RunStatusValue[] = ["PENDING", "IN_PROGRESS", "RE_OPEN"];

/**
 * Run yang SEDANG dieksekusi. PENDING sengaja tidak termasuk: run yang siap
 * ditest baru boleh jadi target eksekusi cepat kalau tidak ada run berjalan
 * (lihat `saveExecutionForTestCase`) — supaya hasil tidak nyasar ke run yang
 * belum dimulai saat ada run yang jelas-jelas sedang dipakai.
 */
export const ACTIVE_RUN_STATUSES: RunStatusValue[] = ["IN_PROGRESS", "RE_OPEN"];

/**
 * Status yang dianggap "punya bukti eksekusi" untuk metrik coverage.
 * RE_OPEN tetap dihitung: run itu pernah tuntas, isinya evidence nyata —
 * kalau dikecualikan, membuka ulang sebuah run akan membuat angka coverage
 * turun palsu.
 */
export const EXECUTED_RUN_STATUSES: RunStatusValue[] = ["COMPLETED", "RE_OPEN"];
