"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type HierarchyActionState = {
  error?: string;
  success?: boolean;
};

function handleError(error: unknown): HierarchyActionState {
  console.error(error);
  if (error instanceof Error && error.message.includes("Unique constraint")) {
    return { error: "Kode sudah dipakai untuk level ini, gunakan kode lain." };
  }
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/* ------------------------- Project (top-level) ------------------------- */

const PLATFORM_VALUES = ["MOBILE", "WEB", "HARDWARE", "API"] as const;
type PlatformValue = (typeof PLATFORM_VALUES)[number];

function toPlatform(raw: string): PlatformValue | null {
  const v = raw.trim().toUpperCase();
  return (PLATFORM_VALUES as readonly string[]).includes(v)
    ? (v as PlatformValue)
    : null;
}

export async function createProject(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    await prisma.project.create({
      data: {
        name,
        code,
        description: description || null,
        platform: toPlatform(String(formData.get("platform") ?? "")),
        docUrl: docUrl || null,
      },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateProject(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!id || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    await prisma.project.update({
      where: { id },
      data: {
        name,
        code,
        description: description || null,
        platform: toPlatform(String(formData.get("platform") ?? "")),
        docUrl: docUrl || null,
      },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteProject(formData: FormData): Promise<void> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.project.delete({ where: { id } });
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await requireRole("QA");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.project.update({ where: { id }, data: { order: index } })
      )
    );
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

/* ------------------------- Suite (rekursif) ------------------------- */

export async function createSuite(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const projectId = String(formData.get("projectId") ?? "");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!projectId || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    const count = await prisma.suite.count({
      where: parentId ? { parentId } : { parentId: null, projectId },
    });
    await prisma.suite.create({
      data: { projectId, parentId, name, code, docUrl: docUrl || null, order: count },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateSuite(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!id || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    await prisma.suite.update({ where: { id }, data: { name, code, docUrl: docUrl || null } });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteSuite(formData: FormData): Promise<void> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.suite.delete({ where: { id } });
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

export async function reorderSuites(parentId: string | null, orderedIds: string[]): Promise<void> {
  await requireRole("QA");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.suite.update({ where: { id }, data: { order: index } }))
    );
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

/** Pindahkan Suite ke parent lain (reparent), termasuk antar proyek. */
export async function moveSuite(
  suiteId: string,
  newParentId: string | null
): Promise<{ error?: string; success?: boolean }> {
  await requireRole("QA");
  if (!suiteId) return { error: "Suite tidak ditemukan." };
  if (newParentId === suiteId) return { error: "Suite tidak bisa dipindah ke dirinya sendiri." };

  try {
    const suite = await prisma.suite.findUnique({ where: { id: suiteId } });
    if (!suite) return { error: "Suite tidak ditemukan." };

    let projectId = suite.projectId;
    if (newParentId) {
      const parent = await prisma.suite.findUnique({ where: { id: newParentId } });
      if (!parent) return { error: "Parent suite tidak ditemukan." };
      projectId = parent.projectId;
    }

    const count = await prisma.suite.count({
      where: newParentId ? { parentId: newParentId } : { parentId: null, projectId },
    });
    await prisma.suite.update({
      where: { id: suiteId },
      data: { projectId, parentId: newParentId, order: count },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}
