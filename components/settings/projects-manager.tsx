"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Pencil, Trash2, X } from "lucide-react";
import type { HierarchyActionState } from "@/lib/actions/hierarchy";
import { createProject, deleteProject, updateProject } from "@/lib/actions/hierarchy";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";

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
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as "MOBILE" | "WEB" | "HARDWARE" | "API" | "")}
              style={{ ...fieldStyle, background: "#fff" }}
            >
              <option value="">—</option>
              {platformOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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

export function ProjectsManager({ projects }: { projects: Project[] }) {
  const refresh = useRefresh();
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; project: Project } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

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
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        border: "1px solid rgba(229, 231, 235, 0.8)",
        borderRadius: 8,
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {/* Top bar: only Tambah Project CTA, right-aligned, with divider */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0.875rem 1.5rem",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <button
          type="button"
          onClick={() => setModal({ mode: "create" })}
          style={{
            padding: "0.5rem 1.1rem",
            borderRadius: "3px !important",
            border: "none",
            background: "#F59E0B",
            color: "#000000 !important",
            fontWeight: 400,
            fontSize: "0.875rem",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.35)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Tambah Project
        </button>
      </div>
      

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        {projects.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "1.25rem" }}>
            Belum ada project. Tambahkan project pertama untuk mulai menyusun suite & test case.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr
                style={{
                  color: "var(--text-muted)",
                  textAlign: "left",
                  background: "#F8FAFC",
                  borderBottom: "1px solid #E5E7EB",
                }}
              >
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Nama Project</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Key</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Platform</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Suites</th>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600, textAlign: "right" }}>
                  Opsi
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "0.65rem 1.25rem" }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.description && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
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
                  <td style={{ padding: "0.65rem 0.5rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.2rem 0.65rem",
                        borderRadius: 999,
                        background: "#E5E7EB",
                        color: "#1F2937",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        fontFamily: "var(--font-mono, monospace)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {p.code}
                    </span>
                  </td>
                  <td style={{ padding: "0.65rem 0.5rem", color: "var(--text-secondary)" }}>
                    {p.platform ?? "—"}
                  </td>
                  <td style={{ padding: "0.65rem 0.5rem", color: "var(--text-secondary)" }}>
                    {p._count.suites} suite
                  </td>
                  <td style={{ padding: "0.65rem 1.25rem" }}>
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
    </div>
  );
}
