import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ROLE_RANK, type Role } from "@/lib/permissions";

export type ApiUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

/** Baca sesi tanpa throw redirect; null = belum login (caller kirim 401). */
export async function apiSession(): Promise<ApiUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const su = session.user as typeof session.user & { id?: string; role?: Role };
  if (!su.id) return null;
  return {
    id: su.id,
    name: su.name ?? null,
    email: su.email ?? null,
    image: su.image ?? null,
    role: (su.role ?? "DEVELOPER") as Role,
  };
}

/** Helper respons error terpusat untuk route handler. */
export const json401 = (message = "Anda harus login.") =>
  NextResponse.json({ error: message }, { status: 401 });
export const json403 = (message = "Anda tidak memiliki akses ke data ini.") =>
  NextResponse.json({ error: message }, { status: 403 });
export const json404 = (message = "Data tidak ditemukan.") =>
  NextResponse.json({ error: message }, { status: 404 });
export const json400 = (message = "Permintaan tidak valid.") =>
  NextResponse.json({ error: message }, { status: 400 });
export const json500 = (message = "Terjadi kesalahan server.") =>
  NextResponse.json({ error: message }, { status: 500 });

/** Cek role user terhadap role minimal (sama dengan roleAtLeast). */
export function apiRoleAtLeast(role: Role | undefined | null, min: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
