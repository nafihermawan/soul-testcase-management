"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { addUserByEmail, removeUser, updateUser } from "@/lib/actions/users";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";

export type UserItem = {
  id: string;
  name: string | null;
  email: string;
  role: "QA" | "DEVELOPER" | "PRODUCT";
};

const roleOptions = [
  { value: "QA", label: "QA" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "PRODUCT", label: "Product" },
] as const;

const roleBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.2rem 0.65rem",
  borderRadius: 999,
  background: "#E5E7EB",
  color: "#1F2937",
  fontSize: "0.72rem",
  fontWeight: 600,
};

const roleLabel = (role: UserItem["role"]) =>
  roleOptions.find((r) => r.value === role)?.label ?? role;

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: "0.85rem",
  marginTop: "0.25rem",
};

function UserModal({
  title,
  initial,
  onClose,
}: {
  title: string;
  initial?: UserItem;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<UserItem["role"]>(initial?.role ?? "DEVELOPER");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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
    if (!email.trim().includes("@")) {
      setError("Email tidak valid.");
      return;
    }
    const pwd = password.trim();
    if (!initial && pwd.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    setPending(true);
    const res = initial
      ? await updateUser(initial.id, { name, email, role, password: pwd || undefined })
      : await addUserByEmail({ name, email, role, password: pwd });
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
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Nama Lengkap
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Nafi Hermawan"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@soulparking.co.id"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Role
            </label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserItem["role"])} style={{ ...fieldStyle, background: "#fff" }}>
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Password {initial ? "(opsional)" : ""}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={initial ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"}
              autoComplete="new-password"
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

export function UsersManager({ users }: { users: UserItem[] }) {
  const refresh = useRefresh();
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; user: UserItem } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const remove = async (user: UserItem) => {
    setDeletePending(true);
    const res = await removeUser(user.id);
    setDeletePending(false);
    if (res.error) {
      setDeleteTarget(null);
      showToast(res.error, "error");
      return;
    }
    setDeleteTarget(null);
    showToast(`Akses "${user.email}" dihapus.`, "success");
    refresh();
  };

  return (
    <div
      style={{
        marginTop: "1.5rem",
        background: "#fff",
        border: "1px solid rgba(229, 231, 235, 0.8)",
        borderRadius: 8,
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {/* Top bar: only Tambah User CTA, right-aligned, with divider */}
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
        >
          Tambah User
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", textAlign: "left", background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" }}>
              <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Nama</th>
              <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Email</th>
              <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Role</th>
              <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600, textAlign: "right" }}>Opsi</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center" }}>
                  Belum ada user. Tambahkan user pertama.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>{u.name ?? "—"}</td>
                <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{u.email}</td>
                <td style={{ padding: "0.6rem 0.5rem" }}>
                  <span style={roleBadgeStyle}>{roleLabel(u.role)}</span>
                </td>
                <td style={{ padding: "0.6rem 1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                    <RowActionsMenu
                      actions={[
                        {
                          label: "Edit",
                          icon: <Pencil size={15} />,
                          onClick: () => setModal({ mode: "edit", user: u }),
                        },
                        {
                          label: "Hapus",
                          icon: <Trash2 size={15} />,
                          onClick: () => setDeleteTarget(u),
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal?.mode === "create" && <UserModal title="Tambah User Baru" onClose={() => setModal(null)} />}
      {modal?.mode === "edit" && <UserModal title="Edit User" initial={modal.user} onClose={() => setModal(null)} />}

      {/* Confirm hapus */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Akses User?"
        message={
          <>
            Akses <strong>{deleteTarget?.email}</strong> akan dihapus permanen dari sistem.
          </>
        }
        pending={deletePending}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
