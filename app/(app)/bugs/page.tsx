"use client";

import { BugsPageClient } from "@/components/bugs/bugs-table";
import { ErrorBlock, LoadingBlock } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { BugsPayload } from "@/types/api";

export default function BugsPage() {
  const { data, error, loading, reload } = useApi<BugsPayload>("/api/bugs");

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {error ? (
        <ErrorBlock message={error.message} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingBlock label="Memuat daftar bug…" />
      ) : (
        <BugsPageClient bugs={data.bugs} reload={reload} />
      )}
    </main>
  );
}
