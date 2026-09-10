/**
 * Semantik metrik QA: definisi tunggal agar dashboard tidak pernah menampilkan
 * persentase menyesatkan (mis. 0% padahal belum ada eksekusi sama sekali).
 *
 * Konvensi penting:
 * - "Executed" = hasil run dengan status != NOT_RUN.
 * - "Tested"  = TC unik yang punya hasil executed pada run yang sudah COMPLETED.
 * - Persentase HANYA ditampilkan bila penyebutnya > 0; selain itu "—".
 */

export type RunResultStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

export type ExecutionCounts = {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  notRun: number;
  total: number;
  executed: number;
};

/** Ambang batas Testing Health — ubah di sini saja. */
export const HEALTH_THRESHOLDS = {
  /** Pass rate di bawah ini dianggap kritis. */
  criticalPassRate: 70,
  /** Pass rate di bawah ini butuh perhatian. */
  attentionPassRate: 85,
  /** Coverage di bawah ini butuh perhatian. */
  attentionCoverage: 50,
} as const;

export const PLATFORM_OPTIONS = ["WEB", "MOBILE", "HARDWARE", "API"] as const;
export type PlatformValue = (typeof PLATFORM_OPTIONS)[number];

export const ENVIRONMENT_OPTIONS = ["DEV", "STG", "PRE-PROD", "PROD"] as const;

export type PeriodKey = "ALL" | "7D" | "30D" | "MONTH";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "ALL", label: "Semua Waktu" },
  { value: "7D", label: "7 Hari Terakhir" },
  { value: "30D", label: "30 Hari Terakhir" },
  { value: "MONTH", label: "Bulan Ini" },
];

export function emptyCounts(): ExecutionCounts {
  return { passed: 0, failed: 0, blocked: 0, skipped: 0, notRun: 0, total: 0, executed: 0 };
}

export function addCounts(a: ExecutionCounts, b: ExecutionCounts): ExecutionCounts {
  return {
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    blocked: a.blocked + b.blocked,
    skipped: a.skipped + b.skipped,
    notRun: a.notRun + b.notRun,
    total: a.total + b.total,
    executed: a.executed + b.executed,
  };
}

/** Susun counts dari daftar status; `total` dihitung dari jumlah entri. */
export function countsFromStatuses(statuses: RunResultStatus[]): ExecutionCounts {
  const c = emptyCounts();
  c.total = statuses.length;
  for (const s of statuses) {
    if (s === "PASS") c.passed++;
    else if (s === "FAIL") c.failed++;
    else if (s === "BLOCKED") c.blocked++;
    else if (s === "SKIPPED") c.skipped++;
    else c.notRun++;
    if (s !== "NOT_RUN") c.executed++;
  }
  return c;
}

/** Persentase aman: null bila penyebut 0 (agar UI menampilkan "—", bukan 0%). */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Pass rate dari counts; null bila belum ada eksekusi. */
export function passRateOf(c: ExecutionCounts): number | null {
  return pct(c.passed, c.executed);
}

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export type Health = "HEALTHY" | "ATTENTION_NEEDED" | "CRITICAL" | "NO_DATA";

export const HEALTH_META: Record<
  Health,
  { label: string; tone: "success" | "warning" | "danger" | "neutral"; hint: string }
> = {
  HEALTHY: { label: "Healthy", tone: "success", hint: "Tidak ada masalah yang butuh perhatian." },
  ATTENTION_NEEDED: { label: "Attention Needed", tone: "warning", hint: "Ada item yang sebaiknya segera ditindak." },
  CRITICAL: { label: "Critical", tone: "danger", hint: "Ada masalah kritis yang butuh tindakan segera." },
  NO_DATA: { label: "No Data", tone: "neutral", hint: "Belum ada eksekusi maupun bug tercatat." },
};

export function testingHealth(input: {
  executed: number;
  passRate: number | null;
  failed: number;
  criticalHighBugs: number;
  coveragePct: number | null;
}): Health {
  const { executed, passRate, failed, criticalHighBugs, coveragePct } = input;
  if (executed === 0 && criticalHighBugs === 0) return "NO_DATA";
  if (
    criticalHighBugs > 0 ||
    (passRate !== null && passRate < HEALTH_THRESHOLDS.criticalPassRate)
  ) {
    return "CRITICAL";
  }
  if (
    failed > 0 ||
    (passRate !== null && passRate < HEALTH_THRESHOLDS.attentionPassRate) ||
    (coveragePct !== null && coveragePct < HEALTH_THRESHOLDS.attentionCoverage)
  ) {
    return "ATTENTION_NEEDED";
  }
  return "HEALTHY";
}

/** Awal jendela periode; null = tanpa batas (semua waktu). */
export function periodStart(period: PeriodKey, now: Date = new Date()): Date | null {
  if (period === "ALL") return null;
  if (period === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = period === "7D" ? 7 : 30;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

export function withinPeriod(iso: string, period: PeriodKey, now: Date = new Date()): boolean {
  const start = periodStart(period, now);
  if (!start) return true;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= start.getTime();
}

/** Usia dalam hari (0 = hari ini). */
export function ageInDays(iso: string, now: Date = new Date()): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function formatAge(days: number): string {
  if (days <= 0) return "Hari ini";
  if (days === 1) return "1 hari";
  if (days < 30) return `${days} hari`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 bulan" : `${months} bulan`;
}

/** Urutan prioritas bug: Critical dulu, lalu High, lalu sisanya. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export function severityRank(severity: string | null | undefined): number {
  return SEVERITY_RANK[(severity ?? "").toUpperCase()] ?? 4;
}

/** Status bug yang dianggap masih "hidup" (belum selesai). */
export const ACTIVE_BUG_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/** Status bug yang menandakan sudah diperbaiki & menunggu retest QA. */
export const RETEST_BUG_STATUS = "RESOLVED";
