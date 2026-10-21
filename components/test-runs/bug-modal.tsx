"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Bug, X } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";
import type { RunResultItem } from "./run-executor-shared";

/* Modal: Buat Bug Baru (dari hasil Fail) */
export function BugModal({
  item,
  title,
  description,
  expectedResult,
  severity,
  environment,
  error,
  pending,
  onTitleChange,
  onDescriptionChange,
  onExpectedResultChange,
  onSeverityChange,
  onClose,
  onSave,
}: {
  item: RunResultItem;
  title: string;
  description: string;
  expectedResult: string;
  severity: string;
  /** Environment run — read-only, ikut Test Run (diturunkan di server). */
  environment: string | null;
  error: string | null;
  pending: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onExpectedResultChange: (v: string) => void;
  onSeverityChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canSave = title.trim().length > 0;

  const tcCode = item.testCase?.tcId ?? null;

  const labelBase: React.CSSProperties = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "none",
    color: "#374151",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "0.55rem 0.75rem",
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    fontSize: "0.85rem",
    color: "#111827",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#F59E0B";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.18)";
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#D1D5DB";
    e.currentTarget.style.boxShadow = "none";
  };

  const useTcTitle = () => {
    if (!item.testCase?.title) return;
    onTitleChange(item.testCase.title);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buat Bug Baru"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={pending ? undefined : onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 512,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              Buat Bug Baru
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "#6B7280" }}>
                Related to:
              </span>
              {tcCode ? (
                <span
                  title={tcCode}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    maxWidth: 260,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    borderRadius: 6,
                    padding: "2px 8px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  TC: {tcCode}
                </span>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>—</span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={pending}
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "#9CA3AF",
              cursor: pending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.color = "#4B5563";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#9CA3AF";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          {/* Judul Bug */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: 6,
              }}
            >
              <label style={labelBase}>
                Judul Bug <span style={{ color: "#EF4444" }}>*</span>
              </label>
              {item.testCase?.title ? (
                <button
                  type="button"
                  onClick={useTcTitle}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: "#2563EB",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#1D4ED8";
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#2563EB";
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  ⚡ Gunakan Judul TC
                </button>
              ) : null}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Masukan judul ringkas isu/bug..."
              style={inputBase}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {/* Severity */}
          <div>
            <label style={{ ...labelBase, marginBottom: 8 }}>
              Severity <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((opt) => {
                const active = severity === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={pending}
                    onClick={() => onSeverityChange(opt)}
                    style={{
                      padding: "0.5rem 0",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      border: `1px solid ${active ? "#111827" : "#E5E7EB"}`,
                      borderRadius: 8,
                      background: active ? "#111827" : "#FFFFFF",
                      color: active ? "#FFFFFF" : "#4B5563",
                      cursor: pending ? "not-allowed" : "pointer",
                      transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active && !pending) {
                        e.currentTarget.style.background = "#F9FAFB";
                        e.currentTarget.style.borderColor = "#D1D5DB";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#FFFFFF";
                        e.currentTarget.style.borderColor = "#E5E7EB";
                      }
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Environment — read-only: bug dari eksekusi mewarisi env run ini. */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Environment <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(dari Test Run)</span>
            </label>
            <input
              type="text"
              value={environment ?? "—"}
              readOnly
              disabled
              title="Environment mengikuti Test Run terkait."
              style={{ ...inputBase, background: "#F9FAFB", color: "#6B7280" }}
            />
          </div>

          {/* Expected Result (auto-fill dari Test Case, editable) */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Expected Result
            </label>
            <textarea
              value={expectedResult}
              onChange={(e) => onExpectedResultChange(e.target.value)}
              placeholder="Hasil ekspektasi dari skenario test case..."
              rows={2}
              style={{
                ...inputBase,
                resize: "vertical",
                lineHeight: 1.5,
                background: "#F9FAFB",
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {/* Deskripsi / Langkah Reproduksi */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Deskripsi / Langkah Reproduksi
            </label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Tuliskan langkah reproduksi atau catatan hasil eksekusi..."
              rows={4}
              style={{
                ...inputBase,
                resize: "vertical",
                lineHeight: 1.5,
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {error && <div style={{ fontSize: "0.82rem", color: "#DC2626" }}>{error}</div>}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.6rem",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #E5E7EB",
            background: "#F8FAFC",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "0.5rem 1.15rem",
              border: "1px solid #D1D5DB",
              borderRadius: 8,
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F9FAFB";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !canSave}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: pending || !canSave ? "#FDE68A" : "#F59E0B",
              color: "#111827",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: pending || !canSave ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending && canSave) e.currentTarget.style.background = "#D97706";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                pending || !canSave ? "#FDE68A" : "#F59E0B";
            }}
          >
            {pending ? (
              <>
                <Spinner size={14} /> Menyimpan...
              </>
            ) : (
              <>
                <Bug size={14} /> Simpan Bug
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
