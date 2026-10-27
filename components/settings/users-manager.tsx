"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Search, Star, Trash2, X } from "lucide-react";
import { addUserByEmail, removeUser, updateUser } from "@/lib/actions/users";
import { useRefresh } from "@/lib/client/refresh-context";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Select } from "@/components/ui/select";

export type UserItem = {
  id: string;
  name: string | null;
  email: string;
  role: "QA" | "DEVELOPER" | "PRODUCT";
  /** Lead QA — boleh membuka QA Performance Analytics. */
  isQaLead: boolean;
};

/** Filter role TIDAK punya tab "Lead" — lead terhitung sebagai QA. */
type RoleTab = "ALL" | UserItem["role"];

const ROLE_TABS: { value: RoleTab; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "QA", label: "QA" },
  { value: "PRODUCT", label: "Product" },
];

/** Siklus sort kolom Nama: default ↕ → A–Z ↑ → Z–A ↓. */
type NameSort = "default" | "asc" | "desc";

/** Lebar kolom tabel Users (grid): Nama | Email | Role | Opsi. */
const USER_COLS = "minmax(240px, 1.6fr) minmax(280px, 2fr) 280px 64px";

/** Lebar minimum tabel — di bawah ini container yang menggeser mendatar. */
const USER_MIN_W = 860;

/** Gaya seragam untuk header kolom (identik dengan tabel Projects). */
const USER_COL_HEAD: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#64748B",
  whiteSpace: "nowrap",
};

const roleOptions = [
  { value: "QA", label: "QA" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "PRODUCT", label: "Product" },
] as const;

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
  createOpen,
  onCreateHandled,
}: {
  users: UserItem[];
  /** Sinyal dari tombol "Tambah User" di card header. */
  createOpen: boolean;
  onCreateHandled: () => void;
}) {
  const refresh = useRefresh();
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; user: UserItem } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  /** Filter role (segmented) + pencarian nama/email — keduanya di sisi klien. */
  const [tab, setTab] = useState<RoleTab>("ALL");
  const [query, setQuery] = useState("");
  /** Sort kolom Nama; `default` = urutan dari server (tidak diubah). */
  const [sort, setSort] = useState<NameSort>("default");

  // Tombol "Tambah User" ada di card header → buka modal create lalu reset sinyal.
  useEffect(() => {
    if (!createOpen) return;
    setModal({ mode: "create" });
    onCreateHandled();
  }, [createOpen, onCreateHandled]);

  /** Jumlah user per role untuk badge segmented filter (Lead ikut terhitung QA). */
  const countOf = (value: RoleTab) =>
    value === "ALL" ? users.length : users.filter((u) => u.role === value).length;

  // Pencarian + filter role diterapkan di sisi klien (daftar user sudah lengkap).
  const needle = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (tab !== "ALL" && u.role !== tab) return false;
    if (!needle) return true;
    return `${u.name ?? ""} ${u.email}`.toLowerCase().includes(needle);
  });

  /** Urutan tampil: hasil filter/search, lalu diurutkan bila sort Nama aktif. */
  const byName = (a: UserItem, b: UserItem) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email, "id", { sensitivity: "base" });
  const visible =
    sort === "default"
      ? filtered
      : [...filtered].sort((a, b) => (sort === "asc" ? byName(a, b) : byName(b, a)));

  /** Klik header Nama: default ↕ → A–Z ↑ → Z–A ↓ → default ↕. */
  const cycleSort = () =>
    setSort((prev) => (prev === "default" ? "asc" : prev === "asc" ? "desc" : "default"));
  const sortGlyph = sort === "asc" ? "↑" : sort === "desc" ? "↓" : "↕";

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
          }}
        >
          {/* Segmented filter role, tiap tab dengan badge jumlah user. */}
          <div
            role="tablist"
            aria-label="Filter role"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              background: "#F1F5F9",
              padding: 4,
              borderRadius: 10,
            }}
          >
            {ROLE_TABS.map((t) => {
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

          {/* Pencarian berdasarkan NAMA atau EMAIL (case-insensitive). */}
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
              placeholder="Cari nama atau email user…"
              aria-label="Cari nama atau email user"
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
          <div style={{ minWidth: USER_MIN_W }} role="table" aria-label="Daftar user">
            {/* Header kolom */}
            <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: USER_COLS,
                alignItems: "center",
                height: 44,
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF0F3",
                padding: "0 20px",
              }}
            >
              {/* Header Nama = tombol sorting: A–Z ↑ → Z–A ↓ → default ↕. */}
              <span
                role="columnheader"
                aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}
              >
                <button
                  type="button"
                  onClick={cycleSort}
                  title="Urutkan berdasarkan nama"
                  style={{
                    ...USER_COL_HEAD,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  Nama
                  <span aria-hidden="true" style={{ fontSize: 11 }}>
                    {sortGlyph}
                  </span>
                </button>
              </span>
              <span role="columnheader" style={USER_COL_HEAD}>
                Email
              </span>
              <span role="columnheader" style={USER_COL_HEAD}>
                Role
              </span>
              <span role="columnheader" style={{ ...USER_COL_HEAD, textAlign: "right" }}>
                Opsi
              </span>
            </div>

            {visible.map((u) => (
              <div
                key={u.id}
                role="row"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FAFAFB")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                style={{
                  display: "grid",
                  gridTemplateColumns: USER_COLS,
                  alignItems: "center",
                  height: 60,
                  padding: "0 20px",
                  borderBottom: "1px solid #EEF0F3",
                  background: "transparent",
                  transition: "background-color 0.12s ease-out",
                }}
              >
                {/* Nama: teks saja (tanpa avatar/inisial). */}
                <span
                  role="cell"
                  title={u.name ?? u.email}
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
                  {u.name ?? "—"}
                </span>
                {/* Email: link mailto tanpa underline. */}
                <span role="cell" style={{ minWidth: 0, paddingRight: 12 }}>
                  <a
                    href={`mailto:${u.email}`}
                    title={u.email}
                    style={{
                      display: "block",
                      fontSize: 14,
                      color: "#475569",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.email}
                  </a>
                </span>
                {/* Role: teks biasa; user QA yang lead diberi penanda bintang. */}
                <span role="cell" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{ fontSize: 14, fontWeight: 500, color: "#0F172A", whiteSpace: "nowrap" }}
                  >
                    {roleLabel(u.role)}
                  </span>
                  {u.role === "QA" && u.isQaLead && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#B45309",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Star size={12} aria-hidden="true" fill="currentColor" />
                      Lead
                    </span>
                  )}
                </span>
                {/* Opsi: kebab 44×44. */}
                <span role="cell" style={{ display: "flex", justifyContent: "flex-end" }}>
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
                    ariaLabel={`Opsi untuk ${u.name ?? u.email}`}
                    triggerClassName="kebab-slate"
                    triggerStyle={{ width: 44, height: 44, padding: 0, borderRadius: 10 }}
                  />
                </span>
              </div>
            ))}
          </div>

          {/* Empty state — hasil filter/search kosong. */}
          {visible.length === 0 && (
            <p style={{ margin: 0, padding: 56, textAlign: "center", fontSize: 14, color: "#475569" }}>
              Tidak ada user yang cocok dengan pencarian.
            </p>
          )}
        </div>

        {/* Footer tabel */}
        <div style={{ padding: "14px 20px", background: "#FCFCFD", fontSize: 14, color: "#475569" }}>
          Menampilkan {visible.length} dari {users.length} user
        </div>
      </div>

      {/* Modal */}
      {modal?.mode === "create" && <UserModal title="Tambah User Baru" onClose={() => setModal(null)} />}
      {modal?.mode === "edit" && <UserModal title="Edit User" initial={modal.user} onClose={() => setModal(null)} />}

      {/* Confirm hapus */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        itemType="Akses User"
        itemName={deleteTarget?.email}
        pending={deletePending}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
