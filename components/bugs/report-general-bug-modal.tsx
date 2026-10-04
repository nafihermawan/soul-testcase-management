"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileVideo, Image as ImageIcon, Info, X } from "lucide-react";
import { createBug } from "@/lib/actions/automation-bugs";
import { CustomSelect } from "@/components/ui/custom-select";
import { Select } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field-error";
import { uploadAttachmentFile } from "@/lib/client/attachments";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/limits";
import { ENVIRONMENT_OPTIONS } from "@/lib/qa-metrics";
import { urlFormatError, normalizeUrl } from "@/lib/validation";
import type { BugDetailPayload, BugRow, SuiteOption, SuitesPayload } from "@/types/api";

const MAX_MB = Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024);

const SEVERITIES = [
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

/** File yang ditahan di klien sampai bug-nya jadi (attachment wajib punya owner). */
type StagedFile = { id: string; file: File; /** Object URL untuk thumbnail gambar. */ preview: string | null };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.3rem",
};

/** Field teks/select: tinggi seragam 36px sesuai control bar. */
const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 0.75rem",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: "0.75rem",
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
 * Auto-format list di textarea (tanpa tombol):
 * - mengetik "- " atau "* " di awal baris -> otomatis jadi bullet "• ";
 * - mengetik "1. " sudah otomatis jadi penanda numbered;
 * - Enter di baris list -> lanjut bullet / nomor berikutnya;
 * - Enter di baris list KOSONG -> keluar dari mode list (marker dibuang).
 */
function handleListKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (v: string) => void
): void {
  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  // 1) Konversi "- " / "* " di awal baris menjadi bullet "• ".
  if (e.key === " " && start === end) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const before = value.slice(lineStart, start);
    if (before === "-" || before === "*") {
      e.preventDefault();
      const next = value.slice(0, lineStart) + "• " + value.slice(end);
      setValue(next);
      const caret = lineStart + 2;
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      return;
    }
  }

  // 2) Enter pada baris list: lanjutkan, atau keluar bila barisnya kosong.
  if (e.key === "Enter" && !e.shiftKey && start === end) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const line = value.slice(lineStart, start);
    const bullet = /^• /.test(line);
    const numbered = line.match(/^(\d+)\. /);
    if (!bullet && !numbered) return;

    e.preventDefault();
    const content = line.replace(/^(• |\d+\. )/, "");
    if (content.trim() === "") {
      // Baris list kosong -> hentikan mode list: buang marker, sisakan baris baru.
      const next = value.slice(0, lineStart) + value.slice(start);
      setValue(next);
      const caret = lineStart;
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      return;
    }
    const marker = bullet ? "• " : `${Number(numbered![1]) + 1}. `;
    const insert = "\n" + marker;
    const next = value.slice(0, start) + insert + value.slice(end);
    setValue(next);
    const caret = start + insert.length;
    requestAnimationFrame(() => el.setSelectionRange(caret, caret));
  }
}

/**
 * Form bug ad-hoc: mencatat temuan bebas yang tidak berasal dari eksekusi TC.
 * Sengaja TIDAK mengirim testCaseId/testRunResultId, sehingga bug ini otomatis
 * masuk kategori GENERAL_FINDING.
 */
export function ReportGeneralBugModal({
  canAttach,
  onClose,
  onCreated,
}: {
  /** Role QA — kalau false, section Upload Evidence disembunyikan (server action-nya akan redirect). */
  canAttach: boolean;
  onClose: () => void;
  /**
   * `bug` null = bug sudah dibuat di server tapi barisnya gagal diambil,
   * sehingga daftar lokal tidak bisa ditambal (parent sebaiknya minta refresh).
   * `warning` diisi bila evidence gagal diunggah setelah bug-nya jadi.
   */
  onCreated: (bug: BugRow | null, warning?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [environment, setEnvironment] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [suites, setSuites] = useState<SuiteOption[]>([]);
  const [suitesLoading, setSuitesLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Dipakai untuk merevoke object URL saat modal ditutup.
  const filesRef = useRef<StagedFile[]>([]);
  filesRef.current = files;

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const accepted: StagedFile[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        setError(`"${file.name}": hanya file gambar atau video yang diperbolehkan.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}": ukuran melebihi ${MAX_MB} MB.`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }
    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  useEffect(
    () => () => {
      filesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    },
    []
  );

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
        if (!cancelled) setError("Gagal memuat daftar suite.");
      } finally {
        if (!cancelled) setSuitesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const clearFieldError = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const save = async () => {
    if (saving) return;
    const fieldErrs: FieldErrors = {};
    if (!title.trim()) fieldErrs.title = "Judul bug wajib diisi.";
    // Setiap bug harus punya rujukan suite (project diturunkan dari suite).
    if (!suiteId) fieldErrs.suiteId = "Suite / Module wajib dipilih.";
    if (!environment) fieldErrs.environment = "Environment wajib dipilih.";
    if (!description.trim()) fieldErrs.description = "Deskripsi & Hasil Aktual wajib diisi.";
    if (!expectedResult.trim()) fieldErrs.expectedResult = "Expected Result wajib diisi.";
    // Link eksternal OPSIONAL; format hanya diperiksa bila diisi.
    const linkErr = urlFormatError(externalLink);
    if (linkErr) fieldErrs.externalLink = linkErr;
    setFieldErrors(fieldErrs);
    if (Object.keys(fieldErrs).length > 0) {
      setError(null);
      return;
    }
    setError(null);
    setSaving(true);
    let res: Awaited<ReturnType<typeof createBug>>;
    try {
      res = await createBug({
        title: title.trim(),
        description: description.trim() || undefined,
        expectedResult: expectedResult.trim() || undefined,
        severity: severity || undefined,
        // Auto-prefix https:// bila skema tidak diketik pengguna.
        externalLink: normalizeUrl(externalLink) || undefined,
        suiteId: suiteId || undefined,
        environment,
      });
    } catch {
      // Server action gagal di level jaringan (offline / server tak terjangkau).
      setSaving(false);
      setError("Koneksi internet terputus. Periksa jaringan Anda.");
      return;
    }
    if (res.field) {
      // Error validasi dari server -> inline di field terkait.
      const field = res.field;
      const message = res.error ?? "Nilai tidak valid.";
      setSaving(false);
      setError(null);
      setFieldErrors((prev) => ({ ...prev, [field]: message }));
      return;
    }
    if (res.error || !res.bugId) {
      setSaving(false);
      setError(res.error ?? "Gagal membuat bug.");
      return; // bug belum jadi -> aman kalau user submit ulang
    }

    /**
     * Sejak titik ini bug SUDAH ada. Apa pun yang gagal setelahnya tidak boleh
     * membuat user menekan submit lagi (akan jadi bug duplikat), jadi kegagalan
     * upload evidence dilaporkan sebagai peringatan lalu modal tetap ditutup.
     */
    let warning: string | undefined;
    if (files.length > 0) {
      setUploadingEvidence(true);
      const failed: string[] = [];
      for (const staged of files) {
        const up = await uploadAttachmentFile(staged.file, { bugId: res.bugId });
        if (!up.ok) failed.push(staged.file.name);
      }
      setUploadingEvidence(false);
      if (failed.length > 0) {
        warning = `Bug tersimpan, tapi ${failed.length} evidence gagal diunggah (${failed.join(", ")}). Tambahkan lewat detail bug.`;
      }
    }

    // Ambil bentuk lengkap baris bug (termasuk createdBy + suite + project)
    // supaya daftar bisa ditambah di tempat tanpa refetch halaman.
    let created: BugRow | null = null;
    try {
      const detail = await fetch(`/api/bugs/${res.bugId}`, { cache: "no-store" });
      if (detail.ok) {
        const data = (await detail.json()) as BugDetailPayload;
        created = data.bug;
      }
    } catch {
      created = null;
    }
    setSaving(false);
    onCreated(created, warning);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Laporkan Bug"
      onClick={() => {
        if (!saving) onClose();
      }}
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
          maxWidth: 512,
          // Header & footer tetap di tempat; hanya body yang scroll (flex:1).
          maxHeight: "85vh",
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
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem 0.9rem",
          }}
        >
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1E293B" }}>
              Laporkan Bug
            </h2>
            {/* Penjelasan kategori dipindah ke tooltip info di samping judul. */}
            <span className="bug-info-tip" tabIndex={0} aria-label="Info kategori bug">
              <Info size={15} />
              <span className="bug-info-tip__bubble" role="tooltip">
                Temuan bebas di luar eksekusi test case. Bug ini masuk kategori{" "}
                <strong>General Findings</strong>.
              </span>
            </span>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={saving}
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
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider inset — sejajar dengan padding konten form, bukan full-bleed. */}
        <div style={{ height: 1, background: "#F1F5F9", margin: "0 1.5rem", flexShrink: 0 }} />

        {/* Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div>
            {/* Error umum (server / evidence) tampil di atas body, bukan di dasar
                modal, supaya tidak tenggelam di area scroll bawah. */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "0.6rem 0.75rem",
                  borderRadius: 8,
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#B91C1C",
                  fontSize: "0.75rem",
                  lineHeight: 1.5,
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}
            <label htmlFor="general-bug-title" style={labelStyle}>
              Bug Title <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <input
              id="general-bug-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearFieldError("title");
              }}
              disabled={saving}
              placeholder="Contoh: Tombol simpan tidak merespons"
              style={fieldErrors.title ? { ...fieldStyle, borderColor: "#EF4444" } : fieldStyle}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          {/* Severity + Environment sejajar dalam satu baris grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="general-bug-severity" style={labelStyle}>
                Severity
              </label>
              <Select
                id="general-bug-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                disabled={saving}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="general-bug-environment" style={labelStyle}>
                Environment <span style={{ color: "#E11D48" }}>*</span>
              </label>
              <Select
                id="general-bug-environment"
                value={environment}
                onChange={(e) => {
                  setEnvironment(e.target.value);
                  clearFieldError("environment");
                }}
                disabled={saving}
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
                // Urutan: [Badge Platform] Project — Suite.
                label: `${s.projectName} — ${s.name}`,
                badge: s.platform ? PLATFORM_LABEL[s.platform] ?? s.platform : undefined,
              }))}
            />
            <FieldError message={fieldErrors.suiteId} />
          </div>

          <div>
            <label htmlFor="general-bug-desc" style={labelStyle}>
              Deskripsi &amp; Hasil Aktual <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="general-bug-desc"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearFieldError("description");
              }}
              onKeyDown={(e) => handleListKeyDown(e, description, setDescription)}
              disabled={saving}
              rows={4}
              placeholder="Jelaskan langkah reproduksi dan dampaknya..."
              style={{
                ...fieldStyle,
                height: "auto",
                padding: "0.5rem 0.75rem",
                resize: "vertical",
                lineHeight: 1.55,
                ...(fieldErrors.description ? { borderColor: "#EF4444" } : {}),
              }}
            />
            <FieldError message={fieldErrors.description} />
          </div>

          <div>
            <label htmlFor="general-bug-expected" style={labelStyle}>
              Expected Result <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="general-bug-expected"
              value={expectedResult}
              onChange={(e) => {
                setExpectedResult(e.target.value);
                clearFieldError("expectedResult");
              }}
              onKeyDown={(e) => handleListKeyDown(e, expectedResult, setExpectedResult)}
              disabled={saving}
              rows={3}
              placeholder="Jelaskan hasil yang diharapkan..."
              style={{
                ...fieldStyle,
                height: "auto",
                padding: "0.5rem 0.75rem",
                resize: "vertical",
                lineHeight: 1.55,
                ...(fieldErrors.expectedResult ? { borderColor: "#EF4444" } : {}),
              }}
            />
            <FieldError message={fieldErrors.expectedResult} />
          </div>

          <div>
            <label htmlFor="general-bug-link" style={labelStyle}>
              Link Eksternal
            </label>
            <input
              id="general-bug-link"
              type="url"
              value={externalLink}
              onChange={(e) => {
                setExternalLink(e.target.value);
                clearFieldError("externalLink");
              }}
              disabled={saving}
              placeholder="Masukkan URL (Jira, GitHub, Drive, dll.)"
              style={fieldErrors.externalLink ? { ...fieldStyle, borderColor: "#EF4444" } : fieldStyle}
            />
            <FieldError message={fieldErrors.externalLink} />
          </div>

          {/* Upload Evidence — file ditahan dulu, diunggah setelah bug-nya dibuat.
              Attachment wajib punya owner, dan bug-nya belum ada saat form ini diisi.
              Hanya untuk QA: presign/confirm butuh role QA. */}
          {canAttach && (
          <div>
            <span style={labelStyle}>Upload Evidence</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!saving) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!saving) addFiles(e.dataTransfer.files);
              }}
              onClick={() => {
                if (!saving) inputRef.current?.click();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.25rem",
                padding: "1rem",
                borderRadius: 12,
                border: `1px dashed ${dragging ? "#FFC348" : "#CBD5E1"}`,
                background: dragging ? "#FFFBEB" : "#F8FAFC",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "border-color 0.15s ease, background-color 0.15s ease",
              }}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
              <ImageIcon size={20} color="#94A3B8" />
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569" }}>
                Tarik &amp; lepas file di sini, atau klik untuk memilih
              </div>
              <div style={{ fontSize: "0.68rem", color: "#94A3B8" }}>
                Gambar (JPG/PNG) atau video (MP4) · maks {MAX_MB} MB per file
              </div>
            </div>

            {files.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {files.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      position: "relative",
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        height: 62,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#F1F5F9",
                      }}
                    >
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.preview}
                          alt={f.file.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <FileVideo size={20} color="#64748B" />
                      )}
                    </div>
                    <div
                      title={f.file.name}
                      style={{
                        padding: "0.2rem 0.35rem",
                        fontSize: "0.62rem",
                        color: "#64748B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.file.name}
                    </div>
                    {!saving && (
                      <button
                        type="button"
                        aria-label={`Hapus ${f.file.name}`}
                        onClick={() => removeFile(f.id)}
                        style={{
                          position: "absolute",
                          top: 3,
                          right: 3,
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          borderRadius: 999,
                          background: "rgba(15, 23, 42, 0.6)",
                          color: "#fff",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "#fff",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              height: 36,
              padding: "0 1rem",
              border: "none",
              borderRadius: 8,
              background: "transparent",
              color: "#475569",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              height: 36,
              padding: "0 1.25rem",
              border: "none",
              borderRadius: 8,
              background: "#FFC348",
              color: "#0F172A",
              fontSize: "0.75rem",
              fontWeight: 700,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              cursor: saving ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            {uploadingEvidence ? "Mengunggah evidence…" : saving ? "Menyimpan..." : "Laporkan Bug"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
