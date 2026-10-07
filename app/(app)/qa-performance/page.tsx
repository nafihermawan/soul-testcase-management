"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { QaPerformanceView } from "@/components/analytics/qa-performance-view";
import { TableCardSkeleton } from "@/components/ui/data-states";
import { useMe } from "@/lib/client/me-context";

export default function QaPerformancePage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const blocked = !!me && !me.isQaLead;

  // Hanya Lead QA (role QA + flag isQaLead). Non-lead diarahkan ke beranda —
  // API-nya sendiri tetap menolak 403 walau URL dibuka manual.
  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  if (loading || !me || blocked) return <TableCardSkeleton />;

  return <QaPerformanceView />;
}
