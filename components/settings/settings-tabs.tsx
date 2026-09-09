"use client";

export type SettingsTabKey = "projects" | "users";

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
        borderBottom: "1px solid var(--border)",
        marginBottom: "1.5rem",
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
              padding: "0.55rem 1.1rem",
              border: "none",
              background: "transparent",
              color: isActive ? "#FFC348" : "var(--text-secondary)",
              fontWeight: isActive ? 700 : 500,
              fontSize: "0.875rem",
              cursor: "pointer",
              borderBottom: isActive ? "2px solid #FFC348" : "2px solid transparent",
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
