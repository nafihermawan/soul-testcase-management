"use client";

import { ENVIRONMENT_OPTIONS, PERIOD_OPTIONS, PLATFORM_OPTIONS, type PeriodKey } from "@/lib/qa-metrics";

const ALL = "ALL";

const PLATFORM_LABELS: Record<string, string> = {
  ALL: "Semua Platform",
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

/** Select ringkas bergaya pill: label mikro + nilai terpilih. */
export function FilterSelect<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        background: "#FFFFFF",
        border: "1px solid #D1D5DB",
        borderRadius: 8,
        boxShadow: "var(--shadow-sm)",
        padding: "0.25rem 0.6rem",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          fontSize: "0.62rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: "0.25rem 0",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "var(--text)",
          cursor: "pointer",
          maxWidth: 190,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
