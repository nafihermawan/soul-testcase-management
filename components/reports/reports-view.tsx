"use client";

import { useEffect, useMemo, useState } from "react";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { Card } from "@/components/ui";
import { FilterModal } from "@/components/ui/filter-modal";
import { CustomSelect, filterLabelStyle } from "@/components/ui/custom-select";
import { useApi } from "@/lib/client/use-api";
import { TC_PRIORITY_COLOR, TC_STATUS_COLOR, pct } from "@/lib/qa-metrics";
import { InventorySummary } from "@/components/reports/inventory-summary";
import { WeeklyReportSection } from "@/components/reports/weekly-report-section";
import { CompositionCard } from "@/components/reports/composition-card";
import { CoverageGapTable } from "@/components/reports/coverage-gap-table";
import { RepositoryHygiene } from "@/components/reports/repository-hygiene";
import type { ReportsPayload } from "@/types/api";

const ALL = "ALL";

export function ReportsView() {
  const { data, error, loading, reload } = useApi<ReportsPayload>("/api/reports");
  const [platform, setPlatform] = useState<string>(ALL);
  const [project, setProject] = useState<string>(ALL);
  // Draft filter untuk popover: baru diterapkan saat tombol Terapkan diklik.
  const [draftPlatform, setDraftPlatform] = useState<string>(ALL);
  const [draftProject, setDraftProject] = useState<string>(ALL);
  useEffect(() => {
    setDraftPlatform(platform);
    setDraftProject(project);
  }, [platform, project]);

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
      {/* Header + filter — dibungkus kartu standar, sama seperti banner
          halaman Bugs Tracker & Run History. Batas kartunya jadi garis
          pemisah antara header dan daftar section di bawahnya. */}
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "1.25rem 1.5rem",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>Reports</h1>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Inventaris test case &amp; celah coverage repository.
            </p>
          </div>
        <FilterModal
          title="Filter Reports"
          activeCount={(platform !== ALL ? 1 : 0) + (project !== ALL ? 1 : 0)}
          onReset={() => {
            setDraftPlatform(ALL);
            setDraftProject(ALL);
          }}
          onApply={() => {
            setPlatform(draftPlatform);
            setProject(draftProject);
          }}
        >
          <div>
            <span style={filterLabelStyle}>Platform</span>
            <CustomSelect
              ariaLabel="Filter platform"
              value={draftPlatform}
              onChange={(v) => {
                setDraftPlatform(v);
                // Cascading: project yang tidak cocok dengan Platform baru dibuang.
                const stillValid = data.projects.some(
                  (p) =>
                    p.id === draftProject &&
                    (v === ALL || (p.platform ?? "").toUpperCase() === v)
                );
                if (!stillValid) setDraftProject(ALL);
              }}
              options={[
                { value: ALL, label: "Semua Platform" },
                { value: "WEB", label: "Web" },
                { value: "MOBILE", label: "Mobile" },
                { value: "HARDWARE", label: "Hardware" },
                { value: "API", label: "API" },
              ]}
            />
          </div>
          <div>
            <span style={filterLabelStyle}>Project</span>
            <CustomSelect
              ariaLabel="Filter project"
              value={draftProject}
              onChange={setDraftProject}
              options={[
                { value: ALL, label: "Semua Project" },
                ...data.projects
                  .filter(
                    (p) =>
                      draftPlatform === ALL ||
                      (p.platform ?? "").toUpperCase() === draftPlatform
                  )
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        </FilterModal>
        </div>
      </Card>

      {/* Laporan mingguan (dikirim tiap Jumat) */}
      <WeeklyReportSection />

      {/* Ringkasan inventaris (mengikuti filter) */}
      <InventorySummary inventory={view.inventory} />

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
