"use client";

import { useState } from "react";

export type TabItem = {
  key: string;
  label: string;
  content: React.ReactNode;
};

export function Tabs({ tabs, initialKey }: { tabs: TabItem[]; initialKey?: string }) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initialKey) ? initialKey! : (tabs[0]?.key ?? "")
  );

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "0.35rem",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1rem",
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              style={{
                padding: "0.45rem 1rem",
                marginBottom: "0.45rem",
                border: isActive ? "1px solid #FCD34D" : "1px solid transparent",
                borderRadius: 8,
                background: isActive ? "#FEF3C7" : "transparent",
                color: isActive ? "#92400E" : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div>{tabs.find((t) => t.key === active)?.content ?? null}</div>
    </div>
  );
}
