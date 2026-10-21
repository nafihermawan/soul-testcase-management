"use client";

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

/**
 * Primitif tombol aplikasi — SATU sumber gaya supaya semua tombol primer/
 * sekunder tetap seragam (tinggi 40, radius 10, amber brand #FFC348).
 *
 * Pemakaian: `<PrimaryButton onClick={...}><Plus size={16} /> Express Run</PrimaryButton>`
 * Gaya boleh ditimpa lewat prop `style` (mis. lebar tetap atau padding khusus).
 */

export const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 40,
  boxSizing: "border-box",
  padding: "0 16px",
  border: "1px solid #FFC348",
  borderRadius: 10,
  background: "#FFC348",
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease",
};

export const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 40,
  boxSizing: "border-box",
  padding: "0 14px",
  border: "1px solid #DDE2E9",
  borderRadius: 10,
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease",
};

const HOVER = { primary: "#F0B53D", secondary: "#F8FAFC" } as const;
const REST = { primary: "#FFC348", secondary: "#FFFFFF" } as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

const BaseButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { tone: "primary" | "secondary" }
>(function BaseButton(
  { tone, style, className, onMouseEnter, onMouseLeave, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={className ? `btn-radius-10 ${className}` : "btn-radius-10"}
      style={{ ...(tone === "primary" ? primaryButtonStyle : secondaryButtonStyle), ...style }}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        // Jangan timpa warna kalau tombol sedang disabled.
        if (!e.currentTarget.disabled) e.currentTarget.style.background = HOVER[tone];
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        e.currentTarget.style.background = REST[tone];
      }}
    >
      {children}
    </button>
  );
});

/** Tombol aksi utama (amber brand). */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function PrimaryButton(
  props,
  ref
) {
  return <BaseButton tone="primary" ref={ref} {...props} />;
});

/** Tombol aksi sekunder (bordered putih). */
export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function SecondaryButton(props, ref) {
    return <BaseButton tone="secondary" ref={ref} {...props} />;
  }
);

/**
 * Pembungkus field form: label (+ penanda wajib / hint opsional) di atas
 * kontrol. Dipakai agar jarak label→kontrol seragam antar form.
 */
export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  children,
  style,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Teks kecil dalam tanda kurung, mis. "opsional". */
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label htmlFor={htmlFor} style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
        {label}
        {required && <span style={{ color: "#B91C1C" }}> *</span>}
        {hint && <span style={{ fontWeight: 400, color: "#64748B" }}> ({hint})</span>}
      </label>
      {children}
    </div>
  );
}
