"use client";

import { useRouter } from "next/navigation";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";

/**
 * Halaman detail satu bug, bisa dibuka langsung lewat URL.
 *
 * Dipakai link "Buka Bug ↗" di banner Complete Test Run (target `_blank`).
 * Isinya memakai ULANG `BugDetailModal` yang sudah ada — tidak ada tampilan
 * kedua untuk data yang sama. Menutup modal mengembalikan ke daftar Bugs.
 */
export default function BugDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <main
      style={{
        fontFamily: "var(--font-sans)",
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        background: "#F1F3F6",
      }}
    >
      <BugDetailModal bugId={params.id} onClose={() => router.push("/bugs")} />
    </main>
  );
}
