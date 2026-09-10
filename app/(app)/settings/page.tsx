"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsView } from "@/components/settings/settings-view";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { Me, SettingsPayload } from "@/types/api";

export default function SettingsPage() {
  const router = useRouter();
  const me = useApi<Me>("/api/me");
  const role = me.data?.role;
  const blocked = !!me.data && role !== "QA";

  // Settings (kelola struktur project/suite + admin users) hanya untuk QA.
  // Non-QA diarahkan ke beranda (bukan redirect loop ke /settings).
  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  const { data, error, loading, reload } = useApi<SettingsPayload>("/api/settings", {
    enabled: !!me.data && role === "QA",
  });

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {!me.data || blocked ? (
        <TableCardSkeleton />
      ) : error ? (
        <ErrorBlock message={error.message} onRetry={reload} />
      ) : loading || !data ? (
        <>
          <div style={{ marginBottom: "1.25rem" }}>
            <div className="skeleton-block" style={{ width: 120, height: 22 }} />
            <div className="skeleton-block" style={{ width: 300, height: 12, marginTop: "0.5rem" }} />
          </div>
          <TableCardSkeleton />
        </>
      ) : (
        <>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem" }}>Settings</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            Kelola project aplikasi dan hak akses user di sini.
          </p>
          <SettingsView projects={data.projects} users={data.users} reload={reload} />
        </>
      )}
    </main>
  );
}
