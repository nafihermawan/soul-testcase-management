import { describe, expect, it } from "vitest";
import {
  ageInDays,
  bugSlaDays,
  countsFromStatuses,
  effectiveTotal,
  emptyCounts,
  executedValidCount,
  executionProgress,
  formatPct,
  isActiveBugStatus,
  isBugOverdue,
  passRateOf,
  pct,
  remainingCount,
  testingHealth,
  type RunResultStatus,
} from "./qa-metrics";

/** Susun counts dari daftar status (urutan bebas). */
const from = (statuses: RunResultStatus[]) => countsFromStatuses(statuses);
const rep = (status: RunResultStatus, n: number): RunResultStatus[] => Array<RunResultStatus>(n).fill(status);

describe("countsFromStatuses / emptyCounts", () => {
  it("menghitung tiap status dan total", () => {
    const c = from(["PASS", "FAIL", "BLOCKED", "SKIPPED", "NOT_RUN"]);
    expect(c).toEqual({ passed: 1, failed: 1, blocked: 1, skipped: 1, notRun: 1, total: 5, executed: 4 });
  });

  it("emptyCounts semuanya nol", () => {
    expect(emptyCounts()).toEqual({ passed: 0, failed: 0, blocked: 0, skipped: 0, notRun: 0, total: 0, executed: 0 });
  });
});

describe("passRateOf — SKIPPED tidak masuk penyebut, BLOCKED masuk", () => {
  it("hanya menghitung PASS/(PASS+FAIL+BLOCKED)", () => {
    // 2 pass dari 3 eksekusi valid (1 fail) — skipped diabaikan.
    expect(passRateOf(from([...rep("PASS", 2), "FAIL", ...rep("SKIPPED", 5)]))).toBe(67);
  });

  it("BLOCKED ikut penyebut (tidak menaikkan pass rate)", () => {
    expect(passRateOf(from(["PASS", "BLOCKED"]))).toBe(50);
  });

  it("null bila tidak ada eksekusi valid", () => {
    expect(passRateOf(from(["SKIPPED", "NOT_RUN"]))).toBeNull();
  });

  it("angka agregat nyata: 199P/5F/43S -> 98%", () => {
    const c = { passed: 199, failed: 5, blocked: 0, skipped: 43, notRun: 24, total: 271, executed: 247 };
    expect(passRateOf(c)).toBe(98);
  });
});

describe("executionProgress — SKIPPED tidak menambah beban", () => {
  it("TC yang seluruhnya skipped dihitung 100%", () => {
    expect(executionProgress(from(["PASS", "SKIPPED", "SKIPPED"]))).toBe(100);
  });

  it("NOT_RUN tetap menurunkan progress", () => {
    // 1 valid / (3 - 1 skipped) = 50%
    expect(executionProgress(from(["PASS", "NOT_RUN", "SKIPPED"]))).toBe(50);
  });

  it("null bila semua TC skipped (penyebut 0)", () => {
    expect(executionProgress(from(["SKIPPED", "SKIPPED"]))).toBeNull();
  });

  it("angka agregat nyata: 204 valid / (271-43) -> 89%", () => {
    const c = { passed: 199, failed: 5, blocked: 0, skipped: 43, notRun: 24, total: 271, executed: 247 };
    expect(executionProgress(c)).toBe(89);
  });
});

describe("helper hitung turunan", () => {
  const c = from([...rep("PASS", 3), "FAIL", "BLOCKED", ...rep("SKIPPED", 2), "NOT_RUN"]);

  it("executedValidCount = PASS+FAIL+BLOCKED", () => {
    expect(executedValidCount(c)).toBe(5);
  });

  it("effectiveTotal = total - skipped", () => {
    expect(effectiveTotal(c)).toBe(6);
  });

  it("remainingCount = NOT_RUN", () => {
    expect(remainingCount(c)).toBe(1);
  });

  it("pct membulatkan dan null saat penyebut 0", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBeNull();
    expect(formatPct(null)).toBe("—");
    expect(formatPct(84)).toBe("84%");
  });
});

describe("testingHealth — ambang batas", () => {
  it("NO_DATA saat belum ada eksekusi & tanpa bug kritis", () => {
    expect(
      testingHealth({ executed: 0, passRate: null, failed: 0, criticalHighBugs: 0, coveragePct: null })
    ).toBe("NO_DATA");
  });

  it("CRITICAL saat ada bug critical/high atau pass rate < 70", () => {
    expect(
      testingHealth({ executed: 10, passRate: 95, failed: 0, criticalHighBugs: 1, coveragePct: 90 })
    ).toBe("CRITICAL");
    expect(
      testingHealth({ executed: 10, passRate: 60, failed: 0, criticalHighBugs: 0, coveragePct: 90 })
    ).toBe("CRITICAL");
  });

  it("ATTENTION_NEEDED saat ada fail atau pass rate/coverage di bawah ambang perhatian", () => {
    expect(
      testingHealth({ executed: 10, passRate: 90, failed: 1, criticalHighBugs: 0, coveragePct: 90 })
    ).toBe("ATTENTION_NEEDED");
    expect(
      testingHealth({ executed: 10, passRate: 90, failed: 0, criticalHighBugs: 0, coveragePct: 20 })
    ).toBe("ATTENTION_NEEDED");
  });

  it("HEALTHY saat semua indikator aman", () => {
    expect(
      testingHealth({ executed: 10, passRate: 95, failed: 0, criticalHighBugs: 0, coveragePct: 90 })
    ).toBe("HEALTHY");
  });
});

describe("SLA bug", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  it("SLA per severity: Critical 2 hari, High 7 hari, lainnya tanpa SLA", () => {
    expect(bugSlaDays("CRITICAL")).toBe(2);
    expect(bugSlaDays("high")).toBe(7);
    expect(bugSlaDays("MEDIUM")).toBeNull();
  });

  it("overdue hanya untuk bug AKTIF yang melewati SLA", () => {
    expect(isBugOverdue(daysAgo(3), "OPEN", "CRITICAL", now)).toBe(true);
    expect(isBugOverdue(daysAgo(1), "OPEN", "CRITICAL", now)).toBe(false);
    expect(isBugOverdue(daysAgo(30), "CLOSED", "CRITICAL", now)).toBe(false);
    expect(isBugOverdue(daysAgo(30), "OPEN", "MEDIUM", now)).toBe(false);
  });

  it("ageInDays menghitung hari penuh", () => {
    expect(ageInDays(daysAgo(3), now)).toBe(3);
  });
});

describe("isActiveBugStatus — bug yang masih menahan penyelesaian", () => {
  it("OPEN & IN_PROGRESS dianggap aktif", () => {
    expect(isActiveBugStatus("OPEN")).toBe(true);
    expect(isActiveBugStatus("IN_PROGRESS")).toBe(true);
  });

  it("RESOLVED & CLOSED tidak aktif (tidak boleh memblokir)", () => {
    expect(isActiveBugStatus("RESOLVED")).toBe(false);
    expect(isActiveBugStatus("CLOSED")).toBe(false);
  });

  it("nilai kosong / status asing tidak dianggap aktif", () => {
    expect(isActiveBugStatus(null)).toBe(false);
    expect(isActiveBugStatus(undefined)).toBe(false);
    expect(isActiveBugStatus("")).toBe(false);
    expect(isActiveBugStatus("RE_OPEN")).toBe(false);
  });
});
