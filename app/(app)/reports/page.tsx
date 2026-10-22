"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReportsAnalyticsView } from "@/components/reports/reports-analytics-view";
import { TableCardSkeleton } from "@/components/ui/data-states";
import { useMe } from "@/lib/client/me-context";

/**
 * Reports & Analytics — HANYA Lead QA (role QA + flag isQaLead).
 *
 * Akses langsung ke URL ini oleh role lain (mis. Developer) dialihkan otomatis
 * ke dashboard, tanpa banner "Access Denied". Server tetap menegakkan aturan
 * yang sama lewat 403 di /api/reports, jadi ini lapisan UX, bukan satu-satunya
 * pagar. (Middleware NextAuth tetap menjaga autentikasi rute ini.)
 */
export default function ReportsPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const blocked = !!me && !me.isQaLead;

  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  if (loading || !me || blocked) return <TableCardSkeleton />;

  return <ReportsAnalyticsView />;
}
