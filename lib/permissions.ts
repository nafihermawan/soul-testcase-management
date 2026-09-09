import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export type Role = "QA" | "DEVELOPER" | "PRODUCT";

/** Urutan hierarki role: semakin tinggi semakin banyak akses. */
export const ROLE_RANK: Record<Role, number> = {
  PRODUCT: 1,
  DEVELOPER: 2,
  QA: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  QA: "QA",
  DEVELOPER: "Developer",
  PRODUCT: "Product",
};

export function roleAtLeast(role: Role | undefined | null, min: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Ambil sesi + role user; redirect ke /login kalau belum login. */
export async function getSessionRole(): Promise<{ id: string; role: Role }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    role: (session.user.role ?? "DEVELOPER") as Role,
  };
}

/** Versi non-throwing: untuk conditional UI (tanpa redirect ke /settings). */
export async function getCurrentRole(): Promise<Role> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user?.role ?? "DEVELOPER") as Role;
  } catch {
    return "DEVELOPER";
  }
}

/**
 * Wajibkan role minimal. Dipakai di server actions & server components.
 * - minRole "QA"  -> hanya QA (full access)
 * - minRole "DEVELOPER" -> QA + Developer
 * - minRole "PRODUCT"  -> semua (view-only tetap lewat)
 */
export async function requireRole(minRole: Role): Promise<{ id: string; role: Role }> {
  const ctx = await getSessionRole();
  if (!roleAtLeast(ctx.role, minRole)) {
    redirect("/settings");
  }
  return ctx;
}
