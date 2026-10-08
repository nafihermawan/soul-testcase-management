"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2, X } from "lucide-react";
import { addUserByEmail, removeUser, updateUser } from "@/lib/actions/users";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/avatar";

export type UserItem = {
  id: string;
  name: string | null;
  email: string;
  role: "QA" | "DEVELOPER" | "PRODUCT";
  /** Lead QA — boleh membuka QA Performance Analytics. */
  isQaLead: boolean;
};

/** Filter role di toolbar: role sistem + opsi khusus "Lead QA". */
export type RoleFilter = "ALL" | UserItem["role"] | "LEAD";

const roleOptions = [
  { value: "QA", label: "QA" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "PRODUCT", label: "Product" },
] as const;

/** Warna badge role: QA/Lead QA amber, Developer blue, Product purple. */
const ROLE_BADGE: Record<UserItem["role"], { bg: string; color: string; border: string }> = {
  QA: { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  DEVELOPER: { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  PRODUCT: { bg: "#F5F3FF", color: "#6D28D9", border: "#DDD6FE" },
};

function RoleBadge({ label, tone }: { label: string; tone: UserItem["role"] }) {
  const t = ROLE_BADGE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** Divider inset antar baris (tidak mentok tepi kartu). */
const insetRowDivider: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, transparent 0, transparent 16px, #F1F5F9 16px, #F1F5F9 calc(100% - 16px), transparent calc(100% - 16px))",
  backgroundSize: "100% 1px",
  backgroundPosition: "top left",
  backgroundRepeat: "no-repeat",
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
  const [isQaLead, setIsQaLead] = useState(initial?.isQaLead ?? false);
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
    // Lead hanya bermakna untuk role QA — dikosongkan otomatis kalau bukan QA.
    const lead = role === "QA" && isQaLead;
    const res = initial
      ? await updateUser(initial.id, { name, email, role, isQaLead: lead, password: pwd || undefined })
      : await addUserByEmail({ name, email, role, isQaLead: lead, password: pwd });
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
            <Select
              value={role}
              ariaLabel="Role user"
              style={{ marginTop: "0.25rem", width: "100%" }}
              onChange={(e) => setRole(e.target.value as UserItem["role"])}
            >
              {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          {role === "QA" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.82rem",
                fontWeight: 500,
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isQaLead}
                onChange={(e) => setIsQaLead(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#D97706", cursor: "pointer" }}
              />
              Lead QA — boleh membuka QA Performance Analytics
            </label>
          )}
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

export function UsersManager({
  users,
  query,
  roleFilter,
  createOpen,
  onCreateHandled,
}: {
  users: UserItem[];
  /** Pencarian dari toolbar di card header SettingsView. */
  query: string;
  /** Filter role dari toolbar di card header SettingsView. */
  roleFilter: RoleFilter;
  /** Sinyal dari tombol "Tambah User" di card header. */
  createOpen: boolean;
  onCreateHandled: () => void;
}) {
  const refresh = useRefresh();
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; user: UserItem } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  // Tombol "Tambah User" ada di card header → buka modal create lalu reset sinyal.
  useEffect(() => {
    if (!createOpen) return;
    setModal({ mode: "create" });
    onCreateHandled();
  }, [createOpen, onCreateHandled]);

  // Pencarian + filter role diterapkan di sisi klien (daftar user sudah lengkap).
  const needle = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (roleFilter === "LEAD") {
      if (!u.isQaLead) return false;
    } else if (roleFilter !== "ALL" && u.role !== roleFilter) {
      return false;
    }
    if (!needle) return true;
    return `${u.name ?? ""} ${u.email}`.toLowerCase().includes(needle);
  });

  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#F8FAFC",
    padding: "10px 10px",
    fontSize: 13,
    fontWeight: 600,
    color: "#64748B",
    textAlign: "left",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #E5E7EB",
  };

  const td: React.CSSProperties = {
    padding: "10px 10px",
    fontSize: 13,
    color: "#475569",
    whiteSpace: "nowrap",
  };

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
    <>
      {/* Tabel — card pembungkus & toolbar hidup di SettingsView (card header). */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Nama</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={{ ...th, textAlign: "right" }}>Opsi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: "2rem 12px", textAlign: "center", fontSize: 13, color: "#94A3B8" }}
                >
                  {users.length === 0
                    ? "Belum ada user. Tambahkan user pertama."
                    : "Tidak ada user yang cocok dengan pencarian / filter."}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} style={insetRowDivider}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <InitialsAvatar name={u.name ?? u.email} size={20} fontSize={10} />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1E293B",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={u.name ?? "—"}
                      >
                        {u.name ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: "#64748B" }}>{u.email}</td>
                  <td style={td}>
                    <span
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                    >
                      <RoleBadge label={roleLabel(u.role)} tone={u.role} />
                      {u.isQaLead && <RoleBadge label="Lead QA" tone="QA" />}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
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
    </>
  );
}
