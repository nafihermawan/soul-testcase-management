"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import type { ReportEntry } from "@/lib/playwright-report";

export type AutomationActionState = {
  error?: string;
  success?: boolean;
};

function handleError(error: unknown): AutomationActionState {
  console.error(error);
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/**
 * Link otomatis (bulk) ke TestCase yang belum punya AutomationLink.
 * - externalTestPattern: pola external test id; `{TC_ID}` diganti tcId asli TC.
 * - scriptPathPrefix: prefix path script; `{TC_ID}` diganti tcId asli TC.
 */
export async function bulkLinkAutomation(
  testCaseIds: string[],
  options: { externalTestPattern?: string; scriptPathPrefix?: string }
): Promise<AutomationActionState> {
  await requireRole("QA");
  const ids = Array.from(new Set(testCaseIds.filter(Boolean)));
  if (ids.length === 0) return { error: "Tidak ada test case dipilih." };

  const pattern = (options.externalTestPattern ?? "").trim();
  const prefix = (options.scriptPathPrefix ?? "").trim();
  if (!pattern && !prefix) {
    return { error: "Isi pola External Test ID atau prefix Script Path." };
  }

  try {
    const existing = await prisma.automationLink.findMany({
      where: { testCaseId: { in: ids } },
      select: { testCaseId: true },
    });
    const hasExisting = new Set(existing.map((e) => e.testCaseId));
    const freshIds = ids.filter((id) => !hasExisting.has(id));

    // TC tanpa suite tidak bisa di-cover makna; tetap pakai suite null aman.
    const tcs = await prisma.testCase.findMany({
      where: { id: { in: freshIds } },
      select: { id: true, tcId: true },
    });

    const data = tcs.flatMap((tc) => {
      const extId = pattern
        ? pattern.replace(/\{TC_ID\}/g, tc.tcId).replace(/\{ID\}/g, tc.tcId)
        : `AUTO-${tc.tcId}`;
      const script = prefix
        ? prefix.replace(/\{TC_ID\}/g, tc.tcId).replace(/\{ID\}/g, tc.tcId) +
          (prefix.includes("{TC_ID}") || prefix.includes("{ID}") ? "" : `/${tc.tcId}.spec.ts`)
        : null;
      return [
        {
          testCaseId: tc.id,
          externalTestId: extId.slice(0, 120),
          scriptPath: script,
          status: "NOT_AUTOMATED" as const,
        },
      ];
    });

    if (data.length > 0) {
      await prisma.automationLink.createMany({ data, skipDuplicates: true });
    }
    revalidatePath("/automation");
    return { success: true, created: data.length } as AutomationActionState & { created?: number };
  } catch (error) {
    return handleError(error);
  }
}

/** Unlink automation sekaligus dari daftar AutomationLink. */
export async function bulkUnlinkAutomation(linkIds: string[]): Promise<AutomationActionState> {
  await requireRole("QA");
  const ids = Array.from(new Set(linkIds.filter(Boolean)));
  if (ids.length === 0) return { error: "Tidak ada automation dipilih." };
  try {
    await prisma.automationLink.deleteMany({ where: { id: { in: ids } } });
    revalidatePath("/automation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Unlink automation berdasarkan id TestCase (dipakai bulk unlink lintas
 * halaman/grup, di mana linkId baris yang tampil belum tentu diketahui).
 */
export async function bulkUnlinkAutomationByTestCaseIds(
  testCaseIds: string[]
): Promise<AutomationActionState> {
  await requireRole("QA");
  const ids = Array.from(new Set(testCaseIds.filter(Boolean)));
  if (ids.length === 0) return { error: "Tidak ada test case dipilih." };
  try {
    await prisma.automationLink.deleteMany({ where: { testCaseId: { in: ids } } });
    revalidatePath("/automation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Update status automation (QA & DEVELOPER). DEVELOPER hanya bisa ubah status. */
export async function updateAutomationStatus(
  linkId: string,
  status: "NOT_AUTOMATED" | "AUTOMATED" | "FAILING" | "UNSTABLE"
): Promise<AutomationActionState> {
  await requireRole("DEVELOPER");
  try {
    await prisma.automationLink.update({ where: { id: linkId }, data: { status } });
    revalidatePath("/automation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Update script path / external id automation (QA). */
export async function updateAutomationLink(
  linkId: string,
  data: { externalTestId?: string; scriptPath?: string }
): Promise<AutomationActionState> {
  await requireRole("QA");
  try {
    await prisma.automationLink.update({
      where: { id: linkId },
      data: {
        ...(data.externalTestId?.trim() ? { externalTestId: data.externalTestId.trim() } : {}),
        ...(data.scriptPath !== undefined ? { scriptPath: data.scriptPath.trim() || null } : {}),
      },
    });
    revalidatePath("/automation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Link manual satu test case ke automation (QA). */
export async function createAutomationLink(
  testCaseId: string,
  data: { externalTestId: string; scriptPath?: string }
): Promise<AutomationActionState> {
  await requireRole("QA");
  const externalTestId = data.externalTestId.trim();
  if (!externalTestId) return { error: "External Test ID wajib diisi." };
  try {
    await prisma.automationLink.upsert({
      where: { testCaseId },
      create: {
        testCaseId,
        externalTestId,
        scriptPath: data.scriptPath?.trim() || null,
        status: "NOT_AUTOMATED",
      },
      update: {
        externalTestId,
        scriptPath: data.scriptPath?.trim() || null,
      },
    });
    revalidatePath("/automation");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/* ---------------- Upload laporan hasil test (Playwright JSON) ---------------- */

/** Hasil penerapan laporan test otomatis. */
export type ApplyAutomationReportResult = {
  success?: boolean;
  /** Link yang sudah ada dan statusnya diperbarui. */
  updated?: number;
  /** TC yang belum punya AutomationLink → dibuatkan link baru. */
  created?: number;
  /** ID yang tidak cocok dengan TC mana pun. */
  unmatched?: string[];
  error?: string;
};

/** Pemetaan status laporan → status automation (null = status tidak diubah). */
const REPORT_STATUS: Record<ReportEntry["status"], "AUTOMATED" | "FAILING" | null> = {
  PASS: "AUTOMATED",
  FAIL: "FAILING",
  // SKIPPED tidak mengubah status automation (hanya mencatat run terakhir).
  SKIPPED: null,
};

/**
 * Terapkan hasil test (mis. dari upload laporan JSON Playwright) ke Automation.
 *
 * Pencocokan ID, berurutan:
 *  1. `AutomationLink.externalTestId` yang sudah terdaftar (abaikan besar/kecil huruf).
 *  2. `TestCase.tcId` yang sama — supaya user TIDAK perlu mengisi External Test ID
 *     manual selama ID di judul test sama dengan tcId TC-nya (mis. "LG-001").
 * ID yang tidak ketemu dikembalikan di `unmatched` (TIDAK dibuatkan TC baru).
 */
export async function applyAutomationReport(
  entries: ReportEntry[]
): Promise<ApplyAutomationReportResult> {
  await requireRole("QA");

  const clean = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e.externalTestId === "string" && e.externalTestId.trim())
    .slice(0, 1000)
    .map((e) => ({
      externalTestId: e.externalTestId.trim(),
      status: (e.status === "PASS" || e.status === "FAIL"
        ? e.status
        : "SKIPPED") as ReportEntry["status"],
      scriptPath: typeof e.scriptPath === "string" ? e.scriptPath.trim() : "",
    }));

  if (clean.length === 0) return { error: "Tidak ada hasil test yang bisa diterapkan." };

  try {
    const ids = Array.from(new Set(clean.map((e) => e.externalTestId)));
    const now = new Date();

    // 1) Link yang sudah ada (cocokkan external test id, abaikan besar/kecil huruf).
    const links = await prisma.automationLink.findMany({
      where: { externalTestId: { in: ids, mode: "insensitive" } },
      select: { id: true, externalTestId: true },
    });
    const linkByExt = new Map(links.map((l) => [l.externalTestId.toLowerCase(), l.id]));

    // 2) Test Case yang tcId-nya sama dengan ID test.
    const pending = ids.filter((id) => !linkByExt.has(id.toLowerCase()));
    const tcs = pending.length
      ? await prisma.testCase.findMany({
          where: { tcId: { in: pending, mode: "insensitive" } },
          select: { id: true, tcId: true },
        })
      : [];
    const tcByTcId = new Map(tcs.map((t) => [t.tcId.toLowerCase(), t.id]));

    let updated = 0;
    let created = 0;
    const unmatched: string[] = [];

    for (const e of clean) {
      const lower = e.externalTestId.toLowerCase();
      const status = REPORT_STATUS[e.status];
      const linkId = linkByExt.get(lower);
      const testCaseId = tcByTcId.get(lower);

      if (linkId) {
        await prisma.automationLink.update({
          where: { id: linkId },
          data: {
            ...(status ? { status } : {}),
            lastResult: e.status,
            lastRunAt: now,
            ...(e.scriptPath ? { scriptPath: e.scriptPath } : {}),
            // Riwayat: satu baris per run.
            runs: { create: { status: e.status, ranAt: now } },
          },
        });
        updated += 1;
      } else if (testCaseId) {
        await prisma.automationLink.upsert({
          where: { testCaseId },
          create: {
            testCaseId,
            externalTestId: e.externalTestId.slice(0, 120),
            status: status ?? "NOT_AUTOMATED",
            scriptPath: e.scriptPath || null,
            lastResult: e.status,
            lastRunAt: now,
            runs: { create: { status: e.status, ranAt: now } },
          },
          update: {
            ...(status ? { status } : {}),
            lastResult: e.status,
            lastRunAt: now,
            ...(e.scriptPath ? { scriptPath: e.scriptPath } : {}),
            runs: { create: { status: e.status, ranAt: now } },
          },
        });
        created += 1;
      } else {
        unmatched.push(e.externalTestId);
      }
    }

    revalidatePath("/automation");
    return { success: true, updated, created, unmatched };
  } catch (error) {
    return handleError(error) as ApplyAutomationReportResult;
  }
}
