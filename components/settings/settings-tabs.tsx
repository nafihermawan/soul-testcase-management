"use client";

export type SettingsTabKey = "projects" | "users";

/**
 * Tab navigation Settings — model lama: berada DI LUAR card (tepat di bawah
 * header halaman), tab aktif ditandai garis bawah amber + teks amber bold.
 */
export function SettingsTabs({
  active,
  onChange,
}: {
  active: SettingsTabKey;
  onChange: (tab: SettingsTabKey) => void;
}) {
  const tabs: { key: SettingsTabKey; label: string }[] = [
    { key: "projects", label: "Projects" },
    { key: "users", label: "User & Roles" },
  ];

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "1px solid #E5E7EB",
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
            onClick={() => onChange(tab.key)}
            style={{
              padding: "8px 14px",
              border: "none",
              background: "transparent",
              color: isActive ? "#F59E0B" : "#64748B",
              fontWeight: isActive ? 700 : 600,
              fontSize: 13,
              cursor: "pointer",
              borderBottom: isActive ? "2px solid #F59E0B" : "2px solid transparent",
              borderRadius: "6px 6px 0 0",
              marginBottom: "-1px",
              transition: "color 0.2s ease, border-color 0.2s ease",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
