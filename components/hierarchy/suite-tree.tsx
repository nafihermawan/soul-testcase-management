"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createSuite,
  deleteSuite,
  moveSuite,
  reorderSuites,
  updateSuite,
} from "@/lib/actions/hierarchy";
import { useRefresh } from "@/lib/client/refresh-context";
import { parseReferenceLines } from "@/lib/format";
import { useDragReorder } from "./collapse-provider";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";

type DocRefInput = { label: string; url: string };

type SuiteNode = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  docUrl: string | null;
  totalTestCases: number;
  updatedAt?: string;
  children?: SuiteNode[];
};

function reorderList<T extends string>(ids: T[], from: number, to: number): T[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Auto-generate kode suite: hilangkan vokal, spasi -> hyphen, buang karakter khusus. */
const generateSuiteCode = (name: string): string => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[aeiou]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, "-");
};

/** Format tanggal update: "24 Aug 2026, 14:30" (id-ID). */
const formatUpdatedAt = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) +
    ", " +
    d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

function SuiteRow({
  suite,
  depth,
  projectId,
  canEdit = true,
  showToast,
}: {
  suite: SuiteNode;
  depth: number;
  projectId: string;
  canEdit?: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const { dragType, draggedId, onDragStart, onDragEnd } = useDragReorder();
  const hasChildren = (suite.children?.length ?? 0) > 0;

  const handleDelete = useCallback(async () => {
    setDeletePending(true);
    const formData = new FormData();
    formData.set("id", suite.id);
    await deleteSuite(formData);
    setDeletePending(false);
    setConfirmDelete(false);
    showToast(`Suite "${suite.name}" dihapus.`, "success");
  }, [suite.id, suite.name, showToast]);

  const handleMoveToRoot = useCallback(async () => {
    setMovePending(true);
    const res = await moveSuite(suite.id, null);
    setMovePending(false);
    setConfirmMove(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast(`Suite "${suite.name}" dipindah ke root.`, "success");
  }, [suite.id, suite.name, showToast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragType !== "suite" || !draggedId) return;
    const listEl = e.currentTarget.parentElement?.querySelector(`[data-suite-list="${suite.id}"]`);
    if (!listEl) return;
    const ids = Array.from(listEl.children)
      .map((el) => el.getAttribute("data-id"))
      .filter((x): x is string => !!x);
    const to = ids.indexOf(suite.id);
    const from = ids.indexOf(draggedId);
    if (from === -1 || to === -1 || from === to) return;
    void reorderSuites(suite.parentId, reorderList(ids, from, to));
  };

  return (
    <>
      <tr
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart("suite", suite.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragType !== "suite") return;
        }}
        onDrop={handleDrop}
        data-id={suite.id}
        style={{
          borderBottom: "1px solid var(--border)",
          cursor: "grab",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <td style={{ padding: "0.6rem 1.25rem" }}>
          <Link
            href={`/suites/${suite.id}`}
            style={{
              fontWeight: 500,
              color: "#2563EB",
              textDecoration: "none",
              display: "inline-block",
              paddingLeft: depth * 20,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {suite.name}
          </Link>
        </td>
        <td style={{ padding: "0.6rem 0.5rem", textAlign: "left" }}>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 14,
              fontWeight: 400,
              color: "#4B5563",
            }}
          >
            {suite.code}
          </span>
        </td>
        <td
          style={{
            padding: "0.6rem 0.5rem",
            color: "#6B7280",
            fontSize: "0.82rem",
            fontWeight: 400,
          }}
        >
          {suite.totalTestCases ?? 0} Test Case{suite.totalTestCases === 1 ? "" : "s"}
        </td>
        <td
          style={{
            padding: "0.6rem 0.5rem",
            color: "#6B7280",
            fontSize: 14,
            fontWeight: 400,
            whiteSpace: "nowrap",
          }}
        >
          {formatUpdatedAt(suite.updatedAt)}
        </td>
        {canEdit && (
          <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", width: 64 }}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <RowActionsMenu
                actions={[
                  {
                    label: "Edit",
                    icon: <Pencil size={15} />,
                    onClick: () => setEditing(true),
                  },
                  {
                    label: "Pindah ke root",
                    icon: <Pencil size={15} />,
                    onClick: () => setConfirmMove(true),
                  },
                  {
                    label: "Hapus",
                    icon: <Trash2 size={15} />,
                    onClick: () => setConfirmDelete(true),
                    destructive: true,
                  },
                ]}
              />
            </div>
          </td>
        )}
      </tr>

      {editing && (
        <EditSuiteModal
          suite={suite}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            showToast("Data suite berhasil diperbarui.", "success");
          }}
        />
      )}

      {hasChildren && (
        <tr>
          <td colSpan={canEdit ? 5 : 4} style={{ padding: 0 }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}
              data-suite-list={suite.id}
            >
              <tbody>
                {suite.children!.map((child) => (
                  <SuiteRow
                    key={child.id}
                    suite={child}
                    depth={depth + 1}
                    projectId={projectId}
                    canEdit={canEdit}
                    showToast={showToast}
                  />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}

      {/* Confirm hapus suite */}
      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Suite?"
        message={
          <>
            Suite <strong>{suite.name}</strong> beserta semua sub-suite &amp; test case di dalamnya
            akan dihapus permanen.
          </>
        }
        pending={deletePending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Confirm pindah ke root */}
      <ConfirmDialog
        open={confirmMove}
        title="Pindah ke Root?"
        message={
          <>
            Suite <strong>{suite.name}</strong> akan dipindahkan ke level teratas project ini.
          </>
        }
        confirmLabel="Ya, Pindah"
        pending={movePending}
        onConfirm={() => void handleMoveToRoot()}
        onCancel={() => setConfirmMove(false)}
      />
    </>
  );
}

export function SuiteTree({
  projectId,
  suites,
  canEdit = true,
}: {
  projectId: string;
  suites: SuiteNode[];
  canEdit?: boolean;
}) {
  const refresh = useRefresh();
  const [showCreate, setShowCreate] = useState(false);
  const { toast, showToast, dismissToast } = useToast();
  // Anchor untuk tombol "Tambah Suite" di header halaman (via portal)
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("project-header-actions");
    setHeaderAnchor(el);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        background: "#ffffff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      {/* Tombol "Tambah Suite" dirender di header halaman via portal */}
      {headerAnchor &&
        canEdit &&
        !showCreate &&
        createPortal(
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              height: 38,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "#F59E0B",
              color: "#111827",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          >
            <Plus size={16} /> Tambah Suite
          </button>,
          headerAnchor
        )}

      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Suites</h2>
      </div>

      {/* Card body */}
      <div style={{ padding: "1.25rem" }}>
        {suites.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 1rem",
              textAlign: "center",
            }}
          >
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                maxWidth: 420,
                lineHeight: 1.5,
              }}
            >
              {canEdit
                ? "Belum ada suite di project ini. Tambahkan suite pertama untuk mulai menyusun hierarki test case."
                : "Belum ada suite di project ini."}
            </p>
          </div>
        ) : (
          <div style={{ width: "100%", overflowX: "auto" }}>
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
                  <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Nama Suite</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Kode</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Jumlah Test Case</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 500, color: "#6B7280" }}>
                    Last Updated
                  </th>
                  {canEdit && (
                    <th
                      style={{
                        padding: "0.6rem 0.5rem",
                        fontWeight: 600,
                        textAlign: "center",
                        width: 64,
                      }}
                    >
                      Opsi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody data-suite-list="root">
                {suites.map((s) => (
                  <SuiteRow
                    key={s.id}
                    suite={s}
                    depth={0}
                    projectId={projectId}
                    canEdit={canEdit}
                    showToast={showToast}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Tambah Suite Baru */}
      {showCreate && (
        <SuiteModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            showToast("Suite berhasil ditambahkan.", "success");
            refresh();
          }}
        />
      )}

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function EditSuiteModal({
  suite,
  onClose,
  onSaved,
}: {
  suite: SuiteNode;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Controlled state — onChange selalu memperbarui state payload.
  const [name, setName] = useState(suite.name);
  const [code, setCode] = useState(suite.code);
  // Referensi dokumentasi: baris {label, url}; plain-text lama jadi baris tanpa url.
  const [docRefs, setDocRefs] = useState<DocRefInput[]>(() =>
    parseReferenceLines(suite.docUrl).map((r) => ({
      label: r.url && r.label === r.url ? "" : r.label,
      url: r.url ?? "",
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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

  const save = async () => {
    // Validasi dengan trim agar spasi kosong tidak lolos
    if (!name.trim() || !code.trim()) {
      setError("Nama dan kode wajib diisi.");
      return;
    }
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("id", suite.id);
    fd.set("name", name.trim());
    fd.set("code", code.trim().toLowerCase());
    // Serialisasi baris referensi -> teks multi-baris ("Label: url" / url polos / teks).
    const lines = docRefs
      .map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
      .filter((r) => r.label || r.url)
      .map((r) => (r.url ? (r.label ? `${r.label}: ${r.url}` : r.url) : r.label));
    fd.set("docUrl", lines.join("\n"));
    const res = await updateSuite(fd);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: "0.85rem",
    marginTop: "0.25rem",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Suite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={pending ? undefined : onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 12,
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
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Edit Suite</h3>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={pending}
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
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Nama Suite
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null); // clear error saat mulai mengetik
              }}
              placeholder="Masukkan nama suite..."
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Kode Suite
            </label>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. lgn-ffcr-pp"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Documentation / Reference Links
            </label>

            {docRefs.length === 0 ? (
              <p
                style={{
                  margin: "0.4rem 0 0",
                  fontSize: "0.82rem",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                }}
              >
                Belum ada referensi.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginTop: "0.4rem",
                }}
              >
                {docRefs.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 30%) minmax(0, 1fr) auto",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <input
                      value={r.label}
                      onChange={(e) =>
                        setDocRefs((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder="Label (PRD, TRD…)"
                      style={fieldStyle}
                    />
                    <input
                      value={r.url}
                      onChange={(e) =>
                        setDocRefs((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                      }
                      placeholder="https://…"
                      style={fieldStyle}
                    />
                    <button
                      type="button"
                      aria-label={`Hapus referensi ${r.label || i + 1}`}
                      title="Hapus referensi"
                      onClick={() => setDocRefs((prev) => prev.filter((_, j) => j !== i))}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        border: "none",
                        background: "var(--danger-bg)",
                        color: "var(--danger)",
                        cursor: "pointer",
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setDocRefs((prev) => [...prev, { label: "", url: "" }])}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                marginTop: "0.5rem",
                padding: "0.4rem 0.7rem",
                borderRadius: 8,
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                color: "var(--brand-600)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Tambah Link Reference
            </button>
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                marginTop: "0.35rem",
                lineHeight: 1.5,
              }}
            >
              Label opsional — kosongkan label untuk menyimpan URL polos.
            </div>
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
            disabled={pending}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "3px !important",
              border: "1px solid var(--border-strong)",
              background: "#fff",
              color: "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 1.1rem",
              borderRadius: "3px !important",
              border: "none",
              background: "#F59E0B",
              color: "#000000",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#D97706";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#F59E0B";
            }}
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

function SuiteModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-generate kode dari nama selama user belum mengubah kode manual.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!codeTouched) {
      setCode(generateSuiteCode(value));
    }
  };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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
      setError("Nama dan kode suite wajib diisi.");
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("code", code);
    fd.set("projectId", projectId);
    fd.set("docUrl", docUrl);
    const res = await createSuite(fd);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onCreated();
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid #D1D5DB",
    borderRadius: 3,
    fontSize: "0.85rem",
    marginTop: "0.25rem",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tambah Suite Baru"
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
          borderRadius: 12,
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
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Tambah Suite Baru</h3>
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
              Nama Suite
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Masukkan nama suite..."
              style={fieldStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#F59E0B";
                e.currentTarget.style.boxShadow = "0 0 0 1px #F59E0B";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#D1D5DB";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Kode Suite
            </label>
            <input
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value);
              }}
              placeholder="e.g. lgn-ffcr-pp"
              style={fieldStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#F59E0B";
                e.currentTarget.style.boxShadow = "0 0 0 1px #F59E0B";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#D1D5DB";
                e.currentTarget.style.boxShadow = "none";
              }}
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
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#F59E0B";
                e.currentTarget.style.boxShadow = "0 0 0 1px #F59E0B";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#D1D5DB";
                e.currentTarget.style.boxShadow = "none";
              }}
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
            padding: "0.875rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: 3,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 400,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 3,
              border: "none",
              background: "#F59E0B",
              color: "#000000",
              fontWeight: 400,
              fontSize: "0.85rem",
              cursor: pending ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
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
