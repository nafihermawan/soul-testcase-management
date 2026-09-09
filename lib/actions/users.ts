"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type UserActionState = {
  error?: string;
  success?: boolean;
};

type ManageableRole = "QA" | "DEVELOPER" | "PRODUCT";

/** Hash password user (bcrypt, cost 10). */
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function passwordError(password?: string): string | null {
  if (!password || !password.trim()) return null;
  if (password.length < 6) return "Password minimal 6 karakter.";
  return null;
}

/** Ubah role user (hanya QA yang boleh). */
export async function updateUserRole(
  userId: string,
  role: ManageableRole
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

/** Tambah user baru dengan email + password (login credentials). Hanya QA. */
export async function addUserByEmail(data: {
  name?: string;
  email: string;
  role: ManageableRole;
  password?: string;
}): Promise<UserActionState> {
  await requireRole("QA");
  const normalized = data.email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { error: "Email tidak valid." };
  }
  const pwdErr = passwordError(data.password);
  if (pwdErr) return { error: pwdErr };
  const passwordHash = data.password ? hashPassword(data.password) : null;

  try {
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return { error: "User dengan email tersebut sudah ada." };
    }
    await prisma.user.create({
      data: {
        email: normalized,
        name: data.name?.trim() || null,
        role: data.role,
        passwordHash,
      },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}

/** Update data user (nama, email, role) & opsional reset password. Hanya QA. */
export async function updateUser(
  userId: string,
  data: {
    name?: string;
    email: string;
    role: ManageableRole;
    password?: string;
  }
): Promise<UserActionState> {
  await requireRole("QA");
  const normalized = data.email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    return { error: "Email tidak valid." };
  }
  const pwdErr = passwordError(data.password);
  if (pwdErr) return { error: pwdErr };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name?.trim() || null,
        email: normalized,
        role: data.role,
        ...(data.password ? { passwordHash: hashPassword(data.password) } : {}),
      },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}
