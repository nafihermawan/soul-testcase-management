"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Pencil, Search, Trash2, X } from "lucide-react";
import type { HierarchyActionState } from "@/lib/actions/hierarchy";
import { createProject, deleteProject, updateProject } from "@/lib/actions/hierarchy";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Select } from "@/components/ui/select";

type Project = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  platform: "MOBILE" | "WEB" | "HARDWARE" | "API" | null;
  docUrl: string | null;
  _count: { suites: number };
};

/** Auto-generate key: hilangkan vokal, spasi -> hyphen, buang karakter khusus. */
const generateProjectKey = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[aeiou]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, "-");
};

const platformOptions: { value: "MOBILE" | "WEB" | "HARDWARE" | "API"; label: string }[] = [
  { value: "MOBILE", label: "Mobile" },
  { value: "WEB", label: "Web" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "API", label: "API" },
];

/** Lebar kolom tabel Projects (grid): Nama | Key | Platform | Suites | Opsi. */
const PROJECT_COLS = "minmax(260px, 2.2fr) minmax(190px, 1.4fr) 150px 170px 64px";

/** Lebar minimum tabel — di bawah ini container yang menggeser mendatar. */
const PROJECT_MIN_W = 880;

/** Gaya seragam untuk header kolom. */
const COL_HEAD: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#64748B",
  whiteSpace: "nowrap",
};

/**
 * Tone badge platform (pill + dot). Tiga platform pertama sesuai spesifikasi;
 * API tidak disebut di sana, jadi memakai tone netral agar tetap konsisten.
 */
const PLATFORM_TONE: Record<string, { bg: string; color: string; dot: string }> = {
  WEB: { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  MOBILE: { bg: "#F5F3FF", color: "#6D28D9", dot: "#8B5CF6" },
  HARDWARE: { bg: "#ECFDF5", color: "#047857", dot: "#10B981" },
  API: { bg: "#F1F5F9", color: "#475569", dot: "#64748B" },
};

/** Font key project: JetBrains Mono bila tersedia, fallback ke mono sistem. */
const KEY_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

type PlatformTab = "ALL" | "WEB" | "MOBILE" | "HARDWARE";

/** Urutan & label tab filter platform di toolbar. */
const PLATFORM_TABS: { value: PlatformTab; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "WEB", label: "Web" },
  { value: "MOBILE", label: "Mobile" },
  { value: "HARDWARE", label: "Hardware" },
];

/** Siklus sort kolom Suites: default ↕ → desc ↓ → asc ↑. */
type SuitesSort = "default" | "desc" | "asc";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: "0.85rem",
  marginTop: "0.25rem",
};

function ProjectModal({
  title,
  initial,
  onClose,
}: {
  title: string;
  initial?: Project;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(!!initial?.code);
  const [platform, setPlatform] = useState<"MOBILE" | "WEB" | "HARDWARE" | "API" | "">(
    initial?.platform ?? ""
  );
  const [docUrl, setDocUrl] = useState(initial?.docUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Auto-generate key dari nama selama user belum mengubah key manual.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!codeTouched) {
      setCode(generateProjectKey(value));
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const save = async () => {
    setError(null);
    if (!name.trim() || !code.trim()) {
      setError("Nama dan kode wajib diisi.");
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("code", code);
    fd.set("description", description);
    fd.set("platform", platform);
    fd.set("docUrl", docUrl);
    if (initial) fd.set("id", initial.id);
    const res: HierarchyActionState = initial ? await updateProject(fd) : await createProject(fd);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    refresh();
    onClose();
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
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
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
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>{title}</h3>
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

        {/* Body */}
        <div
          style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}
        >
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Nama Project
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="mis. Mobile Application"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Key / Kode Project
            </label>
            <input
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value);
              }}
              placeholder="Auto-generate dari nama"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Platform
            </label>
            <Select
              value={platform}
              ariaLabel="Platform project"
              style={{ marginTop: "0.25rem", width: "100%" }}
              onChange={(e) => setPlatform(e.target.value as "MOBILE" | "WEB" | "HARDWARE" | "API" | "")}
            >
              <option value="">—</option>
              {platformOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Deskripsi
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi singkat mengenai project ini..."
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Documentation Link / Reference URL
            </label>
            <input
              type="url"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="https://notion.so/... (opsional)"
              style={fieldStyle}
            />
          </div>
          {error && <div style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</div>}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 5,
              border: "1px solid var(--border-strong)",
              background: "#fff",
              color: "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 5,
              border: "none",
              background: "#2563EB",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pending ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1D4ED8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2563EB")}
          >
            {pending ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Spinner size={13} /> Menyimpan...
              </span>
            ) : (
              "Simpan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ProjectsManager({
  projects,
  createOpen,
  onCreateHandled,
}: {
  projects: Project[];
  /** Sinyal dari tombol "+ Tambah Project" di card header. */
  createOpen: boolean;
  onCreateHandled: () => void;
}) {
  const refresh = useRefresh();
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; project: Project } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  /** Filter platform (segmented) + pencarian nama/key — keduanya di sisi klien. */
  const [tab, setTab] = useState<PlatformTab>("ALL");
  const [query, setQuery] = useState("");
  /** Sort kolom Suites; `default` = urutan dari server (tidak diubah). */
  const [sort, setSort] = useState<SuitesSort>("default");

  // Tombol tambah ada di card header → buka modal create lalu reset sinyal.
  useEffect(() => {
    if (!createOpen) return;
    setModal({ mode: "create" });
    onCreateHandled();
  }, [createOpen, onCreateHandled]);

  /** Jumlah project per platform — badge di segmented filter. */
  const countOf = (value: PlatformTab) =>
    value === "ALL" ? projects.length : projects.filter((p) => p.platform === value).length;

  // Pencarian (nama/key) + filter platform diterapkan di sisi klien.
  const needle = query.trim().toLowerCase();
  const filtered = projects.filter((p) => {
    if (tab !== "ALL" && p.platform !== tab) return false;
    if (!needle) return true;
    return `${p.name} ${p.code}`.toLowerCase().includes(needle);
  });

  /** Urutan tampil: hasil filter/search, lalu diurutkan bila sort Suites aktif. */
  const visible =
    sort === "default"
      ? filtered
      : [...filtered].sort((a, b) =>
          sort === "desc"
            ? b._count.suites - a._count.suites
            : a._count.suites - b._count.suites
        );

  /** Klik header Suites: default ↕ → desc ↓ → asc ↑ → default ↕. */
  const cycleSort = () =>
    setSort((prev) => (prev === "default" ? "desc" : prev === "desc" ? "asc" : "default"));
  const sortGlyph = sort === "desc" ? "↓" : sort === "asc" ? "↑" : "↕";

  /** Total suite dari baris yang sedang tampil (footer kanan). */
  const suitesShown = visible.reduce((sum, p) => sum + p._count.suites, 0);

  const handleDelete = async (p: Project) => {
    setDeletePending(true);
    const formData = new FormData();
    formData.set("id", p.id);
    await deleteProject(formData);
    setDeletePending(false);
    setDeleteTarget(null);
    showToast(`Project "${p.name}" dihapus.`, "success");
    refresh();
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Toolbar — DI DALAM card tabel, di atas header kolom. */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #EEF0F3",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Segmented filter platform, tiap tab dengan badge jumlah project. */}
          <div
            role="tablist"
            aria-label="Filter platform"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              background: "#F1F5F9",
              padding: 4,
              borderRadius: 10,
            }}
          >
            {PLATFORM_TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 10px",
                    border: "none",
                    borderRadius: 8,
                    background: active ? "#FFFFFF" : "transparent",
                    boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                    color: active ? "#0F172A" : "#475569",
                    fontWeight: active ? 600 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "background-color 0.15s ease, color 0.15s ease",
                  }}
                >
                  {t.label}
                  <span
                    style={{
                      minWidth: 18,
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      textAlign: "center",
                      background: active ? "#FEF3C7" : "#E2E8F0",
                      color: active ? "#92400E" : "#475569",
                    }}
                  >
                    {countOf(t.value)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Pencarian berdasarkan NAMA atau KEY project (case-insensitive). */}
          <div style={{ position: "relative", width: 320, maxWidth: "100%" }}>
            <Search
              size={15}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94A3B8",
                pointerEvents: "none",
              }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau key project…"
              aria-label="Cari nama atau key project"
              style={{
                width: "100%",
                height: 44,
                boxSizing: "border-box",
                padding: "0 12px 0 36px",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                fontSize: 14,
                color: "#0F172A",
                background: "#FFFFFF",
              }}
            />
          </div>
        </div>

        {/* Area tabel: menggeser mendatar bila layar lebih sempit dari min-width. */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: PROJECT_MIN_W }} role="table" aria-label="Daftar project">
            {/* Header kolom */}
            <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: PROJECT_COLS,
                alignItems: "center",
                height: 44,
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF0F3",
                padding: "0 20px",
              }}
            >
              <span role="columnheader" style={COL_HEAD}>
                Nama Project
              </span>
              <span role="columnheader" style={COL_HEAD}>
                Key
              </span>
              <span role="columnheader" style={COL_HEAD}>
                Platform
              </span>
              {/* Header Suites = tombol sorting: desc ↓ → asc ↑ → default ↕. */}
              <span
                role="columnheader"
                aria-sort={sort === "desc" ? "descending" : sort === "asc" ? "ascending" : "none"}
              >
                <button
                  type="button"
                  onClick={cycleSort}
                  title="Urutkan berdasarkan jumlah suite"
                  style={{
                    ...COL_HEAD,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  Suites
                  <span aria-hidden="true" style={{ fontSize: 11 }}>
                    {sortGlyph}
                  </span>
                </button>
              </span>
              <span role="columnheader" style={{ ...COL_HEAD, textAlign: "right" }}>
                Opsi
              </span>
            </div>

            {visible.map((p) => {
              const tone = p.platform ? PLATFORM_TONE[p.platform] : null;
              return (
                <div
                  key={p.id}
                  role="row"
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FAFAFB")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  style={{
                    display: "grid",
                    gridTemplateColumns: PROJECT_COLS,
                    alignItems: "center",
                    height: 60,
                    padding: "0 20px",
                    borderBottom: "1px solid #EEF0F3",
                    background: "transparent",
                    transition: "background-color 0.12s ease-out",
                  }}
                >
                  {/* Nama project: teks saja (tanpa avatar/inisial). */}
                  <span
                    role="cell"
                    title={p.name}
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#0F172A",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                  >
                    {p.name}
                  </span>
                  {/* Key: monospace polos, tanpa badge/background. */}
                  <span
                    role="cell"
                    title={p.code}
                    style={{
                      fontFamily: KEY_FONT,
                      fontSize: 14,
                      color: "#334155",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                  >
                    {p.code}
                  </span>
                  {/* Platform: pill + dot. */}
                  <span role="cell">
                    {p.platform && tone ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: tone.bg,
                          color: tone.color,
                          fontSize: 13,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: tone.dot,
                            flexShrink: 0,
                          }}
                        />
                        {platformOptions.find((o) => o.value === p.platform)?.label ?? p.platform}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: "#94A3B8" }}>—</span>
                    )}
                  </span>
                  {/* Suites: angka bold + kata "suite", atau ajakan italic. */}
                  <span role="cell" style={{ fontSize: 13, color: "#475569" }}>
                    {p._count.suites > 0 ? (
                      <>
                        <span style={{ fontWeight: 600, color: "#0F172A" }}>{p._count.suites}</span>{" "}
                        suite
                      </>
                    ) : (
                      <span style={{ fontStyle: "italic", color: "#64748B" }}>Belum ada suite</span>
                    )}
                  </span>
                  {/* Opsi: kebab 44×44. */}
                  <span role="cell" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <RowActionsMenu
                      actions={[
                        {
                          label: "Buka Project",
                          icon: <ArrowRight size={15} />,
                          href: `/projects/${p.id}`,
                        },
                        {
                          label: "Edit",
                          icon: <Pencil size={15} />,
                          onClick: () => setModal({ mode: "edit", project: p }),
                        },
                        {
                          label: "Hapus",
                          icon: <Trash2 size={15} />,
                          onClick: () => setDeleteTarget(p),
                          destructive: true,
                        },
                      ]}
                      ariaLabel={`Opsi untuk ${p.name}`}
                      triggerClassName="kebab-slate"
                      triggerStyle={{ width: 44, height: 44, padding: 0, borderRadius: 10 }}
                    />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Empty state — hasil filter/search kosong. */}
          {visible.length === 0 && (
            <p style={{ margin: 0, padding: 56, textAlign: "center", fontSize: 14, color: "#475569" }}>
              Tidak ada project yang cocok dengan pencarian.
            </p>
          )}
        </div>

        {/* Footer tabel */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 20px",
            background: "#FCFCFD",
            fontSize: 14,
            color: "#475569",
            flexShrink: 0,
          }}
        >
          <span>
            Menampilkan {visible.length} dari {projects.length} project
          </span>
          <span>Total {suitesShown} suite</span>
        </div>
      </div>

      {/* Modal */}
      {modal?.mode === "create" && (
        <ProjectModal title="Tambah Project Baru" onClose={() => setModal(null)} />
      )}
      {modal?.mode === "edit" && (
        <ProjectModal
          title={`Edit Project "${modal.project.name}"`}
          initial={modal.project}
          onClose={() => setModal(null)}
        />
      )}

      {/* Confirm hapus */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        itemType="Project"
        itemName={deleteTarget?.name}
        impact="Semua suite & test case di dalamnya juga akan terhapus."
        pending={deletePending}
        onConfirm={() => deleteTarget && void handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
