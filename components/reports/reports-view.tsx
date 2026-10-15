import { InventorySummary } from "@/components/reports/inventory-summary";
import { CompositionCard } from "@/components/reports/composition-card";
import { CoverageGapTable } from "@/components/reports/coverage-gap-table";
import { RepositoryHygiene } from "@/components/reports/repository-hygiene";
import { PRIORITY_COLORS, STATUS_COLORS, fmt } from "@/components/reports/report-tokens";
import type { ReportsPayload } from "@/types/api";

/** Angka yang sudah difilter (dihitung halaman induk) untuk tab ini. */
export type ReportsTabData = {
  suites: ReportsPayload["coverageGap"];
  suitesWithoutTc: ReportsPayload["suitesWithoutTc"];
  inventory: ReportsPayload["inventory"];
};

/**
 * Isi tab "Coverage & Repository" — presentasional saja: data & filter
 * disediakan halaman induk (ReportsAnalyticsView). Ditulis sebagai fragment
 * supaya tiap blok menjadi item dari flex column halaman (gap 18px).
 */
export function ReportsView({
  data,
  suites,
  suitesWithoutTc,
  inventory,
}: { data: ReportsPayload } & ReportsTabData) {
  return (
    <>
      {/* KPI row */}
      <InventorySummary inventory={inventory} />

      {/* Composition row (priority & status) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
        <CompositionCard
          title="Priority Composition"
          caption={`${fmt(inventory.totalTC)} test case`}
          items={data.priorityComposition}
          colors={PRIORITY_COLORS}
        />
        <CompositionCard
          title="Status Composition"
          caption={`${fmt(inventory.totalTC)} test case`}
          items={data.statusComposition}
          colors={STATUS_COLORS}
        />
      </div>

      {/* Celah coverage — lebar penuh */}
      <CoverageGapTable suites={suites} noExecutionYet={data.noExecutionYet} />

      {/* Bottom row: Suite Tanpa Test Case & Cakupan Otomasi */}
      <RepositoryHygiene suitesWithoutTc={suitesWithoutTc} automation={data.automation} />
    </>
  );
}
