"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { BulletText } from "@/components/ui/bullet-text";
import { STATUS_BADGE, statusPillStyle, type RunResultItem } from "./run-executor-shared";

/* Modal: ringkasan hasil pengujian sebelum run diselesaikan (Completion Summary). */
export function CompleteRunModal({
  items,
  untested,
  overallNotes,
  onOverallNotesChange,
  onCancel,
  onConfirm,
  completing,
}: {
  items: RunResultItem[];
  untested: number;
  overallNotes: string;
  onOverallNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  completing: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !completing) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, completing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Rangkum hanya TC yang benar-benar diisi QA (notes dan/atau actual result).
  const noted = items.filter((i) => (i.notes ?? "").trim() || (i.actualResult ?? "").trim());

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "none",
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete Test Run"
      onClick={() => {
        if (!completing) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 576,
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #F1F5F9",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          animation: "modalIn 0.18s ease-out",
        }}
      >
        {/* Body: satu-satunya area yang scroll; footer di bawahnya tetap terlihat. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0F172A" }}>
              Complete Test Run
            </h3>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#64748B", lineHeight: 1.5 }}>
              Review hasil pengujian dan tambahkan catatan akhir sebelum menyelesaikan run.
            </p>
          </div>

          {untested > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                padding: "0.65rem 0.85rem",
                borderRadius: 8,
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                color: "#B45309",
                fontSize: "0.78rem",
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>
                Masih terdapat <strong>{untested} Test Case</strong> yang belum dieksekusi. Test Case
                tersebut akan otomatis ditandai sebagai <strong>Skipped</strong>.
              </span>
            </div>
          )}

          <div>
            <div style={labelStyle}>Case Notes</div>
            <div
              className="thin-scrollbar"
              style={{
                maxHeight: 220,
                overflowY: "auto",
                padding: "0.75rem",
                // Ruang untuk scrollbar supaya tidak menempel ke tepi kartu.
                paddingRight: 12,
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                background: "rgba(248, 250, 252, 0.5)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {noted.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic", padding: "0.5rem" }}>
                  Tidak ada catatan spesifik pada test case.
                </div>
              ) : (
                noted.map((it) => {
                  const b = STATUS_BADGE[it.status];
                  return (
                    <div
                      key={it.id}
                      style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "0.6rem 0.75rem" }}
                    >
                      {/* ID di kiri, badge status menempel di pojok kanan ATAS
                          walau judulnya panjang/berbaris. */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "#475569",
                          }}
                        >
                          {it.testCase?.tcId ?? "—"}
                        </span>
                        <span style={statusPillStyle(b)}>{b.label}</span>
                      </div>
                      <div style={{ marginTop: "0.2rem", fontSize: "0.78rem", fontWeight: 600, color: "#1F2937" }}>
                        {it.titleSnapshot}
                      </div>
                      {/* Actual Result & Notes: label di barisnya sendiri, isinya
                          dirender sebagai paragraf/daftar berpoin (satu baris per
                          poin) supaya tidak menumpuk jadi paragraf panjang. */}
                      {(it.actualResult ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 2,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "#64748B",
                            }}
                          >
                            Actual Result
                          </span>
                          <BulletText
                            text={it.actualResult as string}
                            itemStyle={{ fontSize: "0.74rem", lineHeight: 1.55, color: "#475569" }}
                          />
                        </div>
                      )}
                      {(it.notes ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.3rem" }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 2,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "#64748B",
                            }}
                          >
                            Notes
                          </span>
                          <BulletText
                            text={it.notes as string}
                            itemStyle={{ fontSize: "0.74rem", lineHeight: 1.55, color: "#475569" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label htmlFor="overall-testing-notes" style={labelStyle}>
              Overall Testing Notes
            </label>
            <textarea
              id="overall-testing-notes"
              value={overallNotes}
              onChange={(e) => onOverallNotesChange(e.target.value)}
              placeholder="Tuliskan rangkuman hasil pengujian seluruh run di sini..."
              style={{
                width: "100%",
                height: 96,
                padding: "0.75rem",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                fontSize: "0.75rem",
                color: "#1F2937",
                background: "#fff",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#FBBF24";
                e.currentTarget.style.boxShadow = "0 0 0 2px #FDE68A";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </div>

        {/* Footer: di luar area scroll supaya tombol aksi selalu terlihat. */}
        <div
          style={{
            flex: "none",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#475569",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: completing ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#0F172A",
              background: "#FFC348",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              cursor: completing ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!completing) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            {completing ? "Menyelesaikan..." : "Complete Run"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
