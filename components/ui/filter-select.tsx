"use client";

/** Select ringkas bergaya pill: label mikro + nilai terpilih.
 *  Dipakai bersama oleh filter Dashboard dan Reports. */
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
