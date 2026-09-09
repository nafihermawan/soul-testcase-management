"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

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
