import { KpiCard } from "@/components/ui/kpi-card";
import { formatPct } from "@/lib/qa-metrics";
import type { ReportsPayload } from "@/types/api";

/** Ringkasan inventaris test case. Semua angka dari tabel TestCase,
 *  bukan dari baris hasil run. */
export function InventorySummary({ inventory }: { inventory: ReportsPayload["inventory"] }) {
  const orphanCount = Math.max(inventory.totalTC - inventory.inSuite, 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "1rem",
        alignItems: "stretch",
      }}
    >
      <KpiCard
        label="Total Test Cases"
        value={inventory.totalTC.toLocaleString("id-ID")}
        sub={
          orphanCount > 0
            ? `${inventory.inSuite.toLocaleString("id-ID")} di suite · ${orphanCount} tanpa suite`
            : "Semua terhubung ke suite"
        }
        tone="brand"
      />
      <KpiCard
        label="Suite"
        value={inventory.suites.toLocaleString("id-ID")}
        sub={`${inventory.projects.toLocaleString("id-ID")} project`}
      />
      <KpiCard
        label="Belum Pernah Di-test"
        value={inventory.untested.toLocaleString("id-ID")}
        sub={
          inventory.untestedPct === null
            ? "Belum ada test case"
            : `${formatPct(inventory.untestedPct)} dari TC di suite`
        }
        tone={inventory.untested > 0 ? "warning" : "success"}
      />
    </div>
  );
}
