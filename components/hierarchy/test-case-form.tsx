"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ListTextarea } from "@/components/ui/list-textarea";
import { Select } from "@/components/ui/select";
import { btnYellow, inputStyle, type TestCase } from "./test-cases-shared";

export function TestCaseForm({
  title,
  suiteName,
  suiteId,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  suiteName?: string;
  suiteId: string;
  initial?: TestCase;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; scenario?: string }>({});
  const [isPending, setIsPending] = useState(false);
  const [titleValue, setTitleValue] = useState(initial?.title ?? "");
  const [scenarioValue, setScenarioValue] = useState(initial?.scenario ?? "");
  // Priority & status ikut ditahan sebagai state: dropdown sistem bukan elemen
  // form natif, jadi nilainya tidak muncul di FormData dan harus di-set manual
  // (pola yang sama dengan title/scenario di bawah).
  const [priorityValue, setPriorityValue] = useState(initial?.priority ?? "MEDIUM");
  const [statusValue, setStatusValue] = useState(initial?.status ?? "DRAFT");
  // Type sengaja TIDAK diberi default: kosong = "belum dipilih" (tersimpan null).
  const [typeValue, setTypeValue] = useState<"POSITIVE" | "NEGATIVE" | "">(initial?.type ?? "");
  // Field auto-list (- / * / 1.) ditahan sebagai state supaya penulisan ulang
  // marker bisa langsung terlihat; FormData tetap membaca nilai terbaru karena
  // textarea-nya controlled dan tetap punya atribut name.
  const [preconditionValue, setPreconditionValue] = useState(initial?.precondition ?? "");
  const [stepsValue, setStepsValue] = useState(initial?.steps ?? "");
  const [testDataValue, setTestDataValue] = useState(initial?.testData ?? "");
  const [expectedResultValue, setExpectedResultValue] = useState(initial?.expectedResult ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = titleValue.trim();
    const scenario = scenarioValue.trim();

    setFieldErrors({});
    setError(null);

    const errors: { title?: string; scenario?: string } = {};
    if (!title) errors.title = "Judul test case wajib diisi.";
    if (!scenario) errors.scenario = "Detail skenario wajib diisi.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setIsPending(true);
    try {
      formData.set("title", title);
      formData.set("scenario", scenario);
      formData.set("suiteId", suiteId);
      formData.set("priority", priorityValue);
      formData.set("status", statusValue);
      formData.set("type", typeValue);
      const res = await onSubmit(formData);
      if (res?.error) setError(res.error);
      else if (res?.success) onCancel();
    } finally {
      setIsPending(false);
    }
  };

  const errorBorder: React.CSSProperties = {
    border: "1px solid #EF4444",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          // Diperlebar (max-w-5xl) agar layout 2 kolom muat tanpa scroll vertikal.
          maxWidth: 1024,
          // Tinggi tetap supaya kedua kolom punya tinggi definit → batas bawah
          // field terakhir kiri & kanan jatuh di garis yang sama.
          height: "85vh",
          maxHeight: "85vh",
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
        {/* Divider header sengaja di-inset selebar padding modal (tidak menyentuh
            tepi modal), mengikuti pola header modal standar. */}
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
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>{title}</h3>
              {suiteName && (
                <p
                  style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.15rem 0 0" }}
                >
                  Suite: <strong style={{ fontWeight: 600 }}>{suiteName}</strong>
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Tutup"
              onClick={onCancel}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Satu-satunya area scroll modal; footer di bawahnya tetap sticky. */}
          <div
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            {/* Layout 2 kolom (50:50), mengisi tinggi sampai divider footer */}
            <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: "1.25rem" }}>
              {/* Kolom kiri — General Information */}
              <div
                className="tc-form-col"
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                  }}
                >
                  General Information
                </div>
                {/* Title — field pertama supaya user mengisi judul lebih dulu */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <label
                    style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                  >
                    Title <span style={{ color: "#F43F5E" }}>*</span>
                  </label>
                  <input
                    ref={titleRef}
                    name="title"
                    placeholder="Judul test case"
                    value={titleValue}
                    required
                    style={fieldErrors.title ? { ...inputStyle, ...errorBorder } : inputStyle}
                    onChange={(e) => {
                      setTitleValue(e.target.value);
                      if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
                    }}
                  />
                  {fieldErrors.title && (
                    <p style={{ color: "#EF4444", fontSize: "0.8rem", margin: 0 }}>
                      {fieldErrors.title}
                    </p>
                  )}
                </div>

                {/* Row 1: TC ID | Type */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  TC ID (otomatis, bisa diubah)
                </label>
                <input
                  name="tcId"
                  placeholder="Auto-generate"
                  defaultValue={initial?.tcId ?? ""}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Type
                </label>
                <Select
                  value={typeValue}
                  ariaLabel="Type"
                  onChange={(e) => setTypeValue(e.target.value as "POSITIVE" | "NEGATIVE" | "")}
                >
                  <option value="">— Belum dipilih —</option>
                  <option value="POSITIVE">Positive</option>
                  <option value="NEGATIVE">Negative</option>
                </Select>
              </div>
            </div>

            {/* Row 2: Priority | Status */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Priority
                </label>
                <Select
                  value={priorityValue}
                  ariaLabel="Priority"
                  onChange={(e) => setPriorityValue(e.target.value as TestCase["priority"])}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </Select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Status
                </label>
                <Select
                  value={statusValue}
                  ariaLabel="Status"
                  onChange={(e) => setStatusValue(e.target.value as TestCase["status"])}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DEPRECATED">Deprecated</option>
                </Select>
              </div>
            </div>

            {/* Row 3: Detail Skenario — field terakhir, mengisi sisa tinggi kolom */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
                flex: "1 1 auto",
                minHeight: 0,
              }}
            >
              <label
                style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
              >
                Detail Skenario <span style={{ color: "#F43F5E" }}>*</span>
              </label>
              <ListTextarea
                name="scenario"
                rows={2}
                fill
                ariaLabel="Detail Skenario"
                style={{ flex: "1 1 auto", minHeight: 0 }}
                hasError={Boolean(fieldErrors.scenario)}
                value={scenarioValue}
                onChange={(v) => {
                  setScenarioValue(v);
                  if (fieldErrors.scenario)
                    setFieldErrors((prev) => ({ ...prev, scenario: undefined }));
                }}
              />
              {fieldErrors.scenario && (
                <p style={{ color: "#EF4444", fontSize: "0.8rem", margin: 0 }}>
                  {fieldErrors.scenario}
                </p>
              )}
            </div>
              </div>

              {/* Kolom kanan — Execution Details (area fokus utama) */}
              <div
                className="tc-form-col"
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                  }}
                >
                  Execution Details
                </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Precondition
                </label>
                <ListTextarea
                  name="precondition"
                  rows={2}
                  ariaLabel="Precondition"
                  value={preconditionValue}
                  onChange={setPreconditionValue}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Steps
                </label>
                <ListTextarea
                  name="steps"
                  rows={4}
                  ariaLabel="Steps"
                  value={stepsValue}
                  onChange={setStepsValue}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Test Data
                </label>
                <ListTextarea
                  name="testData"
                  rows={2}
                  ariaLabel="Test Data"
                  value={testDataValue}
                  onChange={setTestDataValue}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  flex: "1 1 auto",
                  minHeight: 0,
                }}
              >
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Expected Result
                </label>
                <ListTextarea
                  name="expectedResult"
                  rows={3}
                  fill
                  ariaLabel="Expected Result"
                  style={{ flex: "1 1 auto", minHeight: 0 }}
                  value={expectedResultValue}
                  onChange={setExpectedResultValue}
                />
              </div>
              </div>
            </div>

            {error && (
              <p style={{ flexShrink: 0, color: "#b91c1c", fontSize: "0.85rem", margin: 0 }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer sticky: di luar area scroll supaya garis & tombol tidak
              ikut tergeser saat form di-scroll. Garisnya di-inset selebar
              padding form (sejajar konten di atasnya), tidak menembus tepi modal. */}
          <div style={{ flexShrink: 0, padding: "0 1.25rem 1rem", background: "#fff" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button type="submit" disabled={isPending} style={{ ...btnYellow, fontWeight: 600 }}>
                {isPending ? "Menyimpan..." : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
