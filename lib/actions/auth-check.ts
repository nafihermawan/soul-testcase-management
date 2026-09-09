"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type CheckLoginResult =
  | { status: "ok" }
  | { status: "no_user" }
  | { status: "no_password" }
  | { status: "wrong_password" }
  | { status: "invalid" }
  | { status: "error"; detail?: string };

/** Pre-check sebelum NextAuth: bedakan penyebab login gagal untuk UX. */
export async function checkLoginCredentials(
  email: string,
  password: string
): Promise<CheckLoginResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || !password) {
    return { status: "invalid" };
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, passwordHash: true },
    });
    if (!user) return { status: "no_user" };
    if (!user.passwordHash) return { status: "no_password" };

    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? { status: "ok" } : { status: "wrong_password" };
  } catch (error) {
    console.error("checkLoginCredentials error:", error);
    // detail sementara untuk debugging prod — hapus setelah akar masalah ditemukan
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}
