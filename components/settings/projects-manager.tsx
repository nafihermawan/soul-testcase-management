"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Pencil, Trash2, X } from "lucide-react";
import type { HierarchyActionState } from "@/lib/actions/hierarchy";
import { createProject, deleteProject, updateProject } from "@/lib/actions/hierarchy";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
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

/** Filter platform di toolbar header. */
export type PlatformFilter = "ALL" | "MOBILE" | "WEB" | "HARDWARE" | "API";

/** Divider inset antar baris (tidak mentok tepi kartu). */
const insetRowDivider: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, transparent 0, transparent 16px, #F1F5F9 16px, #F1F5F9 calc(100% - 16px), transparent calc(100% - 16px))",
  backgroundSize: "100% 1px",
  backgroundPosition: "top left",
  backgroundRepeat: "no-repeat",
};

/** Header tabel bersih: tanpa isian warna, hanya garis tipis pemisah. */
const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "#fff",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#94A3B8",
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #E2E8F0",
};

const td: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "#475569",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

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
  query,
  platformFilter,
  createOpen,
  onCreateHandled,
}: {
  projects: Project[];
  /** Pencarian dari toolbar di card header SettingsView. */
  query: string;
  /** Filter platform dari toolbar di card header SettingsView. */
  platformFilter: PlatformFilter;
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

  // Tombol tambah ada di card header → buka modal create lalu reset sinyal.
  useEffect(() => {
    if (!createOpen) return;
    setModal({ mode: "create" });
    onCreateHandled();
  }, [createOpen, onCreateHandled]);

  // Pencarian (nama/key) + filter platform diterapkan di sisi klien.
  const needle = query.trim().toLowerCase();
  const filtered = projects.filter((p) => {
    if (platformFilter !== "ALL" && p.platform !== platformFilter) return false;
    if (!needle) return true;
    return `${p.name} ${p.code}`.toLowerCase().includes(needle);
  });

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
      {/* Tabel — toolbar (search / filter / tombol tambah) ada di card header. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <p
            style={{
              color: "#94A3B8",
              fontSize: 13,
              padding: "2rem 12px",
              textAlign: "center",
              margin: 0,
            }}
          >
            {projects.length === 0
              ? "Belum ada project. Tambahkan project pertama untuk mulai menyusun suite & test case."
              : "Tidak ada project yang cocok dengan pencarian / filter."}
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Nama Project</th>
                <th style={th}>Key</th>
                <th style={th}>Platform</th>
                <th style={th}>Suites</th>
                <th style={{ ...th, textAlign: "right" }}>Opsi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  style={{ ...insetRowDivider, transition: "background-color 0.15s ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <td style={td}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{p.name}</div>
                    {p.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#94A3B8",
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {/* Key = teks monospace polos (tanpa chip/pill) */}
                    <span
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12,
                        color: "#475569",
                      }}
                    >
                      {p.code}
                    </span>
                  </td>
                  <td style={td}>
                    {/* Platform = teks polos, tanpa badge berwarna */}
                    {p.platform ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>
                        {platformOptions.find((o) => o.value === p.platform)?.label ?? p.platform}
                      </span>
                    ) : (
                      <span style={{ color: "#94A3B8" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, color: "#475569" }}>{p._count.suites} suite</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div
                      style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}
                    >
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
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Project?"
        message={
          <>
            Project <strong>{deleteTarget?.name}</strong> beserta semua suite &amp; test case di
            dalamnya akan dihapus permanen.
          </>
        }
        pending={deletePending}
        onConfirm={() => deleteTarget && void handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
