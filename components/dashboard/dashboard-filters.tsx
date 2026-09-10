"use client";

import { ENVIRONMENT_OPTIONS, PERIOD_OPTIONS, PLATFORM_OPTIONS, type PeriodKey } from "@/lib/qa-metrics";
import { FilterSelect } from "@/components/ui/filter-select";

const ALL = "ALL";

const PLATFORM_LABELS: Record<string, string> = {
  ALL: "Semua Platform",
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

/** Baris filter global dashboard: Platform / Module / Environment / Period. */
export function DashboardFilters({
  value,
  modules,
  onChange,
}: {
  value: DashboardFilterState;
  modules: { id: string; name: string }[];
  onChange: (next: DashboardFilterState) => void;
}) {
  const set = <K extends keyof DashboardFilterState>(key: K, v: DashboardFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <FilterSelect
        label="Platform"
        ariaLabel="Filter platform"
        value={value.platform}
        onChange={(v) => set("platform", v)}
        options={[
          { value: ALL, label: PLATFORM_LABELS.ALL },
          ...PLATFORM_OPTIONS.map((p) => ({ value: p as string, label: PLATFORM_LABELS[p] ?? p })),
        ]}
      />
      <FilterSelect
        label="Module"
        ariaLabel="Filter module"
        value={value.module}
        onChange={(v) => set("module", v)}
        options={[
          { value: ALL, label: "Semua Module" },
          ...modules.map((m) => ({ value: m.id, label: m.name })),
        ]}
      />
      <FilterSelect
        label="Environment"
        ariaLabel="Filter environment"
        value={value.environment}
        onChange={(v) => set("environment", v)}
        options={[
          { value: ALL, label: "Semua Environment" },
          ...ENVIRONMENT_OPTIONS.map((e) => ({ value: e as string, label: e })),
        ]}
      />
      <FilterSelect
        label="Period"
        ariaLabel="Filter period"
        value={value.period}
        onChange={(v) => set("period", v)}
        options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
      />
    </div>
  );
}
