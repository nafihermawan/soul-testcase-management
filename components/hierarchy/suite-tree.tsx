"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FolderOutput, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createSuite,
  deleteSuite,
  moveSuite,
  reorderSuites,
  updateSuite,
} from "@/lib/actions/hierarchy";
import { useRefresh } from "@/lib/client/refresh-context";
import { parseReferenceLines, platformPrefix } from "@/lib/format";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import {
  CARD_BORDER,
  HEAD_BG,
  LINE,
  MONO,
  numMono,
  ROW_DIVIDER,
  SANS,
} from "@/components/reports/report-tokens";

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

/** Update nama/kode/docUrl satu suite di dalam tree (rekursif), tanpa refetch. */
function patchSuiteInTree(
  nodes: SuiteNode[],
  id: string,
  patch: Partial<SuiteNode>
): SuiteNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children?.length) {
      return { ...n, children: patchSuiteInTree(n.children, id, patch) };
    }
    return n;
  });
}

/** Buang satu suite dari tree (rekursif) setelah dihapus. */
function removeSuiteFromTree(nodes: SuiteNode[], id: string): SuiteNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children?.length ? { ...n, children: removeSuiteFromTree(n.children, id) } : n
    );
}

/** Urutkan tree suite berdasarkan kode "ID Suite" (A-Z / Z-A), rekursif. */
function sortSuiteTree(nodes: SuiteNode[], dir: "asc" | "desc"): SuiteNode[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...nodes]
    .sort((a, b) => sign * a.code.localeCompare(b.code))
    .map((n) => (n.children?.length ? { ...n, children: sortSuiteTree(n.children, dir) } : n));
}

/**
 * Ratakan tree jadi baris tabel (depth-first) sekaligus menyimpan kedalamannya.
 * Satu tabel (bukan tabel bersarang) supaya kolom berlebar tetap tetap sejajar
 * antar level; hierarkinya ditunjukkan lewat indentasi nama suite.
 */
function flattenSuites(nodes: SuiteNode[], depth = 0): { suite: SuiteNode; depth: number }[] {
  const out: { suite: SuiteNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ suite: n, depth });
    if (n.children?.length) out.push(...flattenSuites(n.children, depth + 1));
  }
  return out;
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

/** Gaya dasar <th> tabel suite: 12px/500 #64748B. */
const TH: React.CSSProperties = {
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  textAlign: "left",
  whiteSpace: "nowrap",
};

function SuiteRow({
  suite,
  depth,
  isLast,
  canDrag,
  dragActive,
  canEdit = true,
  showToast,
  onSuiteUpdated,
  onSuiteDeleted,
  onSuiteDragStart,
  onSuiteDragEnd,
  onSuiteDropOn,
}: {
  suite: SuiteNode;
  depth: number;
  /** Baris terakhir — tanpa garis pemisah bawah. */
  isLast: boolean;
  /** Boleh di-drag (canEdit + ada baris lain untuk ditukar). */
  canDrag: boolean;
  /** Ada suite lain yang sedang di-drag — baris ini jadi target drop. */
  dragActive: boolean;
  canEdit?: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
  onSuiteUpdated: (id: string, patch: Partial<SuiteNode>) => void;
  onSuiteDeleted: (id: string) => void;
  onSuiteDragStart: (id: string) => void;
  onSuiteDragEnd: () => void;
  onSuiteDropOn: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const router = useRouter();
  const suiteHref = `/suites/${suite.id}`;

  const handleDelete = useCallback(async () => {
    setDeletePending(true);
    const formData = new FormData();
    formData.set("id", suite.id);
    const res = await deleteSuite(formData);
    setDeletePending(false);
    setConfirmDelete(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    onSuiteDeleted(suite.id);
    showToast(`Suite "${suite.name}" dihapus.`, "success");
  }, [suite.id, suite.name, showToast, onSuiteDeleted]);

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

  return (
    <>
      <tr
        draggable={canDrag}
        // Seluruh baris jadi target klik — tapi kolom Opsi dikecualikan
        // (stopPropagation di sel Opsi & link nama suite).
        onClick={() => router.push(suiteHref)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onSuiteDragStart(suite.id);
        }}
        onDragEnd={onSuiteDragEnd}
        onDragOver={(e) => {
          // Hanya relevan saat ada suite lain yang sedang di-drag.
          if (!dragActive) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!dragActive) return;
          e.preventDefault();
          onSuiteDropOn(suite.id);
        }}
        data-id={suite.id}
        style={{
          height: 52,
          cursor: "pointer",
          borderBottom: isLast ? "none" : `1px solid ${ROW_DIVIDER}`,
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {/* ID Suite — Geist Mono, satu baris dengan ellipsis + tooltip. */}
        <td style={{ paddingLeft: 16, paddingRight: 12, verticalAlign: "middle" }}>
          <span
            title={suite.code}
            style={{
              display: "block",
              fontFamily: MONO,
              fontSize: 12,
              color: "#64748B",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {suite.code}
          </span>
        </td>

        {/* Nama Suite — link ke halaman suite; hierarki ditandai indentasi. */}
        <td style={{ padding: "0 12px", verticalAlign: "middle" }}>
          <Link
            href={suiteHref}
            // Link-nya sendiri sudah menavigasi; jangan sampai baris ikut
            // memicu push kedua.
            onClick={(e) => e.stopPropagation()}
            title={suite.name}
            className="suite-name-link"
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 500,
              paddingLeft: depth * 20,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {suite.name}
          </Link>
        </td>

        {/* Jumlah Test Case — angka Geist Mono; nol ditampilkan redup. */}
        <td
          style={{
            padding: "0 24px 0 12px",
            textAlign: "right",
            verticalAlign: "middle",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              ...numMono,
              fontSize: 14,
              color: (suite.totalTestCases ?? 0) === 0 ? "#94A3B8" : "#0F172A",
            }}
          >
            {suite.totalTestCases ?? 0}
          </span>
          <span style={{ marginLeft: 4, fontSize: 13, color: "#94A3B8" }}>test case</span>
        </td>

        <td
          style={{
            padding: "0 12px",
            fontSize: 13,
            color: "#64748B",
            whiteSpace: "nowrap",
            verticalAlign: "middle",
          }}
        >
          {formatUpdatedAt(suite.updatedAt)}
        </td>

        {canEdit && (
          <td style={{ padding: "0 12px", textAlign: "right", verticalAlign: "middle" }}>
            {/* Kolom Opsi dikecualikan dari navigasi baris. */}
            <div onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
              <RowActionsMenu
                ariaLabel={`Opsi ${suite.name}`}
                iconSize={18}
                iconColor="#475569"
                triggerStyle={{ width: 32, height: 32, borderRadius: 8, padding: 0 }}
                actions={[
                  {
                    label: "Edit",
                    icon: <Pencil size={16} />,
                    onClick: () => setEditing(true),
                  },
                  {
                    label: "Pindah ke root",
                    // Folder + panah keluar — beda jelas dari aksi Edit.
                    icon: <FolderOutput size={16} />,
                    onClick: () => setConfirmMove(true),
                  },
                  {
                    label: "Hapus",
                    icon: <Trash2 size={16} />,
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
          onSaved={(updated) => {
            setEditing(false);
            onSuiteUpdated(updated.id, updated);
            showToast("Data suite berhasil diperbarui.", "success");
          }}
        />
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
  platform,
  suites,
  canEdit = true,
}: {
  projectId: string;
  platform?: string | null;
  suites: SuiteNode[];
  canEdit?: boolean;
}) {
  const refresh = useRefresh();
  const [showCreate, setShowCreate] = useState(false);
  // Cermin lokal tree suites: edit/delete di-update in-place (tanpa refetch),
  // disinkronkan ulang dari prop saat parent me-refetch (prop server otoritatif).
  const [localSuites, setLocalSuites] = useState<SuiteNode[]>(suites);
  useEffect(() => {
    setLocalSuites(suites);
  }, [suites]);
  // Urut berdasarkan "id Suite" (kode): default A-Z; klik header untuk toggle.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortedSuites = useMemo(
    () => sortSuiteTree(localSuites, sortDir),
    [localSuites, sortDir]
  );
  const { toast, showToast, dismissToast } = useToast();
  // Anchor untuk tombol "Tambah Suite" di header halaman (via portal)
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);
  /**
   * Suite yang sedang di-drag. State-nya di sini (bukan per baris) supaya drop
   * di baris LAIN bisa membacanya — sebelumnya tiap baris punya state sendiri
   * sehingga drop antar-baris tidak pernah terbaca.
   */
  const [draggingSuiteId, setDraggingSuiteId] = useState<string | null>(null);

  useEffect(() => {
    const el = document.getElementById("project-header-actions");
    setHeaderAnchor(el);
  }, []);

  const handleSuiteUpdated = useCallback((id: string, patch: Partial<SuiteNode>) => {
    setLocalSuites((prev) => patchSuiteInTree(prev, id, patch));
  }, []);

  const handleSuiteDeleted = useCallback((id: string) => {
    setLocalSuites((prev) => removeSuiteFromTree(prev, id));
  }, []);

  /** Baris tabel (flat, depth-first) — satu tabel dengan kolom berlebar tetap. */
  const rows = useMemo(() => flattenSuites(sortedSuites), [sortedSuites]);

  /**
   * Drop di atas baris lain → susun ulang urutan SAUDARA (parent yang sama),
   * lalu simpan. Dibatasi ke baris dengan `parentId` yang sama supaya urutan
   * antar-level tidak tercampur di tabel yang sudah flat.
   */
  const handleDropOn = (targetId: string) => {
    const draggedId = draggingSuiteId;
    setDraggingSuiteId(null);
    if (!draggedId || draggedId === targetId) return;

    const dragged = rows.find((r) => r.suite.id === draggedId)?.suite;
    const target = rows.find((r) => r.suite.id === targetId)?.suite;
    if (!dragged || !target || dragged.parentId !== target.parentId) return;

    const ids = rows.filter((r) => r.suite.parentId === target.parentId).map((r) => r.suite.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1 || from === to) return;
    void reorderSuites(target.parentId, reorderList(ids, from, to));
  };

  return (
    <div
      style={{
        padding: "18px 22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        fontFamily: SANS,
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
              gap: 6,
              height: 36,
              boxSizing: "border-box",
              padding: "0 14px",
              border: "1px solid #FFC348",
              borderRadius: 9,
              background: "#FFC348",
              color: "#0F172A",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
            Tambah Suite
          </button>,
          headerAnchor
        )}

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#0F172A" }}>Suites</h2>

      {/* Container tabel: sudut membulat + scroll mendatar di layar sempit.
          Vertikal dibiarkan tumbuh (halaman yang men-scroll) agar tidak ada
          baris yang terpotong. */}
      <div
        style={{
          flex: 1,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 14,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 1rem",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#64748B", fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>
              {canEdit
                ? "Belum ada suite di project ini. Tambahkan suite pertama untuk mulai menyusun hierarki test case."
                : "Belum ada suite di project ini."}
            </p>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              minWidth: 960,
              tableLayout: "fixed",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <colgroup>
              <col style={{ width: 300 }} />
              {/* Nama Suite fleksibel mengisi sisa lebar. */}
              <col />
              <col style={{ width: 170 }} />
              <col style={{ width: 200 }} />
              {canEdit && <col style={{ width: 64 }} />}
            </colgroup>
            <thead>
              <tr style={{ height: 42, background: HEAD_BG }}>
                <th
                  scope="col"
                  aria-sort={sortDir === "asc" ? "ascending" : "descending"}
                  style={{ ...TH, paddingLeft: 16, borderBottom: `1px solid ${LINE}` }}
                >
                  {/* Kolom yang sedang aktif diurutkan: label gelap + panah. */}
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label={`Urutkan ID Suite ${sortDir === "asc" ? "menurun (Z-A)" : "menaik (A-Z)"}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#0F172A",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ID Suite
                    {sortDir === "asc" ? (
                      <ArrowUp size={12} aria-hidden="true" />
                    ) : (
                      <ArrowDown size={12} aria-hidden="true" />
                    )}
                  </button>
                </th>
                <th scope="col" style={{ ...TH, borderBottom: `1px solid ${LINE}` }}>
                  Nama Suite
                </th>
                <th
                  scope="col"
                  style={{
                    ...TH,
                    paddingRight: 24,
                    textAlign: "right",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  Jumlah Test Case
                </th>
                <th scope="col" style={{ ...TH, borderBottom: `1px solid ${LINE}` }}>
                  Last Updated
                </th>
                {canEdit && (
                  <th
                    scope="col"
                    style={{
                      ...TH,
                      paddingRight: 12,
                      textAlign: "right",
                      borderBottom: `1px solid ${LINE}`,
                    }}
                  >
                    Opsi
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ suite, depth }, i) => (
                <SuiteRow
                  key={suite.id}
                  suite={suite}
                  depth={depth}
                  isLast={i === rows.length - 1}
                  canDrag={canEdit && rows.length > 1}
                  dragActive={draggingSuiteId !== null && draggingSuiteId !== suite.id}
                  canEdit={canEdit}
                  showToast={showToast}
                  onSuiteUpdated={handleSuiteUpdated}
                  onSuiteDeleted={handleSuiteDeleted}
                  onSuiteDragStart={setDraggingSuiteId}
                  onSuiteDragEnd={() => setDraggingSuiteId(null)}
                  onSuiteDropOn={handleDropOn}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Tambah Suite Baru */}
      {showCreate && (
        <SuiteModal
          projectId={projectId}
          platform={platform}
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
  onSaved: (updated: {
    id: string;
    name: string;
    code: string;
    docUrl: string | null;
    updatedAt: string;
  }) => void;
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
    if (res.suite) onSaved(res.suite);
    else onClose();
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
              placeholder="e.g. web-lgn-ffcr"
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
  platform,
  onClose,
  onCreated,
}: {
  projectId: string;
  platform?: string | null;
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

  // Auto-generate kode dari nama (berprefix platform) selama user belum
  // mengubah kode manual. Contoh: WEB + "Permission Leave" -> "web-prmssn-lv".
  const handleNameChange = (value: string) => {
    setName(value);
    if (!codeTouched) {
      const base = generateSuiteCode(value);
      setCode(base ? `${platformPrefix(platform)}-${base}` : "");
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
              placeholder="e.g. web-lgn-ffcr"
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
