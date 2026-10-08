"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, FileDown, Pencil, X } from "lucide-react";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { EditBugModal } from "@/components/bugs/edit-bug-modal";
import { Spinner } from "@/components/ui/feedback";
import { downloadBugPdf } from "@/lib/bug-pdf";
import { entityCode } from "@/lib/format";
import type { BugDetailPayload, BugEditableFields, BugRow } from "@/types/api";

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.4rem",
};

/** Paragraf isi (Expected Result & Bug Description) — plain text tanpa box. */
const bodyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#334155",
  lineHeight: 1.625,
  whiteSpace: "pre-wrap",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Pasangan label + nilai untuk grid informasi. */
function InfoPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: "0.625rem", fontWeight: 700, color: "#94A3B8", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "#334155",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Modal detail bug: judul, ID, rujukan TC, expected result dari TC, deskripsi,
 * dan evidence read-only. Mengambil datanya sendiri dari /api/bugs/[id] karena
 * payload daftar run tidak memuat deskripsi + evidence bug.
 */
export function BugDetailModal({
  bugId,
  onClose,
  onUpdated,
}: {
  bugId: string;
  onClose: () => void;
  /** Field bug berubah lewat Edit Bug — parent memakai ini untuk patch lokal. */
  onUpdated?: (bugId: string, patch: BugEditableFields) => void;
}) {
  const [bug, setBug] = useState<BugRow | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canAttach, setCanAttach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Edit Bug Modal sedang terbuka di atas modal ini. */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bugs/${bugId}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Bug tidak ditemukan." : "Gagal memuat detail bug.");
        }
        const data = (await res.json()) as BugDetailPayload;
        if (cancelled) return;
        setBug(data.bug);
        setCanEdit(data.canEdit);
        setCanAttach(data.canAttach);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat detail bug.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bugId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Saat Edit modal terbuka, Escape ditangani modal itu — jangan ikut menutup
      // modal detail di belakangnya.
      if (e.key === "Escape" && !editing) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, editing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** Simpan Edit Bug: patch modal ini + teruskan ke daftar lokal parent. */
  const handleSaved = (patch: BugEditableFields) => {
    setBug((prev) => (prev ? { ...prev, ...patch } : prev));
    onUpdated?.(bugId, patch);
    setEditing(false);
  };

  // Expected Result milik bug; kalau kosong, pakai milik Test Case terkait.
  const expectedText =
    bug?.expectedResult?.trim() || bug?.testCase?.expectedResult?.trim() || "";

  /**
   * Ekspor laporan bug ringkas (PDF). Hyperlink evidence memakai URL presigned
   * R2, jadi bisa dibuka tanpa login sampai masa berlakunya habis.
   */
  const exportPdf = () => {
    if (!bug) return;
    void downloadBugPdf({
      bugCode: entityCode("BUG", bug.id),
      title: bug.title,
      severity: bug.severity,
      status: bug.status,
      precondition: bug.testCase?.precondition ?? null,
      expectedResult: bug.testCase?.expectedResult ?? bug.expectedResult,
      actualResult: bug.description,
      runName: bug.run?.name ?? null,
      environment: bug.environment ?? bug.run?.environment ?? null,
      moduleName: bug.suite?.name ?? null,
      reporter: bug.createdBy?.name ?? null,
      createdAt: bug.createdAt,
      evidence: bug.attachments.map((a) => ({
        fileName: a.fileName,
        url: a.url,
        mimeType: a.mimeType,
      })),
    });
  };

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail Bug"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 300,
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
            maxWidth: 672,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #F1F5F9",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            overflow: "hidden",
            animation: "modalIn 0.18s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ flexShrink: 0, padding: "1.25rem 1.5rem 0.75rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
              <div style={{ minWidth: 0 }}>
                {/* ID bug — plain text hitam, monospace */}
                <span
                  style={{
                    color: "#0F172A",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {entityCode("BUG", bugId)}
                </span>
                {/* Title di baris baru di bawah ID */}
                {bug && (
                  <h2
                    style={{
                      margin: "0.35rem 0 0",
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#1E293B",
                      lineHeight: 1.4,
                      minWidth: 0,
                    }}
                  >
                    {bug.title}
                  </h2>
                )}
              </div>
              <button
                type="button"
                aria-label="Tutup"
                onClick={onClose}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#94A3B8",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
              >
                <X size={18} />
              </button>
            </div>

            {/* Divider tipis tepat di bawah title — inset di dalam padding header,
                bukan full-bleed ke tepi modal. */}
            <div style={{ borderTop: "1px solid #F1F5F9", marginTop: "0.75rem" }} />

            {/* Tanpa pill badge: semua atribut jadi teks di grid bawah. */}
            {bug && (
              <>
                {bug.testCase && (
                  <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#64748B" }}>
                    Test Case Ref:{" "}
                    {/* Hanya nilai TC ID yang hyperlink — labelnya netral. */}
                    <Link
                      href={`/test-cases/${bug.testCase.id}`}
                      style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      {bug.testCase.tcId}
                    </Link>
                  </div>
                )}

                {/* Info grid: status, severity, suite/project, environment, dll. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "0.6rem 1.25rem",
                    marginTop: "0.85rem",
                  }}
                >
                  <InfoPair label="Status" value={STATUS_LABEL[bug.status] ?? bug.status} />
                  <InfoPair label="Severity" value={bug.severity ?? "—"} />
                  <InfoPair label="Suite / Module" value={bug.suite?.name ?? "—"} />
                  <InfoPair label="Project" value={bug.project?.name ?? "—"} />
                  <InfoPair label="Environment" value={bug.environment ?? "—"} />
                  <InfoPair
                    label="Tipe"
                    value={bug.testCase ? "Test Run Bug" : "Ad-hoc / General"}
                  />
                  <InfoPair
                    label="Test Run"
                    value={
                      bug.run ? (
                        <Link
                          href={`/test-runs/${bug.run.id}`}
                          style={{ color: "#2563EB", textDecoration: "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {bug.run.name}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <InfoPair
                    label="Dibuat"
                    value={`${bug.createdBy?.name ?? "—"} · ${new Date(bug.createdAt).toLocaleDateString(
                      "id-ID",
                      { day: "2-digit", month: "short", year: "numeric" }
                    )}`}
                  />
                </div>
              </>
            )}
          </div>

          {/* Body (scrollable) */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 1.5rem 1.25rem" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "3rem 0", color: "#64748B", fontSize: "0.8rem" }}>
                <Spinner size={16} /> Memuat detail bug...
              </div>
            ) : !bug ? (
              <div style={{ padding: "2rem 0", textAlign: "center", fontSize: "0.8rem", color: "#B91C1C" }}>
                {error ?? "Bug tidak ditemukan."}
              </div>
            ) : (
              <>
                {/* Deskripsi & Hasil Aktual */}
                <div style={{ margin: "1rem 0 1.25rem" }}>
                  <div style={labelStyle}>Deskripsi &amp; Hasil Aktual</div>
                  <p style={bodyTextStyle}>
                    {bug.description?.trim() ? bug.description : "Tidak ada deskripsi."}
                  </p>
                </div>

                {/* Expected Result — milik bug, fallback ke Test Case terkait. */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={labelStyle}>Expected Result</div>
                  {expectedText ? (
                    <p style={bodyTextStyle}>{expectedText}</p>
                  ) : (
                    <p style={{ ...bodyTextStyle, color: "#94A3B8", fontStyle: "italic" }}>
                      Belum ada expected result.
                    </p>
                  )}
                </div>

                {/* Link Eksternal — hanya tampil bila ada nilainya. */}
                {bug.externalLink && (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={labelStyle}>Link Eksternal</div>
                    <a
                      href={bug.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#2563EB",
                        textDecoration: "none",
                        wordBreak: "break-all",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      {bug.externalLink} <ExternalLink size={12} />
                    </a>
                  </div>
                )}

                {/* Evidence (Lampiran) — read-only di modal ini; empty state rapi. */}
                <div>
                  <div style={labelStyle}>Evidence (Lampiran)</div>
                  {bug.attachments.length > 0 ? (
                    <AttachmentsPanel
                      owner={{ bugId: bug.id }}
                      attachments={bug.attachments}
                      canEdit={false}
                      compact
                      thumbnailOnly
                    />
                  ) : (
                    <p style={{ ...bodyTextStyle, color: "#94A3B8", fontStyle: "italic" }}>
                      Belum ada evidence.
                    </p>
                  )}
                </div>

                {error && (
                  <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>
                )}
              </>
            )}
          </div>

          {/* Divider inset di atas footer — tidak full-bleed ke tepi modal. */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #F1F5F9", margin: "0 1.5rem" }} />

          {/* Footer — [Export PDF] lalu [Edit] (Edit hanya untuk yang berhak). */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.75rem",
              padding: "1rem 1.5rem",
            }}
          >
            {bug && (
              <button
                type="button"
                onClick={exportPdf}
                title="Download laporan bug (PDF) — link evidence bisa diklik tanpa login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.375rem 0.75rem",
                  border: "1px solid #CBD5E1",
                  borderRadius: 8,
                  background: "#fff",
                  color: "#334155",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <FileDown size={13} /> Export PDF
              </button>
            )}
            {bug && canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: 8,
                  background: "#FBBF24",
                  color: "#0F172A",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F59E0B")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#FBBF24")}
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Bug Modal — sibling (bukan anak overlay) supaya klik di dalamnya
          tidak ikut menutup modal detail lewat bubbling. */}
      {editing && bug && (
        <EditBugModal
          bug={bug}
          canAttach={canAttach}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
          onAttachmentsChange={(items) =>
            setBug((prev) => (prev ? { ...prev, attachments: items } : prev))
          }
        />
      )}
    </>,
    document.body
  );
}
