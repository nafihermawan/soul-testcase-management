"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AutomationPageClient } from "@/components/automation/automation-page-client";
import { TableCardSkeleton } from "@/components/ui/data-states";
import { useMe } from "@/lib/client/me-context";

export default function AutomationPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const role = me?.role;
  const blocked = !!me && role === "PRODUCT";

  // Role PRODUCT tidak berhak melihat halaman automation.
  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {meLoading || !me || blocked ? (
        <TableCardSkeleton />
      ) : (
        // Data + filter dikelola di dalam client (fetch per-suite saat expand),
        // jadi server tetap menegakkan hak akses lewat 403 di route handler.
        <AutomationPageClient
          canManage={role === "QA"}
          canUpdateStatus={role === "QA" || role === "DEVELOPER"}
        />
      )}
    </main>
  );
}
