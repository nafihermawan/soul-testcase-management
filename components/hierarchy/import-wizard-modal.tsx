"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { Select } from "@/components/ui/select";

/* ---------- Import Wizard (Step 2: Preview & Mapping) ---------- */

const IMPORT_FIELDS = [
  { value: "section", label: "Section" },
  { value: "tcId", label: "TC ID" },
  { value: "title", label: "Title (Judul)" },
  { value: "type", label: "Type" },
  { value: "priority", label: "Priority" },
  { value: "scenario", label: "Description / Scenario" },
  { value: "precondition", label: "Pre-conditions" },
  { value: "expectedResult", label: "Expected Result" },
  { value: "steps", label: "Step Action" },
  { value: "testData", label: "Test Data" },
  { value: "status", label: "Status" },
] as const;

/**
 * Urutan kolom + nama header CSV EXPORT — 100% presisi dengan format template
 * upload terbaru (11 kolom, camelCase). Sumber tunggal supaya tidak melenceng.
 */

/** Auto-match: cocokkan nama header file ke field sistem (case-insensitive, toleran spasi/_/-). */
const autoMatchField = (header: string): string => {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
  const map: Record<string, string> = {
    section: "section",
    sections: "section",
    nama_section: "section",
    title: "title",
    judul: "title",
    tc_id: "tcId",
    tcid: "tcId",
    test_case_id: "tcId",
    testcaseid: "tcId",
    scenario: "scenario",
    description: "scenario",
    deskripsi: "scenario",
    detail_skenario: "scenario",
    precondition: "precondition",
    pre_condition: "precondition",
    preconditions: "precondition",
    steps: "steps",
    test_steps: "steps",
    step_action: "steps",
    stepactions: "steps",
    langkah: "steps",
    langkah_langkah: "steps",
    test_data: "testData",
    testdata: "testData",
    expected_result: "expectedResult",
    expectedresult: "expectedResult",
    expected: "expectedResult",
    ekspektasi_hasil: "expectedResult",
    ekspektasi: "expectedResult",
    hasil_yang_diharapkan: "expectedResult",
    hasil_diharapkan: "expectedResult",
    hasil_ekspektasi: "expectedResult",
    priority: "priority",
    prioritas: "priority",
    status: "status",
    type: "type",
    jenis: "type",
    tc_type: "type",
    tctype: "type",
    jenis_test_case: "type",
  };
  return map[key] ?? "";
};

export function ImportWizardModal({
  step,
  fileName,
  headers,
  rows,
  onClose,
  onProceedToPreview,
  onStartImport,
}: {
  step: 1 | 2;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  onClose: () => void;
  onProceedToPreview: () => void;
  onStartImport: (mapping: Record<string, string>) => void | Promise<void>;
}) {
  // mapping: header file -> field sistem ("" = tidak dipetakan)
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const h of headers) initial[h] = autoMatchField(h);
    return initial;
  });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const mappedField = (header: string) => mapping[header] ?? "";
  const setField = (header: string, field: string) =>
    setMapping((prev) => ({ ...prev, [header]: field }));

  // Validasi: hanya Title yang wajib terpetakan (field lain — termasuk Section — opsional).
  const titleHeader = headers.find((h) => mappedField(h) === "title");
  const canImport = !!titleHeader;

  // Tampilkan SELURUH baris; panelnya punya scroll sendiri (max-h).
  const previewRows = rows;
  const invalidRows = rows
    .map((r, i) => ({ idx: i + 1, title: titleHeader ? (r[titleHeader] ?? "").trim() : "" }))
    .filter((r) => !r.title);

  const cellValue = (r: Record<string, string>, field: string) => {
    const header = headers.find((h) => mappedField(h) === field);
    return header ? (r[header] ?? "") : "";
  };

  const handleStart = async () => {
    setStarting(true);
    await onStartImport(mapping);
    setStarting(false);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview & Mapping Import"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          // Step 2 butuh layout 2 kolom (mapping + preview) → modal dilebarkan
          // (setara max-w-6xl); step 1 tetap ringkas.
          maxWidth: step === 2 ? 1152 : 720,
          // Step 2 memakai tinggi tetap agar panel mengisi sampai divider
          // footer (tanpa sisa whitespace); step 1 tetap setinggi kontennya.
          height: step === 2 ? "90vh" : undefined,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — garis pemisah di-inset selebar padding modal (tidak
            menembus tepi kiri/kanan). */}
        <div style={{ padding: "1rem 1.25rem 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "1rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
              {step === 1 ? "Upload File" : "Preview & Mapping Import"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
              {fileName} · {rows.length} baris
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Baris atas: stepper (kiri) + banner validasi (kanan) */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            {/* Stepper — teks polos tanpa pill/background */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  color: step > 1 ? "#059669" : step === 1 ? "#111827" : "var(--text-muted)",
                }}
              >
                {step > 1 ? "✓ " : ""}Upload File
              </span>
              <span style={{ color: "var(--text-muted)" }}>&gt;</span>
              <span style={{ color: step === 2 ? "#111827" : "var(--text-muted)" }}>
                Mapping &amp; Preview
              </span>
              <span style={{ color: "var(--text-muted)" }}>&gt;</span>
              <span style={{ color: "var(--text-muted)" }}>Import</span>
            </div>

            {/* Banner validasi — sejajar dengan stepper (hanya muncul di step 2) */}
            {step === 2 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: 8,
                  background: canImport ? "#ECFDF5" : "#FEF2F2",
                  border: `1px solid ${canImport ? "#A7F3D0" : "#FECACA"}`,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: canImport ? "#047857" : "#DC2626",
                }}
              >
                {canImport ? (
                  <>
                    <CheckCircle2 size={15} />
                    {rows.length} Baris Valid Siap di-Import
                  </>
                ) : (
                  <>
                    <AlertCircle size={15} />
                    Petakan kolom Title untuk melanjutkan
                  </>
                )}
              </div>
            )}
          </div>

          {step === 1 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
                padding: "2.5rem 1rem",
                border: "2px dashed var(--border-strong)",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <Upload size={28} style={{ color: "var(--text-muted)" }} />
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#111827" }}>
                File siap diimpor
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                <strong>{fileName}</strong> · {rows.length} baris terdeteksi.
                <br />
                Lanjutkan untuk memeriksa & memetakan kolom sebelum import.
              </div>
            </div>
          )}

          {step === 2 && (
            <div
              style={{
                display: "grid",
                // Kolom kiri (mapping) ~1/3, kolom kanan (preview) ~2/3.
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
                gap: "1.25rem",
                // Isi sisa tinggi body (stretch) supaya panel mencapai footer.
                flex: "1 1 auto",
                minHeight: 0,
              }}
            >
              {/* Kolom kiri: Field Mapping — judul tetap; daftar mengisi sisa tinggi */}
              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <h4
                  style={{
                    flexShrink: 0,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  Field Mapping
                </h4>
                <div
                  style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflowY: "auto",
                    paddingRight: "0.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                  }}
                >
                  {headers.map((h) => {
                    const required =
                      mappedField(h) === "title" || mappedField(h) === "expectedResult";
                    return (
                      <div
                        key={h}
                        style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
                      >
                        {/* Nama kolom file di atas, dropdown tujuan di bawahnya —
                            pas untuk kolom kiri yang sempit. */}
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "#374151",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={h}
                        >
                          {h}
                          {required && (
                            <span
                              aria-hidden="true"
                              style={{
                                color: "#F43F5E",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                lineHeight: 1,
                              }}
                            >
                              *
                            </span>
                          )}
                        </span>
                        <Select
                          value={mappedField(h)}
                          ariaLabel={`Field tujuan untuk ${h}`}
                          // Teks value dropdown dibuat lebih halus & netral
                          // (bukan semibold) mengikuti gaya body.
                          style={{ fontWeight: 400, color: "#475569" }}
                          onChange={(e) => setField(h, e.target.value)}
                        >
                          <option value="">— Jangan diimpor —</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kolom kanan: Data Preview — tabel mengisi sisa tinggi kolom */}
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <h4
                  style={{
                    flexShrink: 0,
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  Data Preview
                </h4>
                {invalidRows.length > 0 && (
                  <div
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      marginBottom: "0.6rem",
                    }}
                  >
                    {invalidRows.slice(0, 5).map((r) => (
                      <span
                        key={r.idx}
                        style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 600 }}
                      >
                        Baris {r.idx}: Title tidak boleh kosong
                      </span>
                    ))}
                    {invalidRows.length > 5 && (
                      <span style={{ fontSize: "0.72rem", color: "#B91C1C" }}>
                        … dan {invalidRows.length - 5} baris lain tanpa Title
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    // Mengisi sisa tinggi kolom sampai divider footer.
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflow: "auto",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", color: "#6B7280", textAlign: "left" }}>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            width: 44,
                            fontWeight: 600,
                            background: "#F8FAFC",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            background: "#F8FAFC",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Section
                        </th>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            background: "#F8FAFC",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Title
                        </th>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            background: "#F8FAFC",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Pre-conditions
                        </th>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            background: "#F8FAFC",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Step Action
                        </th>
                        <th
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            background: "#F8FAFC",
                          }}
                        >
                          Expected Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => {
                        const invalid = !(titleHeader ? (r[titleHeader] ?? "").trim() : "");
                        return (
                          <tr
                            key={i}
                            style={{
                              borderTop: "1px solid var(--border)",
                              background: invalid ? "#FEF2F2" : "transparent",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                textAlign: "center",
                                color: "#9CA3AF",
                                borderRight: "1px solid var(--border)",
                              }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                borderRight: "1px solid var(--border)",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={cellValue(r, "section") || "Tanpa Section"}
                            >
                              {cellValue(r, "section") || (
                                <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>
                                  Tanpa Section
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: invalid ? "#DC2626" : "#111827",
                                fontWeight: 500,
                                borderRight: "1px solid var(--border)",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "title") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                borderRight: "1px solid var(--border)",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "precondition") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                borderRight: "1px solid var(--border)",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "steps") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "expectedResult") || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — latar disamakan dengan konten (putih) & garis pemisah di-inset. */}
        <div style={{ padding: "0 1.25rem 1rem", background: "#fff", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "3px !important",
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Batal
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={onProceedToPreview}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1.1rem",
                borderRadius: "3px !important",
                border: "none",
                background: "#F59E0B",
                color: "#000000",
                fontWeight: 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
            >
              Lanjut ke Preview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canImport || starting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1.1rem",
                borderRadius: "3px !important",
                border: "none",
                background: "#F59E0B",
                color: "#000000",
                fontWeight: 500,
                fontSize: "0.85rem",
                cursor: !canImport || starting ? "not-allowed" : "pointer",
                opacity: !canImport ? 0.5 : 1,
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (canImport && !starting) e.currentTarget.style.background = "#D97706";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#F59E0B";
              }}
            >
              {starting ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />{" "}
                  Memproses...
                </span>
              ) : (
                "Impor Test Case"
              )}
            </button>
          )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
