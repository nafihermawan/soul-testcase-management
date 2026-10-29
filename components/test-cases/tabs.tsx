"use client";

import { useState } from "react";

export type TabItem = {
  key: string;
  label: string;
  content: React.ReactNode;
  /** Jumlah item (mis. Bugs / Attachments) — tampil sebagai badge kecil. */
  badge?: number;
};

export function Tabs({
  tabs,
  initialKey,
  onChange,
}: {
  tabs: TabItem[];
  initialKey?: string;
  /** Dipanggil saat tab berganti — dipakai halaman untuk menyesuaikan UI lain. */
  onChange?: (key: string) => void;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initialKey) ? initialKey! : (tabs[0]?.key ?? "")
  );

  const select = (key: string) => {
    setActive(key);
    onChange?.(key);
  };

  return (
    <div>
      {/* Gaya underline: state warna/berat/border ditangani `.tc-tab` di
          globals.css (hover & aria-selected tidak bisa lewat inline style). */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 28,
          borderBottom: "1px solid #E2E8F0",
          marginBottom: 20,
          flexWrap: "wrap",
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
              className="tc-tab"
              onClick={() => select(tab.key)}
            >
              {tab.label}
              {typeof tab.badge === "number" && (
                <span className="tc-tab-badge">{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Cross-fade isi tab saat berganti. */}
      <div key={active} className="content-fade-in">
        {tabs.find((t) => t.key === active)?.content ?? null}
      </div>
    </div>
  );
}
