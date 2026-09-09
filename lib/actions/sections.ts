"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type SectionActionState = {
  error?: string;
  success?: boolean;
};

function handleError(error: unknown): SectionActionState {
  console.error(error);
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/** Buat section baru di dalam suite. */
export async function createSection(
  suiteId: string,
  data: { name: string; description?: string }
): Promise<SectionActionState> {
  await requireRole("QA");
  const name = data.name.trim();
  if (!name) return { error: "Nama section wajib diisi." };

  try {
    const count = await prisma.section.count({ where: { suiteId } });
    await prisma.section.create({
      data: {
        suiteId,
        name,
        description: data.description?.trim() || null,
        order: count,
      },
    });
    revalidatePath(`/suites/${suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Rename section. */
export async function renameSection(
  sectionId: string,
  name: string
): Promise<SectionActionState> {
  await requireRole("QA");
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nama section wajib diisi." };

  try {
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) return { error: "Section tidak ditemukan." };

    await prisma.section.update({ where: { id: sectionId }, data: { name: trimmed } });
    revalidatePath(`/suites/${section.suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Hapus section. Test case di dalamnya TIDAK ikut terhapus —
 *  sectionId di-set null (kembali ke "Tanpa Section"). */
export async function deleteSection(sectionId: string): Promise<SectionActionState> {
  await requireRole("QA");
  try {
    const section = await prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) return { error: "Section tidak ditemukan." };

    await prisma.$transaction([
      // Lepas semua TC dari section ini (jangan hapus TC-nya)
      prisma.testCase.updateMany({
        where: { sectionId },
        data: { sectionId: null },
      }),
      prisma.section.delete({ where: { id: sectionId } }),
    ]);
    revalidatePath(`/suites/${section.suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Assign/pindahkan test case ke section (null = Tanpa Section). */
export async function assignTestCaseToSection(
  testCaseId: string,
  sectionId: string | null
): Promise<SectionActionState> {
  await requireRole("QA");
  try {
    const tc = await prisma.testCase.findUnique({ where: { id: testCaseId } });
    if (!tc) return { error: "Test case tidak ditemukan." };

    await prisma.testCase.update({
      where: { id: testCaseId },
      data: { sectionId },
    });
    if (tc.suiteId) revalidatePath(`/suites/${tc.suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Pindahkan banyak test case sekaligus ke satu section (bulk move). */
export async function assignTestCasesToSection(
  testCaseIds: string[],
  sectionId: string | null
): Promise<SectionActionState> {
  await requireRole("QA");
  if (testCaseIds.length === 0) return { error: "Tidak ada test case yang dipilih." };

  try {
    // Kumpulkan suiteId dari TC pertama yang ditemukan (semua TC diasumsikan satu suite).
    const tcs = await prisma.testCase.findMany({
      where: { id: { in: testCaseIds } },
      select: { id: true, suiteId: true },
    });
    if (tcs.length === 0) return { error: "Test case tidak ditemukan." };

    await prisma.testCase.updateMany({
      where: { id: { in: tcs.map((t) => t.id) } },
      data: { sectionId },
    });

    const suiteId = tcs[0].suiteId;
    if (suiteId) revalidatePath(`/suites/${suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
