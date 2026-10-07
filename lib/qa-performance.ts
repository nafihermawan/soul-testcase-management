/**
 * Aturan & konstanta QA Performance Analytics — sengaja dikumpulkan di satu file
 * supaya bobot skor dan ambang badge mudah diubah tanpa menyentuh UI/API.
 *
 * Catatan data (penting): TIDAK ada kolom durasi/`executedAt` di skema, dan
 * `TestRunResult` hanya punya `updatedAt` (waktu modifikasi terakhir), sehingga
 * metrik "Avg. Execution Time" sengaja tidak dihitung di sini.
 */

export type PeriodMode = "quarter" | "year";

export type PerformanceBadge = "TOP_PERFORMER" | "ON_TRACK" | "NEEDS_ATTENTION";

/** Bobot skor performa (total 1.0). */
export const SCORE_WEIGHTS = {
  passRate: 0.6,
  volume: 0.25,
  bugYield: 0.15,
} as const;

/** Ambang badge performa (skor 0–100). */
export const TOP_PERFORMER_SCORE = 85;
export const ON_TRACK_SCORE = 70;

export const BADGE_LABEL: Record<PerformanceBadge, string> = {
  TOP_PERFORMER: "Top Performer",
  ON_TRACK: "On Track",
  NEEDS_ATTENTION: "Needs Attention",
};

/** Rentang waktu [start, end) dalam UTC untuk mode quarter/year. */
export function periodRange(
  mode: PeriodMode,
  year: number,
  quarter?: number
): { start: Date; end: Date; label: string } {
  if (mode === "quarter") {
    const q = Math.min(4, Math.max(1, Math.trunc(quarter ?? 1)));
    const startMonth = (q - 1) * 3;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 1)),
      label: `Q${q} ${year}`,
    };
  }
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
    label: `${year}`,
  };
}

/**
 * Skor 0–100 dari komponen yang memang tersedia:
 * - pass rate (weighted periode) → bobot terbesar
 * - volume eksekusi relatif ke member paling produktif
 * - jumlah bug ditemukan relatif ke yang paling banyak
 */
export function performanceScore(input: {
  passRate: number | null;
  executed: number;
  bugs: number;
  maxExecuted: number;
  maxBugs: number;
}): { score: number; badge: PerformanceBadge } {
  const pass = input.passRate ?? 0;
  const volume = input.maxExecuted > 0 ? input.executed / input.maxExecuted : 0;
  const bugYield = input.maxBugs > 0 ? input.bugs / input.maxBugs : 0;
  const score = Math.round(
    pass * SCORE_WEIGHTS.passRate +
      volume * SCORE_WEIGHTS.volume * 100 +
      bugYield * SCORE_WEIGHTS.bugYield * 100
  );
  const badge: PerformanceBadge =
    score >= TOP_PERFORMER_SCORE
      ? "TOP_PERFORMER"
      : score >= ON_TRACK_SCORE
        ? "ON_TRACK"
        : "NEEDS_ATTENTION";
  return { score, badge };
}
