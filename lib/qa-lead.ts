import { prisma } from "@/lib/prisma";

/**
 * Lead QA = role QA **dan** flag `isQaLead` aktif.
 *
 * Sengaja dibaca langsung dari database (bukan dari JWT/session) supaya
 * perubahan flag di Settings langsung berlaku tanpa user harus login ulang.
 * Halaman & API "QA Performance Analytics" memakai ini sebagai satu-satunya
 * gerbang akses.
 */
export async function isQaLead(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isQaLead: true },
  });
  return !!user && user.role === "QA" && user.isQaLead;
}
