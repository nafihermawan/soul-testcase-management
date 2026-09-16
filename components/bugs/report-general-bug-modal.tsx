"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileVideo, Image as ImageIcon, X } from "lucide-react";
import { createBug } from "@/lib/actions/automation-bugs";
import { CustomSelect } from "@/components/ui/custom-select";
import { uploadAttachmentFile } from "@/lib/client/attachments";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/limits";
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
  const [suiteId, setSuiteId] = useState("");
  const [suites, setSuites] = useState<SuiteOption[]>([]);
  const [suitesLoading, setSuitesLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError("Judul bug wajib diisi.");
      return;
    }
    // Setiap bug harus punya rujukan suite (project diturunkan dari suite).
    if (!suiteId) {
      setError("Suite / Module wajib dipilih.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await createBug({
      title: title.trim(),
      description: description.trim() || undefined,
      severity: severity || undefined,
      externalLink: externalLink.trim() || undefined,
      suiteId: suiteId || undefined,
    });
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
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #F1F5F9",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1E293B" }}>
              Laporkan Bug
            </h2>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "#64748B", lineHeight: 1.5 }}>
              Temuan bebas di luar eksekusi test case. Bug ini masuk kategori{" "}
              <strong>General Findings</strong>.
            </p>
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
            <label htmlFor="general-bug-title" style={labelStyle}>
              Bug Title <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <input
              id="general-bug-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              placeholder="Ringkasan singkat isu/bug yang ditemukan..."
              style={fieldStyle}
            />
          </div>

          {/* Severity + Suite / Module sejajar dalam satu baris grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="general-bug-severity" style={labelStyle}>
                Severity
              </label>
              <select
                id="general-bug-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                disabled={saving}
                style={{ ...fieldStyle, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={labelStyle}>
                Suite / Module <span style={{ color: "#E11D48" }}>*</span>
              </span>
              <CustomSelect
                ariaLabel="Suite / Module"
                searchable
                value={suiteId}
                placeholder={suitesLoading ? "Memuat suite…" : "Pilih Suite / Modul..."}
                onChange={setSuiteId}
                options={suites.map((s) => ({
                  value: s.id,
                  label: `${s.name} — ${s.projectName}`,
                  badge: s.platform ? PLATFORM_LABEL[s.platform] ?? s.platform : undefined,
                }))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="general-bug-desc" style={labelStyle}>
              Deskripsi &amp; Hasil Aktual
            </label>
            <textarea
              id="general-bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={4}
              placeholder="Jelaskan temuan, langkah reproduksi, dan dampaknya..."
              style={{ ...fieldStyle, height: "auto", padding: "0.5rem 0.75rem", resize: "vertical", lineHeight: 1.55 }}
            />
          </div>

          <div>
            <label htmlFor="general-bug-link" style={labelStyle}>
              Link Eksternal <span style={{ fontWeight: 500, textTransform: "none" }}>(opsional)</span>
            </label>
            <input
              id="general-bug-link"
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              disabled={saving}
              placeholder="https://jira… / https://github…"
              style={fieldStyle}
            />
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

          {error && <div style={{ fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>}
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
