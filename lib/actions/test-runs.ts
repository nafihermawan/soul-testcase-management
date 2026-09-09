"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type TestRunActionState = {
  error?: string;
  success?: boolean;
};

type ResultStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

function handleError(error: unknown): TestRunActionState {
  console.error(error);
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/** Kumpulkan semua TestCase di dalam suite (termasuk semua sub-suite rekursif). */
async function collectTestCasesInSuite(suiteId: string): Promise<string[]> {
  const ids: string[] = [];
  const stack = [suiteId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const suite = await prisma.suite.findUnique({
      where: { id: current },
      include: { children: { select: { id: true } } },
    });
    if (!suite) continue;
    stack.push(...suite.children.map((c) => c.id));
  }
  const tcs = await prisma.testCase.findMany({
    where: { suiteId: { in: ids } },
    select: { id: true },
  });
  return tcs.map((t) => t.id);
}

/** Buat Test Run baru (Express Run) dari daftar suite/TC terpilih.
 *  projectIds: daftar project yang dipilih; projectId pertama dipakai sebagai primary run. */
export async function createTestRun(
  projectIds: string[],
  name: string,
  suiteIds: string[],
  testCaseIds: string[],
  opts?: {
    sprint?: string;
    taskLink?: string;
    activityType?: string;
    environment?: string;
    platforms?: string[];
  }
): Promise<TestRunActionState & { runId?: string }> {
  const user = await requireRole("QA");
  const runName = name.trim() || `Test Run ${new Date().toLocaleString("id-ID")}`;
  const projectId = projectIds[0] ?? "";

  try {
    const selected = new Set<string>(testCaseIds);
    for (const suiteId of suiteIds) {
      const collected = await collectTestCasesInSuite(suiteId);
      collected.forEach((id) => selected.add(id));
    }
    if (selected.size === 0) {
      return { error: "Tidak ada test case yang dipilih." };
    }
    if (!projectId) {
      return { error: "Project wajib dipilih." };
    }

    const testCases = await prisma.testCase.findMany({
      where: { id: { in: Array.from(selected) } },
      select: { id: true, title: true },
    });

    const run = await prisma.testRun.create({
      data: {
        name: runName,
        projectId,
        status: "IN_PROGRESS",
        activityType: opts?.activityType?.trim() || null,
        platforms:
          opts?.platforms && opts.platforms.length > 0
            ? opts.platforms.join(", ")
            : null,
        environment: opts?.environment?.trim() || null,
        sprint: opts?.sprint?.trim() || null,
        taskLink: opts?.taskLink?.trim() || null,
        createdById: user.id,
        results: {
          create: testCases.map((tc) => ({
            testCaseId: tc.id,
            titleSnapshot: tc.title,
            status: "NOT_RUN",
          })),
        },
      },
    });

    revalidatePath("/test-runs");
    revalidatePath(`/test-runs/${run.id}`);
    return { success: true, runId: run.id };
  } catch (error) {
    return handleError(error);
  }
}

/** Update status/actual result satu TestRunResult. */
export async function updateRunResult(
  resultId: string,
  data: {
    status: ResultStatus;
    actualResult?: string;
    notes?: string;
  }
): Promise<TestRunActionState> {
  const user = await requireRole("QA");
  try {
    const result = await prisma.testRunResult.findUnique({
      where: { id: resultId },
      include: { run: { select: { id: true } } },
    });
    if (!result) return { error: "Hasil run tidak ditemukan." };

    await prisma.testRunResult.update({
      where: { id: resultId },
      data: {
        status: data.status,
        actualResult: data.actualResult?.trim() || null,
        notes: data.notes?.trim() || null,
        updatedById: user.id,
      },
    });
    revalidatePath(`/test-runs/${result.run.id}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Tandai run selesai. */
export async function completeRun(runId: string): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    revalidatePath(`/test-runs/${runId}`);
    revalidatePath("/test-runs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Selesaikan run dan tandai otomatis semua TC yang belum dieksekusi sebagai SKIPPED. */
export async function completeRunWithSkip(runId: string): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    await prisma.$transaction([
      prisma.testRunResult.updateMany({
        where: { runId, status: "NOT_RUN" },
        data: { status: "SKIPPED" },
      }),
      prisma.testRun.update({
        where: { id: runId },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
    ]);
    revalidatePath(`/test-runs/${runId}`);
    revalidatePath("/test-runs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Simpan hasil eksekusi untuk satu TestCase dari modal detail.
 * Update TestRunResult di run IN_PROGRESS terbaru yang berisi TC ini;
 * kalau belum ada, buat TestRunResult baru di run IN_PROGRESS terbaru.
 */
export async function saveExecutionForTestCase(
  testCaseId: string,
  data: {
    status: ResultStatus;
    actualResult?: string;
    notes?: string;
  }
): Promise<TestRunActionState> {
  const user = await requireRole("QA");
  try {
    const tc = await prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { suite: { select: { projectId: true } } },
    });
    if (!tc) return { error: "Test case tidak ditemukan." };

    // Run aktif terbaru yang berisi TC ini
    const existing = await prisma.testRunResult.findFirst({
      where: {
        testCaseId,
        run: { status: "IN_PROGRESS" },
      },
      orderBy: { updatedAt: "desc" },
      include: { run: { select: { id: true } } },
    });

    if (existing) {
      await prisma.testRunResult.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          actualResult: data.actualResult?.trim() || null,
          notes: data.notes?.trim() || null,
          updatedById: user.id,
        },
      });
      revalidatePath(`/test-runs/${existing.run.id}`);
    } else {
      // Buat run baru (Express Run satu TC) kalau belum ada run aktif
      const activeRun = await prisma.testRun.findFirst({
        where: { status: "IN_PROGRESS", projectId: tc.suite?.projectId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (activeRun) {
        await prisma.testRunResult.create({
          data: {
            runId: activeRun.id,
            testCaseId,
            titleSnapshot: tc.title,
            status: data.status,
            actualResult: data.actualResult?.trim() || null,
            notes: data.notes?.trim() || null,
            updatedById: user.id,
          },
        });
        revalidatePath(`/test-runs/${activeRun.id}`);
      } else {
        return { error: "Tidak ada run berjalan untuk project ini." };
      }
    }

    revalidatePath(`/test-cases/${testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Hapus run (untuk run yang belum dieksekusi / salah buat). */
export async function deleteRun(runId: string): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    await prisma.testRun.delete({ where: { id: runId } });
    revalidatePath("/test-runs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
