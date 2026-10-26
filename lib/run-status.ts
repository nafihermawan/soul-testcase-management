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

/**
 * Status TestCase yang dikeluarkan dari cakupan run yang BELUM selesai.
 *
 * TC yang di-Deprecate setelah terlanjur berada di sebuah run tidak boleh lagi
 * tampil sebagai "Untested" di daftar eksekusi, tidak ikut dihitung di total &
 * progress, dan tidak boleh menahan tombol Complete Run.
 *
 * Run COMPLETED sengaja TIDAK disaring: barisnya adalah riwayat eksekusi yang
 * sah dan sudah punya status akhir.
 *
 * Ketiga bentuk di bawah adalah SATU aturan yang sama, dipakai sesuai bentuk
 * datanya: `ACTIVE_RUN_TC_SCOPE` untuk query Prisma (daftar run & guard
 * completeRun), `isDeprecatedTcStatus` untuk baris yang sudah ter-fetch
 * (payload detail run, karena status run baru diketahui setelah query).
 */
export const DEPRECATED_TC_STATUS = "DEPRECATED" as const;

export const ACTIVE_RUN_TC_SCOPE = {
  testCase: { status: { not: DEPRECATED_TC_STATUS } },
} as const;

export function isDeprecatedTcStatus(status: string | null | undefined): boolean {
  return status === DEPRECATED_TC_STATUS;
}
