"use client";

import { TC_PRIORITY_COLOR, TC_STATUS_COLOR } from "@/lib/qa-metrics";
import { InventorySummary } from "@/components/reports/inventory-summary";
import { CompositionCard } from "@/components/reports/composition-card";
import { CoverageGapTable } from "@/components/reports/coverage-gap-table";
import { RepositoryHygiene } from "@/components/reports/repository-hygiene";
import type { ReportsPayload } from "@/types/api";

/** Angka yang sudah difilter (dihitung halaman induk) untuk tab ini. */
export type ReportsTabData = {
  suites: ReportsPayload["coverageGap"];
  suitesWithoutTc: ReportsPayload["suitesWithoutTc"];
  inventory: ReportsPayload["inventory"];
  isFiltered: boolean;
};

/**
 * Isi tab "Coverage & Repository" — presentasional saja: data & filter
 * disediakan halaman induk (ReportsAnalyticsView).
 */
export function ReportsView({
  data,
  suites,
  suitesWithoutTc,
  inventory,
  isFiltered,
}: { data: ReportsPayload } & ReportsTabData) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%" }}>
      {/* Ringkasan inventaris (mengikuti filter) */}
      <InventorySummary inventory={inventory} />

      {/* Komposisi priority & status — repository-wide, ditandai eksplisit */}
      <div className="dash-split dash-split-7-5">
        <CompositionCard
          title="Priority Composition"
          hint={isFiltered ? "Seluruh repository" : undefined}
          items={data.priorityComposition}
          colors={TC_PRIORITY_COLOR}
        />
        <CompositionCard
          title="Status Composition"
          hint={isFiltered ? "Seluruh repository" : undefined}
          items={data.statusComposition}
          colors={TC_STATUS_COLOR}
        />
      </div>

      {/* Celah coverage — lebar penuh (full width). */}
      <CoverageGapTable suites={suites} noExecutionYet={data.noExecutionYet} />

      {/* Higienitas repository */}
      <RepositoryHygiene suitesWithoutTc={suitesWithoutTc} automation={data.automation} />
    </div>
  );
}
