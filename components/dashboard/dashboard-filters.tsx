"use client";

import { useEffect, useState } from "react";
import { FilterModal } from "@/components/ui/filter-modal";
import { CustomSelect, filterLabelStyle } from "@/components/ui/custom-select";
import {
  ENVIRONMENT_OPTIONS,
  PERIOD_OPTIONS,
  PLATFORM_OPTIONS,
  type PeriodKey,
} from "@/lib/qa-metrics";

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

const DEFAULT_FILTERS: DashboardFilterState = {
  platform: ALL,
  module: ALL,
  environment: ALL,
  period: "ALL",
};

/**
 * Filter global dashboard: satu tombol Filter + popover berisi 4 field.
 *
 * Nilai dipilih ditahan sebagai `draft`; baru dikirim ke parent saat "Terapkan"
 * diklik. Shell popover-nya komponen bersama (dipakai juga di halaman Reports).
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
      <div>
        <span style={filterLabelStyle}>Platform</span>
        <CustomSelect
          ariaLabel="Filter platform"
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
      </div>

      <div>
        <span style={filterLabelStyle}>Module</span>
        <CustomSelect
          ariaLabel="Filter module"
          value={draft.module}
          onChange={(v) => set("module", v)}
          options={[
            { value: ALL, label: "Semua Module" },
            ...modules.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
      </div>

      <div>
        <span style={filterLabelStyle}>Environment</span>
        <CustomSelect
          ariaLabel="Filter environment"
          value={draft.environment}
          onChange={(v) => set("environment", v)}
          options={[
            { value: ALL, label: "Semua Environment" },
            ...ENVIRONMENT_OPTIONS.map((env) => ({ value: env as string, label: env })),
          ]}
        />
      </div>

      <div>
        <span style={filterLabelStyle}>Period</span>
        <CustomSelect
          ariaLabel="Filter period"
          value={draft.period}
          onChange={(v) => set("period", v as PeriodKey)}
          options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
        />
      </div>
    </FilterModal>
  );
}
