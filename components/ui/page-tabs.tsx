"use client";

/**
 * Tab navigation halaman — dipakai bersama Settings dan Reports & Analytics.
 *
 * Gaya "model lama": tab aktif = teks amber + garis bawah amber, tab non-aktif
 * polos; barisnya dipisah satu garis halus dan duduk DI LUAR card konten.
 */
export function PageTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "0.25rem",
        borderBottom: "1px solid #E5E7EB",
        overflowX: "auto",
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
              whiteSpace: "nowrap",
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
