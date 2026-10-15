"use client";

import { BugsPageClient } from "@/components/bugs/bugs-table";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { BugsPayload } from "@/types/api";

export default function BugsPage() {
  const { data, error, loading, reload } = useApi<BugsPayload>("/api/bugs");

  return (
    <main
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        // Full-bleed ke area konten AppShell (batalkan padding 1rem), lalu beri
        // padding halaman 24px di semua sisi. Lebar sengaja di-`auto` (tanpa
        // width/max-width/margin auto) supaya margin negatif melebarkan elemen
        // penuh ke tepi kiri & kanan — jadi gap kiri/kanan sama-sama 24px.
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        display: "flex",
        flexDirection: "column",
        background: "#F1F3F6",
      }}
    >
      {error ? (
        <ErrorBlock message={error.message} onRetry={reload} />
      ) : loading || !data ? (
        <TableCardSkeleton />
      ) : (
        <BugsPageClient bugs={data.bugs} canAttach={data.canAttach} />
      )}
    </main>
  );
}
