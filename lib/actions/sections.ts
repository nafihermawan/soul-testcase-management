"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type SectionActionState = {
  error?: string;
  success?: boolean;
  /** Section yang baru dibuat — dipakai klien untuk update in-place tanpa reload. */
  section?: { id: string; name: string; description: string | null };
  /** Jumlah test case yang benar-benar dipindahkan. */
  moved?: number;
  /** Nama section tujuan (null = Tanpa Section) — dipakai teks toast. */
  targetSectionName?: string | null;
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
    const created = await prisma.section.create({
      data: {
        suiteId,
        name,
        description: data.description?.trim() || null,
        order: count,
      },
      select: { id: true, name: true, description: true },
    });
    revalidatePath(`/suites/${suiteId}`);
    return { success: true, section: created };
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

/**
 * Pindahkan test case ke Suite (+ Section) tujuan.
 *
 * `suiteId` dan `sectionId` SELALU ditulis bersamaan: `suiteId` pada TestCase
 * berdiri sendiri (tidak diturunkan dari section-nya), jadi menulis `sectionId`
 * saja membuat test case pindah section tapi tetap tercatat di suite lama —
 * dan kalau section-nya milik suite lain, TC-nya hilang dari kedua daftar.
 */
export async function moveTestCasesToTarget(
  testCaseIds: string[],
  targetSuiteId: string,
  targetSectionId: string | null
): Promise<SectionActionState> {
  await requireRole("QA");
  if (testCaseIds.length === 0) return { error: "Tidak ada test case yang dipilih." };

  try {
    const suite = await prisma.suite.findUnique({
      where: { id: targetSuiteId },
      select: { id: true },
    });
    if (!suite) return { error: "Suite tujuan tidak ditemukan." };

    // Section tujuan WAJIB milik suite tujuan (guard integritas).
    let targetSectionName: string | null = null;
    if (targetSectionId) {
      const section = await prisma.section.findUnique({
        where: { id: targetSectionId },
        select: { name: true, suiteId: true },
      });
      if (!section) return { error: "Section tujuan tidak ditemukan." };
      if (section.suiteId !== targetSuiteId) {
        return { error: "Section tujuan bukan milik suite yang dipilih." };
      }
      targetSectionName = section.name;
    }

    const rows = await prisma.testCase.findMany({
      where: { id: { in: testCaseIds } },
      select: { id: true, suiteId: true },
    });
    if (rows.length === 0) return { error: "Test case tidak ditemukan." };

    // Suite asal (distinct) — keduanya perlu di-revalidate.
    const sourceSuiteIds = Array.from(
      new Set(rows.map((r) => r.suiteId).filter((x): x is string => !!x))
    );

    await prisma.testCase.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { suiteId: targetSuiteId, sectionId: targetSectionId },
    });

    for (const suiteId of Array.from(new Set([...sourceSuiteIds, targetSuiteId]))) {
      revalidatePath(`/suites/${suiteId}`);
    }
    return { success: true, moved: rows.length, targetSectionName };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Pindahkan SECTION (beserta seluruh test case di dalamnya) ke suite lain.
 *
 * Section tidak bisa bersarang — skema `Section` hanya punya `suiteId` + `order`
 * (tanpa `parentId`) — jadi tujuan satu-satunya adalah sebuah Suite.
 */
export async function moveSectionToSuite(
  sectionId: string,
  targetSuiteId: string
): Promise<SectionActionState> {
  await requireRole("QA");
  try {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { suiteId: true },
    });
    if (!section) return { error: "Section tidak ditemukan." };
    if (section.suiteId === targetSuiteId) {
      return { error: "Section sudah berada di suite tersebut." };
    }

    const target = await prisma.suite.findUnique({
      where: { id: targetSuiteId },
      select: { id: true },
    });
    if (!target) return { error: "Suite tujuan tidak ditemukan." };

    const count = await prisma.section.count({ where: { suiteId: targetSuiteId } });

    await prisma.$transaction([
      prisma.section.update({
        where: { id: sectionId },
        data: { suiteId: targetSuiteId, order: count },
      }),
      // Test case menyimpan `suiteId`-nya sendiri, jadi harus ikut dipindah.
      prisma.testCase.updateMany({
        where: { sectionId },
        data: { suiteId: targetSuiteId },
      }),
    ]);

    revalidatePath(`/suites/${section.suiteId}`);
    revalidatePath(`/suites/${targetSuiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Simpan urutan section sesuai daftar id (index = `order`).
 * `suiteId` disertakan di WHERE supaya id milik suite lain tidak bisa ikut diubah.
 */
export async function reorderSections(
  suiteId: string,
  orderedIds: string[]
): Promise<SectionActionState> {
  await requireRole("QA");
  if (orderedIds.length === 0) return { success: true };

  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.section.updateMany({ where: { id, suiteId }, data: { order: index } })
      )
    );
    revalidatePath(`/suites/${suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
