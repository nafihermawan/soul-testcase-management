"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { MONO, SANS } from "@/components/reports/report-tokens";

/* ---------- Token (selaras bahasa desain Reports/Filters) ---------- */
const TEXT = "#0F172A";
const SECONDARY = "#334155";
const MUTED = "#475569";
const CAPTION = "#64748B";
const FAINT = "#94A3B8";
const LINE = "#EEF1F5";
const BOX_BORDER = "#E3E7EE";
const INPUT_BORDER = "#DDE2E9";
const ROW_DIVIDER = "#F1F4F8";
const HEAD_BG = "#F8FAFC";
const YELLOW = "#FFC348";
const YELLOW_TINT = "#FFF8E8";
const YELLOW_LIGHT = "#FFFCF4";
const YELLOW_TILE = "#FFF1D1";
const SUCCESS = "#15803D";
const SUCCESS_TILE = "#F0F9F3";
const DANGER = "#B91C1C";

/** Urutan field pada kolom "Field Mapping" (label sengaja lowercase). */
const FIELD_ROWS: { field: string; label: string; required?: boolean }[] = [
  { field: "section", label: "section" },
  { field: "title", label: "title", required: true },
  { field: "tcId", label: "tcid" },
  { field: "type", label: "type" },
  { field: "scenario", label: "scenario" },
  { field: "precondition", label: "precondition" },
  { field: "steps", label: "steps" },
  { field: "testData", label: "testData" },
  { field: "expectedResult", label: "expectedResult", required: true },
  { field: "priority", label: "priority" },
  { field: "status", label: "status" },
];

const STEPS = ["Upload File", "Mapping & Preview", "Import"];

/** Auto-match: cocokkan nama header file ke field sistem (toleran spasi/_/-). */
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

/** Tombol sekunder (Batal / Pilih File / Ganti File). */
const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxSizing: "border-box",
  border: `1px solid ${INPUT_BORDER}`,
  background: "#FFFFFF",
  color: TEXT,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
};

/** Tombol primer kuning (teks saja) + keadaan disabled abu. */
const primaryBtn = (enabled: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 40,
  boxSizing: "border-box",
  padding: "0 18px",
  borderRadius: 10,
  border: `1px solid ${enabled ? YELLOW : LINE}`,
  background: enabled ? YELLOW : "#F1F5F9",
  color: enabled ? TEXT : FAINT,
  fontSize: 14,
  fontWeight: 600,
  cursor: enabled ? "pointer" : "not-allowed",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease",
});

export function ImportWizardModal({
  step,
  fileName,
  headers,
  rows,
  error,
  onClose,
  onProceedToPreview,
  onStartImport,
  onPickFile,
  onDropFile,
  onDownloadTemplate,
  onRemoveFile,
}: {
  step: 1 | 2;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  /** Pesan bila file gagal dibaca / tidak berisi data. */
  error?: string | null;
  onClose: () => void;
  onProceedToPreview: () => void;
  onStartImport: (mapping: Record<string, string>) => void | Promise<void>;
  /** Buka OS file picker (dropzone / "Pilih File" / "Ganti File"). */
  onPickFile: () => void;
  /** File dari drag & drop pada dropzone. */
  onDropFile: (file: File) => void;
  /** Unduh template CSV/Excel sebagai referensi format. */
  onDownloadTemplate: () => void;
  /** Lepas file terpilih → kembali ke state 1. */
  onRemoveFile: () => void;
}) {
  // mapping: header file -> field sistem ("" = tidak dipetakan)
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const h of headers) initial[h] = autoMatchField(h);
    return initial;
  });
  const [starting, setStarting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------- Mapping (field sistem ← kolom file) ---------- */
  const headerForField = (field: string) => headers.find((h) => mapping[h] === field) ?? "";

  /** Satu kolom hanya boleh mengisi satu field, dan sebaliknya. */
  const setFieldSource = (field: string, header: string) => {
    setMapping((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const h of headers) if (next[h] === field) next[h] = "";
      if (header) next[header] = field;
      return next;
    });
  };

  /* ---------- Validasi ---------- */
  const titleHeader = headers.find((h) => mapping[h] === "title");
  const expectedHeader = headers.find((h) => mapping[h] === "expectedResult");
  const invalidRows = rows
    .map((r, i) => ({ idx: i + 1, title: titleHeader ? (r[titleHeader] ?? "").trim() : "" }))
    .filter((r) => !r.title);
  const validCount = rows.length - invalidRows.length;
  // Wajib: title + expectedResult terpetakan, dan minimal 1 baris valid.
  const canImport = !!titleHeader && !!expectedHeader && validCount > 0;

  const cellValue = (r: Record<string, string>, field: string) => {
    const header = headers.find((h) => mapping[h] === field);
    return header ? (r[header] ?? "") : "";
  };

  const handleStart = async () => {
    if (!canImport || starting) return;
    setStarting(true);
    await onStartImport(mapping);
    setStarting(false);
  };

  const hasFile = fileName !== "";
  const canProceed = hasFile && rows.length > 0 && !error;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.45)",
        fontFamily: SANS,
      }}
      onClick={starting ? undefined : onClose}
    >
      <div
        style={{
          width: step === 2 ? 1240 : 600,
          maxWidth: "calc(100vw - 48px)",
          height: step === 2 ? 860 : undefined,
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: "#FFFFFF",
          borderRadius: 18,
          boxShadow: "0 24px 48px -12px rgba(15, 23, 42, 0.28)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        // Cegah browser membuka file bila drop jatuh di luar dropzone.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "20px 16px 16px 24px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <h3
              id="import-wizard-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: TEXT,
              }}
            >
              {step === 2 ? "Preview & Mapping Import" : "Upload File"}
            </h3>
            <div
              style={{
                fontSize: 13,
                color: CAPTION,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={fileName || undefined}
            >
              {hasFile ? `${fileName} · ${rows.length} baris` : "Belum ada file dipilih"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: 9,
              color: CAPTION,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider inset */}
        <div style={{ height: 1, margin: "0 24px", background: LINE, flexShrink: 0 }} />

        {/* Stepper */}
        <div
          style={{
            padding: "16px 24px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            {STEPS.map((label, i) => {
              const key = i + 1;
              const state = key < step ? "done" : key === step ? "current" : "upcoming";
              const connector = key < step ? YELLOW : "#E2E8F0";
              return (
                <li
                  key={label}
                  aria-current={state === "current" ? "step" : undefined}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        ...(state === "upcoming"
                          ? { border: "1.5px solid #CBD5E1", background: "transparent" }
                          : { background: YELLOW }),
                      }}
                    >
                      {state === "done" ? (
                        <Check size={12} color="#FFFFFF" strokeWidth={3} aria-hidden="true" />
                      ) : (
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            fontWeight: 600,
                            color: state === "current" ? TEXT : FAINT,
                            lineHeight: 1,
                          }}
                        >
                          {key}
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: state === "current" ? 600 : 500,
                        color: state === "current" ? TEXT : state === "done" ? SECONDARY : FAINT,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </span>
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 32,
                        height: 2,
                        borderRadius: 2,
                        background: connector,
                        margin: "0 10px",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {/* Ringkasan validasi (state 3) — teks polos, tanpa pill */}
          {step === 2 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  color: SUCCESS,
                  whiteSpace: "nowrap",
                }}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  <span style={{ fontFamily: MONO, fontWeight: 600 }}>{validCount}</span> baris
                  valid, siap di-import
                </span>
              </span>
              {invalidRows.length > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: DANGER,
                    whiteSpace: "nowrap",
                  }}
                >
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>
                    <span style={{ fontFamily: MONO, fontWeight: 600 }}>{invalidRows.length}</span>{" "}
                    baris tidak valid
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {step === 1 ? (
          <div
            key="upload"
            // Cross-fade saat pindah step (Upload ↔ Mapping).
            className="content-fade-in"
            style={{
              padding: "18px 24px 24px",
              display: "flex",
              flexDirection: "column",
              gap: hasFile ? 14 : 0,
            }}
          >
            {!hasFile ? (
              <>
                {/* State 1: dropzone */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Pilih atau lepas file import"
                  onClick={onPickFile}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPickFile();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) onDropFile(file);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "32px 24px 28px",
                    border: `1.5px dashed ${YELLOW}`,
                    borderRadius: 14,
                    background: dragActive ? YELLOW_TINT : YELLOW_LIGHT,
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: YELLOW_TILE,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Upload size={20} color={TEXT} aria-hidden="true" />
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>
                    Tarik &amp; lepas file di sini
                  </span>
                  <span style={{ fontSize: 13, color: CAPTION }}>
                    Format yang didukung: CSV atau Excel (.xlsx)
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      // Dropzone juga memicu picker → cegah klik ganda.
                      e.stopPropagation();
                      onPickFile();
                    }}
                    style={{
                      ...secondaryBtn,
                      marginTop: 8,
                      height: 36,
                      padding: "0 14px",
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = YELLOW_TINT;
                      e.currentTarget.style.borderColor = YELLOW;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#FFFFFF";
                      e.currentTarget.style.borderColor = INPUT_BORDER;
                    }}
                  >
                    Pilih File
                  </button>
                </div>

                {/* Unduh template */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={onDownloadTemplate}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      color: TEXT,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textDecorationColor: YELLOW,
                      textDecorationThickness: 2,
                      textUnderlineOffset: 3,
                      transition: "text-decoration-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = TEXT)}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = YELLOW)}
                  >
                    <Download size={14} aria-hidden="true" />
                    Unduh Template CSV/Excel
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* State 2: file terpilih (atau error) */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 14px 14px 16px",
                    border: `1px solid ${BOX_BORDER}`,
                    borderRadius: 14,
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: error ? "#FEF2F2" : SUCCESS_TILE,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {error ? (
                      <AlertCircle size={20} color={DANGER} aria-hidden="true" />
                    ) : (
                      <FileText size={20} color={SUCCESS} aria-hidden="true" />
                    )}
                  </span>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <span
                      title={fileName}
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: TEXT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fileName}
                    </span>
                    {error ? (
                      <span style={{ fontSize: 13, color: DANGER }}>{error}</span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 13,
                          color: CAPTION,
                        }}
                      >
                        <CheckCircle2 size={14} color={SUCCESS} aria-hidden="true" />
                        <span style={{ color: SUCCESS }}>File siap diimpor</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          <strong style={{ fontFamily: MONO, fontWeight: 600, color: SECONDARY }}>
                            {rows.length}
                          </strong>{" "}
                          baris terdeteksi
                        </span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onPickFile}
                    style={{
                      ...secondaryBtn,
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 8,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = YELLOW_TINT;
                      e.currentTarget.style.borderColor = YELLOW;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#FFFFFF";
                      e.currentTarget.style.borderColor = INPUT_BORDER;
                    }}
                  >
                    Ganti File
                  </button>
                  <button
                    type="button"
                    aria-label="Hapus file"
                    onClick={onRemoveFile}
                    style={{
                      width: 32,
                      height: 32,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      background: "transparent",
                      color: FAINT,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                  Lanjutkan untuk memeriksa &amp; memetakan kolom sebelum import.
                </p>
              </>
            )}
          </div>
        ) : (
          /* State 3: mapping & preview */
          <div
            key="mapping"
            className="content-fade-in"
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "340px minmax(0, 1fr)",
              gap: 24,
              padding: "18px 24px 22px",
            }}
          >
            {/* Kiri: field mapping */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>
                  Field Mapping
                </h4>
                <span style={{ fontSize: 12, color: CAPTION }}>
                  Field test case ← kolom di file
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingRight: 4,
                }}
              >
                {FIELD_ROWS.map((f) => {
                  const inputId = `import-map-${f.field}`;
                  const selectedHeader = headerForField(f.field);
                  const focused = focusedField === f.field;
                  return (
                    <div
                      key={f.field}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "128px minmax(0, 1fr)",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <label
                        htmlFor={inputId}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontFamily: MONO,
                          fontSize: 12,
                          fontWeight: 500,
                          color: SECONDARY,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={f.label}
                      >
                        {f.label}
                        {f.required && (
                          <span aria-hidden="true" style={{ color: DANGER, fontWeight: 700 }}>
                            *
                          </span>
                        )}
                      </label>
                      <div style={{ position: "relative", minWidth: 0 }}>
                        <select
                          id={inputId}
                          value={selectedHeader}
                          aria-label={`Kolom file untuk ${f.label}`}
                          onChange={(e) => setFieldSource(f.field, e.target.value)}
                          onFocus={() => setFocusedField(f.field)}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            width: "100%",
                            height: 36,
                            boxSizing: "border-box",
                            padding: "0 30px 0 10px",
                            border: `1px solid ${focused ? YELLOW : INPUT_BORDER}`,
                            borderRadius: 9,
                            background: "#FFFFFF",
                            fontSize: 13,
                            color: selectedHeader ? TEXT : FAINT,
                            appearance: "none",
                            outline: "none",
                            boxShadow: focused ? `0 0 0 3px ${YELLOW_TILE}` : "none",
                            cursor: "pointer",
                            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                          }}
                        >
                          <option value="">— Tidak dipetakan —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={13}
                          color={CAPTION}
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            right: 10,
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Kanan: data preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>
                  Data Preview
                </h4>
                <span style={{ fontSize: 12, color: CAPTION }}>
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: SECONDARY }}>
                    {rows.length}
                  </span>{" "}
                  baris
                </span>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  border: `1px solid ${BOX_BORDER}`,
                  borderRadius: 12,
                }}
              >
                <table
                  style={{
                    minWidth: 900,
                    width: "100%",
                    tableLayout: "fixed",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 200 }} />
                  </colgroup>
                  <thead>
                    <tr
                      style={{
                        height: 38,
                        background: HEAD_BG,
                        borderBottom: `1px solid ${LINE}`,
                      }}
                    >
                      {[
                        { label: "#", align: "right" as const },
                        { label: "Section", align: "left" as const },
                        { label: "Title", align: "left" as const },
                        { label: "Pre-conditions", align: "left" as const },
                        { label: "Step Action", align: "left" as const },
                        { label: "Expected Result", align: "left" as const },
                      ].map((c) => (
                        <th
                          key={c.label}
                          scope="col"
                          style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            background: HEAD_BG,
                            padding: "0 12px",
                            fontSize: 12,
                            fontWeight: 500,
                            color: CAPTION,
                            textAlign: c.align,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const invalid = !(titleHeader ? (r[titleHeader] ?? "").trim() : "");
                      const cell = (value: string) => (
                        <td
                          style={{
                            height: 40,
                            padding: "0 12px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: MUTED,
                            borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`,
                          }}
                          title={value}
                        >
                          {value || "—"}
                        </td>
                      );
                      return (
                        <tr key={i} style={{ background: invalid ? "#FFFBFB" : "transparent" }}>
                          <td
                            style={{
                              height: 40,
                              padding: "0 12px",
                              textAlign: "right",
                              fontFamily: MONO,
                              fontSize: 12,
                              color: FAINT,
                              borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`,
                            }}
                          >
                            {i + 1}
                          </td>
                          {cell(cellValue(r, "section"))}
                          <td
                            style={{
                              height: 40,
                              padding: "0 12px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              fontWeight: 500,
                              color: invalid ? DANGER : TEXT,
                              borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`,
                            }}
                            title={cellValue(r, "title")}
                          >
                            {cellValue(r, "title") || "—"}
                          </td>
                          {cell(cellValue(r, "precondition"))}
                          {cell(cellValue(r, "steps"))}
                          {cell(cellValue(r, "expectedResult"))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Divider inset */}
        <div style={{ height: 1, margin: "0 24px", background: LINE, flexShrink: 0 }} />

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            padding: "14px 24px",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, color: CAPTION }}>
            {step === 2 ? (
              <>
                <span style={{ color: DANGER }}>*</span> wajib dipetakan
              </>
            ) : null}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                ...secondaryBtn,
                height: 40,
                padding: "0 16px",
                borderRadius: 10,
                fontSize: 14,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = YELLOW_TINT;
                e.currentTarget.style.borderColor = YELLOW;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FFFFFF";
                e.currentTarget.style.borderColor = INPUT_BORDER;
              }}
            >
              Batal
            </button>

            {step === 1 ? (
              <button
                type="button"
                onClick={onProceedToPreview}
                disabled={!canProceed}
                style={primaryBtn(canProceed)}
                onMouseEnter={(e) => {
                  if (canProceed) e.currentTarget.style.background = "#F0B53D";
                }}
                onMouseLeave={(e) => {
                  if (canProceed) e.currentTarget.style.background = YELLOW;
                }}
              >
                Lanjut ke Preview
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!canImport || starting}
                style={primaryBtn(canImport && !starting)}
                onMouseEnter={(e) => {
                  if (canImport && !starting) e.currentTarget.style.background = "#F0B53D";
                }}
                onMouseLeave={(e) => {
                  if (canImport && !starting) e.currentTarget.style.background = YELLOW;
                }}
              >
                Impor {validCount} Test Case
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
