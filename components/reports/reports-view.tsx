"use client";

import { useMemo, useState } from "react";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { FilterSelect } from "@/components/ui/filter-select";
import { useApi } from "@/lib/client/use-api";
import { TC_PRIORITY_COLOR, TC_STATUS_COLOR, pct } from "@/lib/qa-metrics";
import { InventorySummary } from "@/components/reports/inventory-summary";
import { CompositionCard } from "@/components/reports/composition-card";
import { CoverageGapTable } from "@/components/reports/coverage-gap-table";
import { RepositoryHygiene } from "@/components/reports/repository-hygiene";
import type { ReportsPayload } from "@/types/api";

const ALL = "ALL";

export function ReportsView() {
  const { data, error, loading, reload } = useApi<ReportsPayload>("/api/reports");
  const [platform, setPlatform] = useState<string>(ALL);
  const [project, setProject] = useState<string>(ALL);

  const isFiltered = platform !== ALL || project !== ALL;

  // Semua section yang punya keterkaitan project/suite dihitung ulang di client
  // dari daftar suite, supaya filter Platform/Project konsisten di seluruh halaman.
  const view = useMemo(() => {
    if (!data) return null;
    const byPlatform = (p: string | null) =>
      platform === ALL || (p ?? "").toUpperCase() === platform;

    const suites = data.coverageGap.filter(
      (s) => byPlatform(s.platform) && (project === ALL || s.projectId === project)
    );
    const platformOfProject = (projectId: string) =>
      data.projects.find((p) => p.id === projectId)?.platform ?? null;
    const suitesWithoutTc = data.suitesWithoutTc.filter(
      (s) => (project === ALL || s.projectId === project) && byPlatform(platformOfProject(s.projectId))
    );

    const inSuite = suites.reduce((sum, s) => sum + s.total, 0);
    const untested = suites.reduce((sum, s) => sum + s.untested, 0);
    // TC tanpa suite tidak melekat pada project mana pun -> hanya muncul saat
    // tidak ada filter aktif, agar angka tidak mengklaim milik satu project.
    const orphanCount = isFiltered ? 0 : data.orphanTc.length;
    const totalTC = inSuite + orphanCount;
    const projectIds = new Set(suites.map((s) => s.projectId));

    return {
      suites,
      suitesWithoutTc,
      inventory: {
        totalTC,
        inSuite,
        // Suite kosong tetap dihitung, kalau tidak jumlahnya menyesatkan
        // (16 vs 20 suite yang benar-benar ada).
        suites: suites.length + suitesWithoutTc.length,
        projects: isFiltered ? projectIds.size : data.inventory.projects,
        untested,
        untestedPct: pct(untested, inSuite),
      },
    };
  }, [data, platform, project, isFiltered]);

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data || !view) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <div className="skeleton-block" style={{ width: 160, height: 22 }} />
          <div className="skeleton-block" style={{ width: 320, height: 12, marginTop: "0.5rem" }} />
        </div>
        <StatsCardsSkeleton count={3} />
        <div style={{ height: "1.25rem" }} />
        <TableCardSkeleton />
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* Header + filter */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>Reports</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Inventaris test case &amp; celah coverage repository.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <FilterSelect
            label="Platform"
            ariaLabel="Filter platform"
            value={platform}
            onChange={setPlatform}
            options={[
              { value: ALL, label: "Semua Platform" },
              { value: "WEB", label: "Web" },
              { value: "MOBILE", label: "Mobile" },
              { value: "HARDWARE", label: "Hardware" },
              { value: "API", label: "API" },
            ]}
          />
          <FilterSelect
            label="Project"
            ariaLabel="Filter project"
            value={project}
            onChange={setProject}
            options={[
              { value: ALL, label: "Semua Project" },
              ...data.projects
                .filter((p) => platform === ALL || (p.platform ?? "").toUpperCase() === platform)
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      </div>

      {/* Ringkasan inventaris (mengikuti filter) */}
      <InventorySummary inventory={view.inventory} />

      {/* Komposisi priority & status — repository-wide, ditandai eksplisit */}
      <div className="dash-split dash-split-7-5">
        <CompositionCard
          title="Komposisi Priority"
          hint={isFiltered ? "Seluruh repository" : undefined}
          items={data.priorityComposition}
          colors={TC_PRIORITY_COLOR}
        />
        <CompositionCard
          title="Komposisi Status"
          hint={isFiltered ? "Seluruh repository" : undefined}
          items={data.statusComposition}
          colors={TC_STATUS_COLOR}
        />
      </div>

      {/* Celah coverage */}
      <CoverageGapTable suites={view.suites} noExecutionYet={data.noExecutionYet} />

      {/* Higienitas repository */}
      <RepositoryHygiene
        suitesWithoutTc={view.suitesWithoutTc}
        orphanTc={isFiltered ? [] : data.orphanTc}
        automation={data.automation}
      />
    </main>
  );
}
