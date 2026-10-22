"use client";

import { useEffect, useState } from "react";
import { FilterModal } from "@/components/ui/filter-modal";
import { FilterField, FilterFieldsPair, FilterSelect } from "@/components/ui/filter-fields";
import {
  ENVIRONMENT_OPTIONS,
  PERIOD_OPTIONS,
  PLATFORM_OPTIONS,
  type PeriodKey,
} from "@/lib/qa-metrics";

const ALL = "ALL";

const PLATFORM_LABELS: Record<string, string> = {
  ALL: "All Platforms",
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

export type DashboardFilterState = {
  platform: string;
  module: string;
  environment: string;
  period: PeriodKey;
};

const DEFAULT_FILTERS: DashboardFilterState = {
  platform: ALL,
  module: ALL,
  environment: ALL,
  period: "ALL",
};

/**
 * Filter global dashboard: satu tombol Filter + modal bersama berisi 4 field.
 *
 * Nilai dipilih ditahan sebagai `draft`; baru dikirim ke parent saat "Terapkan
 * Filter" diklik. Presentasi (shell + field) ikut komponen bersama; opsi &
 * logika tidak berubah.
 */
export function DashboardFilters({
  value,
  modules,
  onChange,
}: {
  value: DashboardFilterState;
  modules: { id: string; name: string }[];
  onChange: (next: DashboardFilterState) => void;
}) {
  const [draft, setDraft] = useState<DashboardFilterState>(value);

  // Sinkronkan draft bila nilai yang berlaku berubah dari luar.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const activeCount =
    (value.platform !== ALL ? 1 : 0) +
    (value.module !== ALL ? 1 : 0) +
    (value.environment !== ALL ? 1 : 0) +
    (value.period !== "ALL" ? 1 : 0);

  const set = <K extends keyof DashboardFilterState>(key: K, v: DashboardFilterState[K]) =>
    setDraft((prev) => ({ ...prev, [key]: v }));

  return (
    <FilterModal
      title="Filter Dashboard"
      activeCount={activeCount}
      onReset={() => setDraft(DEFAULT_FILTERS)}
      onApply={() => onChange(draft)}
    >
      <FilterFieldsPair>
        <FilterField label="Platform" htmlFor="filter-dash-platform">
          <FilterSelect
            id="filter-dash-platform"
            icon="platform"
            ariaLabel="Filter platform"
            allValue={ALL}
            placeholder="All Platforms"
            value={draft.platform}
            onChange={(v) => set("platform", v)}
            options={[
              { value: ALL, label: PLATFORM_LABELS.ALL },
              ...PLATFORM_OPTIONS.map((p) => ({
                value: p as string,
                label: PLATFORM_LABELS[p] ?? p,
              })),
            ]}
          />
        </FilterField>
        <FilterField label="Module" htmlFor="filter-dash-module">
          <FilterSelect
            id="filter-dash-module"
            icon="suite"
            searchable
            ariaLabel="Filter module"
            allValue={ALL}
            placeholder="All Modules"
            value={draft.module}
            onChange={(v) => set("module", v)}
            options={[
              { value: ALL, label: "All Modules" },
              ...modules.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        </FilterField>
      </FilterFieldsPair>

      <FilterFieldsPair>
        <FilterField label="Environment" htmlFor="filter-dash-environment">
          <FilterSelect
            id="filter-dash-environment"
            icon="environment"
            ariaLabel="Filter environment"
            allValue={ALL}
            placeholder="All Environments"
            value={draft.environment}
            onChange={(v) => set("environment", v)}
            options={[
              { value: ALL, label: "All Environments" },
              ...ENVIRONMENT_OPTIONS.map((env) => ({ value: env as string, label: env })),
            ]}
          />
        </FilterField>
        <FilterField label="Period" htmlFor="filter-dash-period">
          <FilterSelect
            id="filter-dash-period"
            icon="date"
            ariaLabel="Filter period"
            allValue="ALL"
            placeholder="All Time"
            value={draft.period}
            onChange={(v) => set("period", v as PeriodKey)}
            options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </FilterField>
      </FilterFieldsPair>
    </FilterModal>
  );
}
