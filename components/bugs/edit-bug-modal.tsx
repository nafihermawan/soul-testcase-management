"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { updateBug } from "@/lib/actions/automation-bugs";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { CustomSelect } from "@/components/ui/custom-select";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode } from "@/lib/format";
import { urlFormatError, normalizeUrl } from "@/lib/validation";
import { ENVIRONMENT_OPTIONS } from "@/lib/qa-metrics";
import type { AttachmentItem, BugEditableFields, BugRow, SuiteOption, SuitesPayload } from "@/types/api";

const SEVERITY_OPTIONS = [
  { value: "", label: "— Tidak ada —" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

/** Label platform project untuk badge di combobox Suite. */
const PLATFORM_LABEL: Record<string, string> = {
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#64748B",
  marginBottom: "0.3rem",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: "0.78rem",
  color: "#1E293B",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

/** Error validasi per field (ditampilkan tepat di bawah field terkait). */
type FieldErrors = {
  title?: string;
  suiteId?: string;
  environment?: string;
  description?: string;
  expectedResult?: string;
  externalLink?: string;
};

/**
 * Form edit bug — struktur field & aturan validasi diselaraskan dengan modal
 * "Laporkan Bug". Status sengaja tidak di sini (lewat baris tabel Bugs).
 */
export function EditBugModal({
  bug,
  canAttach,
  onClose,
  onSaved,
  onAttachmentsChange,
}: {
  bug: BugRow;
  /** Role QA — kalau false, kelola evidence jadi read-only. */
  canAttach: boolean;
  onClose: () => void;
  /** Dipanggil dengan nilai final setelah simpan sukses, untuk patch lokal. */
  onSaved: (patch: BugEditableFields) => void;
  /** Teruskan daftar evidence terbaru ke parent (update in-place, tanpa refetch). */
  onAttachmentsChange?: (items: AttachmentItem[]) => void;
}) {
  const [title, setTitle] = useState(bug.title);
  const [severity, setSeverity] = useState(bug.severity ?? "");
  const [environment, setEnvironment] = useState(bug.environment ?? "");
  const [suiteId, setSuiteId] = useState(bug.suite?.id ?? "");
  const [description, setDescription] = useState(bug.description ?? "");
  const [expectedResult, setExpectedResult] = useState(bug.expectedResult ?? "");
  const [externalLink, setExternalLink] = useState(bug.externalLink ?? "");
  const [suites, setSuites] = useState<SuiteOption[]>([]);
  const [suitesLoading, setSuitesLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Error sistem/server tampil sebagai toast kanan-atas, bukan banner di modal.
  const { toast, showToast, dismissToast } = useToast();

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

  // Opsi Suite / Module: daftar flat lintas project dari /api/suites.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/suites", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as SuitesPayload;
        if (!cancelled) setSuites(data.suites);
      } catch {
        if (!cancelled) showToast("Gagal memuat daftar suite.", "error", 5000);
      } finally {
        if (!cancelled) setSuitesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const clearFieldError = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const submit = async () => {
    if (pending) return;
    const fieldErrs: FieldErrors = {};
    if (!title.trim()) fieldErrs.title = "Judul bug wajib diisi.";
    if (!environment) fieldErrs.environment = "Environment wajib dipilih.";
    if (!suiteId) fieldErrs.suiteId = "Suite / Module wajib dipilih.";
    if (!description.trim()) fieldErrs.description = "Deskripsi & Hasil Aktual wajib diisi.";
    if (!expectedResult.trim()) fieldErrs.expectedResult = "Expected Result wajib diisi.";
    // Link eksternal OPSIONAL; format hanya diperiksa bila diisi.
    const linkErr = urlFormatError(externalLink);
    if (linkErr) fieldErrs.externalLink = linkErr;
    setFieldErrors(fieldErrs);
    if (Object.keys(fieldErrs).length > 0) return;

    const selectedSuite = suites.find((s) => s.id === suiteId);
    const patch: BugEditableFields = {
      title: title.trim(),
      description: description.trim(),
      severity: severity.trim() || null,
      environment: environment.trim() || null,
      suiteId,
      // Objek suite dipakai parent untuk patch tampilan tanpa refetch.
      suite: selectedSuite
        ? { id: selectedSuite.id, name: selectedSuite.name }
        : bug.suite,
      expectedResult: expectedResult.trim(),
      // Auto-prefix https:// bila skema tidak diketik pengguna.
      externalLink: normalizeUrl(externalLink),
    };

    setPending(true);
    let res: Awaited<ReturnType<typeof updateBug>>;
    try {
      res = await updateBug({
        bugId: bug.id,
        title: patch.title,
        description: patch.description ?? undefined,
        severity: patch.severity ?? undefined,
        expectedResult: patch.expectedResult ?? undefined,
        externalLink: patch.externalLink ?? undefined,
        environment: patch.environment ?? null,
        suiteId: patch.suiteId ?? null,
      });
    } catch {
      // Server action gagal di level jaringan (offline / server tak terjangkau).
      setPending(false);
      showToast("Koneksi internet terputus. Periksa jaringan Anda.", "error", 5000);
      return;
    }
    setPending(false);
    if (res.field) {
      // Error validasi dari server -> tampilkan inline di field terkait.
      const field = res.field;
      const message = res.error ?? "Nilai tidak valid.";
      setFieldErrors((prev) => ({ ...prev, [field]: message }));
      return;
    }
    if (res.error) {
      // Error sistem/server -> toast kanan-atas, bukan banner di dalam modal.
      showToast(res.error, "error", 5000);
      return;
    }
    onSaved(patch);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Bug"
      onClick={() => {
        if (!pending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        // Di atas Bug Detail Modal (zIndex 300) karena dibuka dari sana.
        zIndex: 320,
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
          maxWidth: 560,
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
        {/* Toast error sistem/server — floating kanan-atas (portal ke body).
            Ditaruh di dalam kartu agar klik tombol tutupnya tidak
            membubbling ke overlay dan menutup modal. */}
        <Toast toast={toast} onDismiss={dismissToast} />

        {/* Header */}
        <div style={{ flexShrink: 0, padding: "1.25rem 1.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {/* ID bug — mono, regular, slate-600 */}
              <span
                style={{
                  color: "#475569",
                  fontWeight: 400,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {entityCode("BUG", bug.id)}
              </span>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "1rem", fontWeight: 700, color: "#1E293B" }}>
                Edit Bug
              </h2>
            </div>
            <button
              type="button"
              aria-label="Tutup"
              onClick={onClose}
              disabled={pending}
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
                cursor: pending ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Divider tipis di bawah title — inset mengikuti padding container. */}
          <div style={{ borderTop: "1px solid #F1F5F9", marginTop: "0.75rem" }} />
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            padding: "1rem 1.5rem 1.25rem",
          }}
        >
          {/* 1. Judul Bug (mandatory) */}
          <div>
            <label htmlFor="edit-bug-title" style={labelStyle}>
              Judul Bug <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <input
              id="edit-bug-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearFieldError("title");
              }}
              disabled={pending}
              placeholder="Contoh: Tombol simpan tidak merespons"
              style={fieldErrors.title ? { ...fieldStyle, borderColor: "#EF4444" } : fieldStyle}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          {/* 2. Severity (opsional) + Environment (mandatory) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="edit-bug-severity" style={labelStyle}>
                Severity
              </label>
              <Select
                id="edit-bug-severity"
                value={severity}
                ariaLabel="Severity"
                disabled={pending}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="edit-bug-environment" style={labelStyle}>
                Environment <span style={{ color: "#E11D48" }}>*</span>
              </label>
              <Select
                id="edit-bug-environment"
                value={environment}
                ariaLabel="Environment"
                disabled={pending}
                onChange={(e) => {
                  setEnvironment(e.target.value);
                  clearFieldError("environment");
                }}
                style={fieldErrors.environment ? { borderColor: "#EF4444" } : undefined}
              >
                <option value="">Pilih Environment</option>
                {ENVIRONMENT_OPTIONS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </Select>
              <FieldError message={fieldErrors.environment} />
            </div>
          </div>

          {/* 3. Suite / Module (mandatory) */}
          <div>
            <span style={labelStyle}>
              Suite / Module <span style={{ color: "#E11D48" }}>*</span>
            </span>
            <CustomSelect
              ariaLabel="Suite / Module"
              searchable
              badgePosition="left"
              invalid={!!fieldErrors.suiteId}
              value={suiteId}
              placeholder={suitesLoading ? "Memuat suite…" : "Pilih suite / modul..."}
              onChange={(next) => {
                setSuiteId(next);
                clearFieldError("suiteId");
              }}
              options={suites.map((s) => ({
                value: s.id,
                label: `${s.projectName} — ${s.name}`,
                badge: s.platform ? PLATFORM_LABEL[s.platform] ?? s.platform : undefined,
              }))}
            />
            <FieldError message={fieldErrors.suiteId} />
          </div>

          {/* 4. Deskripsi & Hasil Aktual (mandatory) */}
          <div>
            <label htmlFor="edit-bug-description" style={labelStyle}>
              Deskripsi &amp; Hasil Aktual <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="edit-bug-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError("description");
              }}
              disabled={pending}
              rows={5}
              placeholder="Jelaskan langkah reproduksi dan dampaknya..."
              style={{
                ...fieldStyle,
                resize: "vertical",
                lineHeight: 1.55,
                ...(fieldErrors.description ? { borderColor: "#EF4444" } : {}),
              }}
            />
            <FieldError message={fieldErrors.description} />
          </div>

          {/* 5. Expected Result (mandatory) */}
          <div>
            <label htmlFor="edit-bug-expected" style={labelStyle}>
              Expected Result <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="edit-bug-expected"
              value={expectedResult}
              onChange={(e) => {
                setExpectedResult(e.target.value);
                clearFieldError("expectedResult");
              }}
              disabled={pending}
              rows={3}
              placeholder="Jelaskan hasil yang diharapkan..."
              style={{
                ...fieldStyle,
                resize: "vertical",
                lineHeight: 1.55,
                ...(fieldErrors.expectedResult ? { borderColor: "#EF4444" } : {}),
              }}
            />
            <FieldError message={fieldErrors.expectedResult} />
          </div>

          {/* 6. Link Eksternal (opsional) */}
          <div>
            <label htmlFor="edit-bug-link" style={labelStyle}>
              Link Eksternal
            </label>
            <input
              id="edit-bug-link"
              type="url"
              value={externalLink}
              onChange={(e) => {
                setExternalLink(e.target.value);
                clearFieldError("externalLink");
              }}
              disabled={pending}
              placeholder="Masukkan URL (Jira, GitHub, Drive, dll.)"
              style={fieldErrors.externalLink ? { ...fieldStyle, borderColor: "#EF4444" } : fieldStyle}
            />
            <FieldError message={fieldErrors.externalLink} />
          </div>

          {/* 7. Evidence (Lampiran) — opsional */}
          <div>
            <label style={labelStyle}>Evidence (Lampiran)</label>
            <AttachmentsPanel
              owner={{ bugId: bug.id }}
              attachments={bug.attachments}
              canEdit={canAttach}
              onChange={onAttachmentsChange}
              compact
            />
          </div>
        </div>

        {/* Divider inset + footer */}
        <div style={{ flexShrink: 0, borderTop: "1px solid #F1F5F9", margin: "0 1.5rem" }} />
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "1rem 1.5rem",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              background: "#fff",
              color: "#475569",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F1F5F9";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              minWidth: 140,
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: 8,
              background: "#FFC348",
              color: "#0F172A",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            {pending ? (
              <>
                <Spinner size={13} /> Menyimpan…
              </>
            ) : (
              "Simpan Perubahan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
