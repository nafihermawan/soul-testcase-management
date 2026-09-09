"use client";

import { Funnel } from "lucide-react";

export type EnvFilterType = "ALL" | "Web" | "Mobile" | "Hardware" | "API";

const ENV_OPTIONS: EnvFilterType[] = ["ALL", "Web", "Mobile", "Hardware", "API"];

const ENV_LABELS: Record<EnvFilterType, string> = {
  ALL: "Semua Platform",
  Web: "Platform: Web",
  Mobile: "Platform: Mobile",
  Hardware: "Platform: Hardware",
  API: "Platform: API",
};

export function EnvFilter({
  value,
  onChange,
}: {
  value: EnvFilterType;
  onChange: (env: EnvFilterType) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        width: 190,
        background: "#FFFFFF",
        borderRadius: 8,
        border: "1px solid #D1D5DB",
        boxShadow: "var(--shadow-sm)",
        padding: "0 0.625rem",
      }}
    >
      <Funnel size={14} style={{ color: "#9CA3AF", flexShrink: 0 }} />
      <select
        aria-label="Filter environment"
        value={value}
        onChange={(e) => onChange(e.target.value as EnvFilterType)}
        style={{
          flex: 1,
          appearance: "none",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: "0.5rem 0",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "var(--text)",
          cursor: "pointer",
        }}
      >
        {ENV_OPTIONS.map((env) => (
          <option key={env} value={env}>
            {ENV_LABELS[env]}
          </option>
        ))}
      </select>
    </div>
  );
}
