"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type UserActionState = {
  error?: string;
  success?: boolean;
};

/** Ubah role user (hanya QA yang boleh). */
export async function updateUserRole(
  userId: string,
  role: "QA" | "DEVELOPER" | "PRODUCT"
): Promise<UserActionState> {
  await requireRole("QA");
  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}

/** Hapus akses user (hanya QA). Tidak boleh menghapus diri sendiri. */
export async function removeUser(userId: string): Promise<UserActionState> {
  const ctx = await requireRole("QA");
  if (ctx.id === userId) {
    return { error: "Tidak bisa menghapus akun sendiri." };
  }
  try {
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}

/** Pre-authorize email (Tambah User): buat User record sehingga pemilik
 *  email bisa login via Google OAuth. Hanya QA. */
export async function addUserByEmail(
  data: { name?: string; email: string; role: "QA" | "DEVELOPER" | "PRODUCT" }
): Promise<UserActionState> {
  await requireRole("QA");
  const normalized = data.email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { error: "Email tidak valid." };
  }
  try {
    await prisma.user.upsert({
      where: { email: normalized },
      create: {
        email: normalized,
        name: data.name?.trim() || null,
        role: data.role,
      },
      update: {
        name: data.name?.trim() || null,
        role: data.role,
      },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}

/** Update data user (nama, email, role). Hanya QA. */
export async function updateUser(
  userId: string,
  data: { name?: string; email: string; role: "QA" | "DEVELOPER" | "PRODUCT" }
): Promise<UserActionState> {
  await requireRole("QA");
  const normalized = data.email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { error: "Email tidak valid." };
  }
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name?.trim() || null,
        email: normalized,
        role: data.role,
      },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}
