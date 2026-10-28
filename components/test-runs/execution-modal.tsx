"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bug, Check, ChevronDown, Copy, Lock, Pencil, Plus, Unlink, X } from "lucide-react";
import { detachBugFromRun, updateBugStatus } from "@/lib/actions/automation-bugs";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode, formatCase } from "@/lib/format";
import { SKIP_REASON_OPTIONS, SKIP_REASON_OTHER, isActiveBugStatus } from "@/lib/qa-metrics";
import {
  AttachmentsPanel,
  type AttachmentsPanelHandle,
} from "@/components/attachments/attachments-panel";
import { ListTextarea } from "@/components/ui/list-textarea";
import { BulletText } from "@/components/ui/bullet-text";
import { Select } from "@/components/ui/select";
import type {
  AttachmentItem,
  BugEditableFields,
  BugRow,
  BugStatus,
  BugsPayload,
} from "@/types/api";
import {
  BUG_STATUS_BADGE,
  FONT_MONO,
  FONT_SANS,
  RESULT_OPTIONS,
  SEVERITIES,
  type RunResultItem,
} from "./run-executor-shared";

/** Batas lebar kolom kiri split panel modal eksekusi (persen dari lebar modal). */
const SPLIT_MIN_PCT = 40;
const SPLIT_MAX_PCT = 70;
/** Lebar area drag divider (px). */
const SPLIT_DIVIDER_W = 8;
/** Durasi transisi buka/tutup modal eksekusi (ms). Animasi keluar ditahan
 *  selama ini sebelum komponen benar-benar di-unmount. */
const MODAL_TRANSITION_MS = 300;
/** Jepit lebar kolom kiri ke rentang yang diizinkan. */
const clampSplit = (pct: number) => Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, pct));

/**
 * Gaya label form STANDAR panel ini (setara `text-sm font-medium text-gray-700
 * mb-1.5`): 14px, weight 500, gray-700, jarak 6px ke field di bawahnya.
 *
 * Jarak label→field sengaja dibawa oleh `marginBottom` label ini, bukan oleh
 * `gap` container — supaya semua field punya ritme yang sama dan tidak ada
 * container yang dobel jarak.
 */
const FORM_LABEL: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
  marginBottom: "0.375rem",
};

/** Jarak baku antar elemen form di panel ini (setara `mb-4` = 16px). */
const FORM_GAP = 16;

/** Garis pemisah horizontal form (setara `border-t border-gray-200`). */
const FORM_DIVIDER: React.CSSProperties = {
  flexShrink: 0,
  height: 1,
  background: "var(--border)",
};

export function ExecutionModal({
  item,
  canEdit,
  environment,
  onClose,
  onOpenBugDetail,
  onResultStatusChange,
  onBugsResolved,
  onAttachmentsChange,
  bugPatch,
  onSave,
}: {
  item: RunResultItem;
  canEdit: boolean;
  /** Environment run — read-only, ditampilkan di form bug mode Fail. */
  environment: string | null;
  onClose: () => void;
  /** Buka Bug Detail Modal dari daftar riwayat bug TC ini. */
  onOpenBugDetail?: (bugId: string) => void;
  /**
   * Status hasil eksekusi berubah karena aksi bug (mis. bug di-Close → PASS,
   * bug dibuka lagi → FAIL). Parent memakai ini untuk memperbarui kartu/daftar
   * lokalnya tanpa refetch.
   */
  onResultStatusChange?: (status: RunResultItem["status"]) => void;
  /**
   * Bug terkait diselesaikan dari dialog konflik status (ditutup atau dilepas
   * dari run) — parent mencerminkan perubahan itu di daftar lokalnya.
   */
  onBugsResolved?: (bugIds: string[], choice: "close" | "detach") => void;
  /** Teruskan daftar attachment terbaru ke parent (update in-place, tanpa refetch). */
  onAttachmentsChange?: (list: AttachmentItem[]) => void;
  /** Patch bug hasil Edit Bug dari parent — dipakai untuk update `linkedBugs` in-place. */
  bugPatch?: { id: string; patch: BugEditableFields } | null;
  onSave: (data: {
    status: RunResultItem["status"];
    actualResult?: string;
    notes?: string;
    /** Diisi hanya saat status SKIPPED. */
    skipReason?: string;
    /** Keterangan bebas, diisi hanya saat alasannya "Lainnya". */
    skipReasonNote?: string;
    /**
     * Mode Fail saja:
     * - `new`  → buat Bug BARU (ID baru) ter-link ke TC + hasil run ini;
     * - `edit` → perbarui bug yang sedang ter-link (tanpa record baru).
     * `closeOldBugId` = bug lama yang harus di-Close otomatis saat bug baru
     * disimpan (Retest Fail karena issue berbeda).
     */
    bug?: {
      mode: "new" | "edit";
      id?: string;
      closeOldBugId?: string;
      title: string;
      severity: string;
    };
  }) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [status, setStatus] = useState<RunResultItem["status"]>(item.status);
  /** Alasan wajib saat status SKIPPED (lihat SKIP_REASON_OPTIONS). */
  const [skippedReason, setSkippedReason] = useState(item.skipReason ?? "");
  /** Keterangan bebas — hanya dipakai saat alasannya "Lainnya". */
  const [skippedReasonNote, setSkippedReasonNote] = useState(item.skipReasonNote ?? "");
  const [actualResult, setActualResult] = useState(item.actualResult ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  // Judul bug default KOSONG — diisi QA, atau ter-prefill dari bug aktif saat
  // mode "edit" (lihat effect activeBug di bawah).
  const [bugTitle, setBugTitle] = useState("");
  const [bugSeverity, setBugSeverity] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /**
   * Jumlah file evidence yang masih tertahan di klien (mode deferred, belum
   * di-commit). Dipakai bersama attachment tersimpan untuk menilai "evidence
   * sudah diunggah" pada validasi tombol Simpan.
   */
  const [pendingEvidence, setPendingEvidence] = useState(0);

  /**
   * Animasi buka/tutup. `entered` dipasang setelah frame pertama benar-benar
   * digambar — pakai DOUBLE rAF, karena satu rAF bisa ter-batch dengan commit
   * React sehingga frame opacity-0 tidak pernah dilukis dan transisinya diam.
   * `closing` menahan modal tetap ter-mount sampai animasi keluar selesai.
   */
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const shown = entered && !closing;

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // Baru benar-benar unmount (via onClose) setelah transisi keluar selesai.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, MODAL_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tc = item.testCase;
  const stepsList = (tc?.steps ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  /**
   * Riwayat bug milik TEST CASE ini (bukan hanya hasil eksekusi run ini).
   * Sengaja diambil per testCaseId supaya bug yang sudah RESOLVED/CLOSED —
   * termasuk yang sudah melepas tautan run-nya — tetap tampil riwayatnya.
   */
  const [linkedBugs, setLinkedBugs] = useState<BugRow[]>([]);
  const [bugsLoading, setBugsLoading] = useState(true);
  // Accordion Bug History — default tertutup agar hemat ruang visual.
  const [bugHistoryOpen, setBugHistoryOpen] = useState(false);
  // Status tombol "Salin" Test Data (kembali normal setelah 2 detik).
  const [testDataCopied, setTestDataCopied] = useState(false);
  // Toast + guard khusus modal ini (ubah status bug langsung dari Bug History).
  const { toast, showToast, dismissToast } = useToast();
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  /** Dialog konflik: status diubah ke non-Fail padahal masih ada bug aktif. */
  const [bugConflictOpen, setBugConflictOpen] = useState(false);
  const [resolving, setResolving] = useState<"close" | "detach" | null>(null);

  /**
   * Ubah status bug langsung dari badge di Bug History. Daftarnya dicerminkan ke
   * state lokal dan di-patch IN-PLACE setelah sukses (tanpa refetch halaman),
   * jadi warna & label badge langsung ikut berubah.
   */
  const changeBugStatus = async (bugId: string, status: BugStatus) => {
    if (statusPendingId) return;
    setStatusPendingId(bugId);
    const res = await updateBugStatus(bugId, status);
    setStatusPendingId(null);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    const isDone = status === "CLOSED" || status === "RESOLVED";
    setLinkedBugs((prev) =>
      prev.map((b) =>
        b.id === bugId
          ? { ...b, status, resolvedAt: isDone ? new Date().toISOString() : null }
          : b
      )
    );
    /**
     * Bug ditutup = defect sudah diperbaiki, jadi eksekusi ini ikut PASS —
     * disetel LANGSUNG di state modal (tombol hasil jadi Pass aktif) tanpa
     * refetch halaman. "Actual Result" lama dibuang dari state supaya artefak
     * hasil Fail yang sudah diperbaiki tidak ikut tersimpan lagi; aksi server
     * sendiri juga sudah membalik hasil FAIL yang tertaut jadi PASS.
     */
    if (isDone) {
      setStatus("PASS");
      setActualResult("");
      onResultStatusChange?.("PASS");
    } else {
      /**
       * Bug DIBUKA lagi (Open/In Progress): server mengembalikan hasil eksekusi
       * ini ke FAIL — invariant "bug aktif menempel pada TC Failed" — jadi state
       * modal ikut disamakan.
       */
      setStatus("FAIL");
      onResultStatusChange?.("FAIL");
    }
    showToast(
      isDone
        ? `Status bug diubah ke ${BUG_STATUS_BADGE[status].label} — status eksekusi diset ke Pass.`
        : `Status bug diubah ke ${BUG_STATUS_BADGE[status].label} — status eksekusi dikembalikan ke Fail.`,
      "success"
    );
  };

  /** Semua bug AKTIF di hasil eksekusi ini — dasar dialog konflik status. */
  const itemActiveBugs = (item.bugs ?? []).filter((b) => isActiveBugStatus(b.status));

  /**
   * Bug AKTIF yang menempel ke hasil eksekusi ini (fallback: bug aktif mana pun
   * di riwayat TC). Dasar tab "Edit Bug Aktif" + penentu mode form.
   */
  const activeBug =
    (item.bugs ?? []).find((b) => b.status === "OPEN" || b.status === "IN_PROGRESS") ??
    linkedBugs.find((b) => b.status === "OPEN" || b.status === "IN_PROGRESS") ??
    null;

  /**
   * Mode form bug (hanya relevan saat status Fail):
   * - "edit" → QA menambah detail/evidence pada bug aktif (default bila ada);
   * - "new"  → Retest Fail karena ISSUE BERBEDA: bug lama di-Resolve, bug baru dibuat.
   */
  const [bugMode, setBugMode] = useState<"new" | "edit">("new");
  /** Sekali QA memilih "buat bug baru", pilihan itu tidak ditimpa lagi. */
  const [userChoseNewBug, setUserChoseNewBug] = useState(false);
  const appliedBugRef = useRef<string | null>(null);

  useEffect(() => {
    if (userChoseNewBug) return;
    setBugMode(activeBug ? "edit" : "new");
  }, [activeBug, userChoseNewBug]);

  // Prefill judul & severity dari bug aktif (sekali per bug) supaya mode edit
  // langsung memperlihatkan isi bug yang sedang diperbarui.
  useEffect(() => {
    if (!activeBug) return;
    if (appliedBugRef.current === activeBug.id) return;
    appliedBugRef.current = activeBug.id;
    setBugTitle(activeBug.title);
    setBugSeverity(activeBug.severity ?? "MEDIUM");
  }, [activeBug]);

  /**
   * Split panel yang bisa di-resize: lebar kolom kiri dalam persen, dibatasi
   * SPLIT_MIN_PCT–SPLIT_MAX_PCT agar layout tetap proporsional.
   */
  const [splitPct, setSplitPct] = useState(58);
  const [dragging, setDragging] = useState(false);
  // Divider "aktif" = sedang di-hover atau di-fokus (keyboard).
  const [dividerActive, setDividerActive] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // Handle panel Evidence (mode deferred): commit saat Simpan, reset saat Batal.
  const evidenceRef = useRef<AttachmentsPanelHandle>(null);

  // Pantau pergeseran mouse real-time selama drag; berhenti saat mouseup.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      // Kurangi setengah lebar divider supaya panel tidak "melompat" saat
      // divider mulai di-grab (titik acuan = tengah divider).
      const pct = ((e.clientX - rect.left - SPLIT_DIVIDER_W / 2) / rect.width) * 100;
      setSplitPct(clampSplit(pct));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // Saat drag: kunci kursor & matikan seleksi teks supaya tidak ikut tersorot.
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bugs?testCaseId=${encodeURIComponent(item.testCaseId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as BugsPayload;
        if (!cancelled) setLinkedBugs(data.bugs);
      } catch {
        if (!cancelled) setLinkedBugs([]);
      } finally {
        if (!cancelled) setBugsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.testCaseId]);

  // Edit Bug dari parent (via Bug Detail Modal) -> patch `linkedBugs` in-place,
  // tanpa refetch, supaya daftar riwayat tidak menampilkan judul/severity basi.
  useEffect(() => {
    if (!bugPatch) return;
    setLinkedBugs((prev) =>
      prev.map((b) => (b.id === bugPatch.id ? { ...b, ...bugPatch.patch } : b))
    );
  }, [bugPatch]);

  /**
   * Label section standar modal: text-xs / bold / slate-500 / uppercase /
   * tracking-wider. Dipakai semua heading section agar hierarki label vs isi
   * konsisten.
   */
  const sectionLabel: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 0.4rem",
  };

  // Mode Fail -> form berubah jadi Bug Reporting Form.
  const isFail = status === "FAIL";
  /**
   * Sudah pernah disimpan ke DB? Dilihat dari DATA TERSIMPAN (status bukan
   * NOT_RUN, atau sudah ada actual result / notes) — bukan draft di form,
   * supaya label baru berubah setelah benar-benar tersimpan.
   */
  const hasSavedExecution =
    item.status !== "NOT_RUN" ||
    (item.actualResult ?? "").trim() !== "" ||
    (item.notes ?? "").trim() !== "";

  /**
   * Mode modal: TC yang SUDAH pernah dieksekusi dibuka dalam mode view
   * (read-only) lebih dulu — QA harus klik "Edit" untuk mengubahnya. TC yang
   * belum pernah dieksekusi langsung masuk mode edit.
   */
  const [isEditing, setIsEditing] = useState(!hasSavedExecution);
  /** Efektif editable: butuh izin edit (canEdit) DAN sedang di mode edit. */
  const editable = canEdit && isEditing;

  /**
   * Form pelaporan bug (mode Fail) hanya relevan saat MENGEDIT. Di mode view
   * cukup tampilkan hasil eksekusi sebagai teks polos tanpa input box.
   */
  const showBugForm = isFail && editable;

  /**
   * "Actual Result" hanya dipakai hasil Fail/Blocked (dipakai untuk menentukan
   * apakah nilainya ikut disimpan).
   */
  const usesActualResult = status === "FAIL" || status === "BLOCKED";

  /**
   * Kolom `notes` dipakai dua status:
   * - PASS    : catatan eksekusi (opsional);
   * - BLOCKED : "Alasan Blocked" — WAJIB, supaya QA memberi konteks penjelas
   *             kenapa TC ini tidak bisa dijalankan.
   */
  const usesNotes = status === "PASS" || status === "BLOCKED";

  /**
   * Section "Evidence" tampil saat penguji memilih Pass/Fail/Blocked, dan
   * disembunyikan saat Skipped. Saat modal baru dibuka (belum ada status yang
   * dipilih) section ini juga belum tampil — muncul begitu tombol Pass/Fail/
   * Blocked diklik.
   */
  const showsEvidence = status === "PASS" || usesActualResult;

  /**
   * Evidence hanya WAJIB untuk Fail/Blocked. Di Pass, evidence opsional — tidak
   * pernah menghambat aktifnya tombol Simpan.
   */
  const requiresEvidence = usesActualResult;

  /**
   * Section "Actual Result" hanya relevan untuk hasil Fail/Blocked — artefak
   * hasil lama tidak boleh muncul lagi setelah eksekusi berpindah ke Pass
   * (mis. karena bug-nya sudah ditutup).
   */
  const showActualResultBlock = usesActualResult && (actualResult ?? "").trim() !== "";

  /** Evidence "sudah diunggah" = ada file tersimpan atau file tertunda di klien. */
  const hasEvidence = (item.attachments?.length ?? 0) + pendingEvidence > 0;

  // Section Evidence yang disembunyikan melepas panel-nya (file tertunda ikut
  // dibuang), jadi penghitungnya ikut di-nol-kan supaya tidak ada angka basi.
  useEffect(() => {
    if (!showsEvidence) setPendingEvidence(0);
  }, [showsEvidence]);

  /**
   * Tombol "Simpan Eksekusi" DISABLED sampai penguji memilih status
   * (selain NOT_RUN). Aturan tambahan per status:
   * - PASS         : aktif langsung (evidence opsional);
   * - SKIPPED      : wajib memilih alasan — dan, kalau alasannya "Lainnya",
   *                  wajib mengisi keterangannya;
   * - BLOCKED      : wajib mengisi "Alasan Blocked";
   * - FAIL/BLOCKED : wajib ada evidence, atau sudah ada catatan.
   */
  const saveBlocked =
    status === "NOT_RUN" ||
    (status === "SKIPPED" &&
      (skippedReason === "" ||
        (skippedReason === SKIP_REASON_OTHER && skippedReasonNote.trim() === ""))) ||
    (status === "BLOCKED" && notes.trim() === "") ||
    (requiresEvidence && !hasEvidence && (notes ?? "").trim() === "");

  /** Salin Test Data ke clipboard (tombol ringkas di samping nilainya). */
  const copyTestData = async () => {
    const value = tc?.testData ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setTestDataCopied(true);
      setTimeout(() => setTestDataCopied(false), 2000);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };

  /** Tombol "Batal": buang draft form + evidence tertunda, kembali ke mode view. */
  const cancelEdit = () => {
    // Evidence yang belum di-commit dibuang; tidak ada API yang pernah dipanggil.
    evidenceRef.current?.reset();
    setStatus(item.status);
    setSkippedReason(item.skipReason ?? "");
    setSkippedReasonNote(item.skipReasonNote ?? "");
    setActualResult(item.actualResult ?? "");
    setNotes(item.notes ?? "");
    setBugTitle("");
    setBugSeverity("MEDIUM");
    setMsg(null);
    setIsEditing(false);
  };

  /** Kotak warna severity (8×8) untuk field Severity. */
  const sevColor = (sev: string): string =>
    sev === "CRITICAL" ? "#B91C1C" : sev === "HIGH" ? "#EA580C" : sev === "MEDIUM" ? "#CA8A04" : "#94A3B8";

  /** Blok Bug History (accordion) — satu kotak bordered, dipakai kedua state. */
  const renderBugHistory = () => (
    <div style={{ border: "1px solid #E3E7EE", borderRadius: 12, overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={bugHistoryOpen}
        onClick={() => setBugHistoryOpen((v) => !v)}
        style={{
          padding: "12px 14px",
          border: "none",
          background: "#FFFFFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          width: "100%",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Bug size={15} aria-hidden="true" style={{ color: "#B91C1C" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Bug History</span>
          {!bugsLoading && linkedBugs.length > 0 && (
            <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: "#64748B" }}>
              {linkedBugs.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          style={{
            color: "#64748B",
            transform: bugHistoryOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms ease-in-out",
          }}
        />
      </button>

      {bugHistoryOpen && (
        <div style={{ borderTop: "1px solid #EEF1F5" }}>
          {bugsLoading ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#94A3B8" }}>
              Memuat riwayat bug…
            </div>
          ) : linkedBugs.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#94A3B8" }}>
              Belum ada bug yang pernah dilaporkan untuk test case ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {linkedBugs.map((b, idx) => {
                const meta = [
                  new Date(b.createdAt).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }),
                  b.resolvedAt
                    ? `Selesai ${new Date(b.resolvedAt).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "",
                  b.run ? b.run.name : "",
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={b.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderBottom: idx < linkedBugs.length - 1 ? "1px solid #F1F4F8" : "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBugDetail?.(b.id)}
                      title={meta ? `${b.title} — ${meta}` : b.title}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        border: "none",
                        background: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: onOpenBugDetail ? "pointer" : "default",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#0F172A",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.title}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#64748B" }}>
                        {entityCode("BUG", b.id)}
                      </span>
                    </button>

                    {/* Dropdown status bug — polos, tanpa pill/latar warna. */}
                    <Select
                      size="sm"
                      value={b.status === "RESOLVED" ? "CLOSED" : b.status}
                      disabled={!canEdit || statusPendingId === b.id}
                      ariaLabel={`Ubah status bug ${entityCode("BUG", b.id)}`}
                      chevronColor="#94A3B8"
                      style={{
                        flexShrink: 0,
                        width: "auto",
                        height: 32,
                        padding: "0 8px 0 10px",
                        border: "1px solid #E3E7EE",
                        background: "#FFFFFF",
                        color: "#0F172A",
                        fontSize: 13,
                        fontWeight: 500,
                        boxShadow: "none",
                        gap: 7,
                      }}
                      onChange={(e) => void changeBugStatus(b.id, e.target.value as BugStatus)}
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="CLOSED">Closed</option>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /** Tab "Edit Bug Aktif": isi form dari bug aktif supaya bisa diperbarui. */
  const useCurrentBug = () => {
    setUserChoseNewBug(false);
    setBugMode("edit");
    setMsg(null);
    if (activeBug) {
      appliedBugRef.current = activeBug.id;
      setBugTitle(activeBug.title);
      setBugSeverity(activeBug.severity ?? "MEDIUM");
    }
  };

  /**
   * Tab "+ Laporkan Bug Baru": kosongkan form. Bug lama di-Resolve otomatis
   * SAAT SIMPAN (bukan sekarang), jadi belum ada data yang berubah di sini.
   */
  const startNewBug = () => {
    setUserChoseNewBug(true);
    setBugMode("new");
    setMsg(null);
    setBugTitle("");
    setBugSeverity("MEDIUM");
    setActualResult("");
  };

  /**
   * Gaya tab pemilih mode bug — mengikuti aksen amber brand Soulparking:
   * aktif = bg amber-100 + teks amber-800 semibold + border amber-300,
   * non-aktif = netral (slate-500) dengan border tipis.
   */
  /** Kirim hasil eksekusi ke server (validasi form sudah dilakukan `save`). */
  const performSave = async () => {
    if (saving) return;
    setSaving(true);

    // Evidence (mode edit) baru diunggah/dihapus ke server saat Simpan diklik.
    // Kalau gagal, modal tetap terbuka supaya QA bisa mengulang.
    if (editable) {
      const ev = await evidenceRef.current?.commit();
      if (ev && !ev.ok) {
        setSaving(false);
        setMsg(ev.error ?? "Gagal menyimpan evidence.");
        return;
      }
    }

    const res = await onSave({
      status,
      /**
       * Actual Result hanya milik hasil Fail/Blocked (section-nya pun cuma
       * muncul di status itu). Untuk status lain, kirim BALIK nilai tersimpan
       * apa adanya supaya tidak ada draft tak terlihat yang ikut tersimpan.
       */
      actualResult: usesActualResult ? actualResult : item.actualResult ?? "",
      /**
       * Notes dipakai hasil PASS (opsional) dan BLOCKED (alasan wajib) —
       * field-nya hanya muncul di dua status itu. Untuk status lain, kirim
       * BALIK nilai tersimpan apa adanya supaya catatan lama tidak terhapus
       * hanya karena field-nya tidak ditampilkan — dan draft yang tidak
       * terlihat tidak pernah ikut tersimpan.
       */
      notes: usesNotes ? notes : item.notes ?? "",
      skipReason: skippedReason,
      skipReasonNote: skippedReasonNote,
      // Mode Fail: "edit" memperbarui bug yang sudah ter-link, "new" membuat bug
      // BARU (dipakai saat retest gagal karena issue berbeda).
      bug: isFail
        ? {
            mode: bugMode === "edit" && activeBug ? "edit" : "new",
            id: bugMode === "edit" ? activeBug?.id : undefined,
            // Bug aktif yang di-Close otomatis saat bug baru disimpan.
            closeOldBugId: bugMode === "new" ? activeBug?.id : undefined,
            title: bugTitle.trim(),
            severity: bugSeverity,
          }
        : undefined,
    });
    if (res.error) {
      setSaving(false);
      setMsg(res.error);
      return;
    }
    // Sukses: tutup modal dengan animasi (data sudah dipatch ke daftar induk).
    setClosing(true);
  };

  /**
   * Simpan hasil eksekusi. Satu penjagaan penting di depan: selama masih ada bug
   * aktif (Open / In Progress) yang menempel ke hasil ini, statusnya WAJIB
   * Failed — jadi mengubahnya ke Passed/Skipped/Blocked harus lebih dulu
   * menyelesaikan bug-nya (dialog konflik di bawah). Server menegakkan aturan
   * yang sama, jadi UI yang dilewati tetap ditolak.
   */
  const save = async () => {
    if (saving || resolving) return; // penjaga double-click
    setMsg(null);

    // Validasi khusus mode Fail: judul bug + langkah reproduksi wajib diisi.
    if (isFail) {
      if (!bugTitle.trim()) {
        setMsg("Judul bug wajib diisi.");
        return;
      }
      if (!actualResult.trim()) {
        setMsg("Actual result / langkah reproduksi wajib diisi.");
        return;
      }
    }

    // Blocked wajib menyertakan alasan (penjaga kedua di server action).
    if (status === "BLOCKED" && !notes.trim()) {
      setMsg("Alasan Blocked wajib diisi.");
      return;
    }

    if (status !== "FAIL" && itemActiveBugs.length > 0) {
      setBugConflictOpen(true);
      return;
    }

    await performSave();
  };

  /**
   * Selesaikan konflik status: tutup bug (dianggap sudah diperbaiki) ATAU
   * lepaskan bug dari run (jadi General Findings), lalu lanjutkan simpan dengan
   * status yang dipilih QA.
   */
  const resolveBugConflict = async (choice: "close" | "detach") => {
    if (resolving || saving) return;
    setResolving(choice);
    setMsg(null);
    const ids = itemActiveBugs.map((b) => b.id);
    for (const id of ids) {
      const res =
        choice === "close" ? await updateBugStatus(id, "CLOSED") : await detachBugFromRun(id);
      if (res?.error) {
        setResolving(null);
        setMsg(res.error);
        return;
      }
    }
    onBugsResolved?.(ids, choice);
    setResolving(null);
    setBugConflictOpen(false);
    await performSave();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detail & Eksekusi"
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
        // Backdrop: fade in/out.
        opacity: shown ? 1 : 0,
        transition: "opacity 300ms ease-out",
      }}
      onClick={() => setClosing(true)}
    >
      <div
        ref={gridRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "min(1280px, calc(100vw - 48px))",
          height: "min(860px, calc(100vh - 48px))",
          // Flex row: lebar HANYA diatur di panel (bukan di kontennya).
          display: "flex",
          flexDirection: "row",
          userSelect: dragging ? "none" : undefined,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          // Kotak modal: fade + scale + naik sedikit (translate-y-2 -> 0).
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
          transition: "opacity 300ms ease-out, transform 300ms ease-out",
          willChange: "opacity, transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== KOLOM KIRI — info detail Test Case =====
            Berisi ID & judul, metadata, skenario, expected result, dan test
            steps. Lebarnya bisa diubah lewat divider di sebelah kanannya. */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 480,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* ID + Judul Test Case */}
          <div style={{ minWidth: 0 }}>
            {tc && (
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.72rem", color: "#9CA3AF", fontWeight: 500 }}>
                {tc.tcId}
              </span>
            )}
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0.3rem 0 0", color: "#111827", lineHeight: 1.35 }}>
              {item.titleSnapshot}
            </h2>
          </div>

          {/* Metadata */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "1rem",
              background: "rgba(248, 250, 252, 0.5)",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Priority</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{formatCase(tc?.priority) || "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Status</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{formatCase(tc?.status) || "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Author</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{tc?.createdBy?.name ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Dibuat</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>
                {tc?.createdAt
                  ? new Date(tc.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"}
              </span>
            </div>
          </div>

          {/* Skenario */}
          {tc?.scenario && (
            <div>
              <h4 style={sectionLabel}>Deskripsi / Skenario</h4>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#1E293B", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {tc.scenario}
              </p>
            </div>
          )}

          {/* Precondition — ditampilkan setelah Deskripsi/Skenario. */}
          {tc?.precondition?.trim() && (
            <div>
              <h4 style={sectionLabel}>Precondition</h4>
              <ul
                style={{
                  margin: 0,
                  background: "rgba(254, 243, 199, 0.4)",
                  border: "1px solid rgba(252, 211, 77, 0.5)",
                  borderRadius: 8,
                  padding: "0.7rem 1rem 0.7rem 1.8rem",
                  fontSize: "0.75rem",
                  color: "#1E293B",
                  lineHeight: 1.6,
                }}
              >
                {tc.precondition
                  .split("\n")
                  // Buang bullet manual ("•", "-", "*") supaya tidak dobel
                  // dengan marker <li> bawaan browser.
                  .map((line) => line.trim().replace(/^[•\-*]\s*/, "").trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            </div>
          )}

          {/* Test Data — parameter data uji (key-value / list) apa adanya.
              Teks polos (light) + tombol salin ringkas, selaras dengan
              Deskripsi & Expected Result. */}
          {tc?.testData?.trim() && (
            <div>
              <h4 style={sectionLabel}>Test Data</h4>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <p
                  style={{
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    fontSize: "0.75rem",
                    color: "#1E293B",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {tc.testData}
                </p>
                <button
                  type="button"
                  onClick={() => void copyTestData()}
                  title={testDataCopied ? "Tersalin" : "Salin Test Data"}
                  aria-label="Salin Test Data"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "#64748B",
                    cursor: "pointer",
                    lineHeight: 1,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#64748B")}
                >
                  {testDataCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Expected Result */}
          {tc?.expectedResult && (
            <div>
              <h4 style={sectionLabel}>Expected Result</h4>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#1E293B", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {tc.expectedResult}
              </p>
            </div>
          )}

          {/* Test Steps */}
          {stepsList.length > 0 && (
            <div>
              <h4 style={sectionLabel}>Test Steps</h4>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)", color: "#6B7280", textAlign: "left" }}>
                    <tr>
                      <th style={{ padding: "0.5rem 0.6rem", width: 44, textAlign: "center", fontWeight: 600, borderRight: "1px solid var(--border)" }}>#</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Step Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepsList.map((step, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.6rem", textAlign: "center", fontWeight: 600, color: "#9CA3AF", borderRight: "1px solid var(--border)" }}>{i + 1}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "#374151", lineHeight: 1.55 }}>{step}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ===== DIVIDER INTERAKTIF — drag kiri/kanan untuk ubah lebar kolom =====
            Area drag 8px dengan garis 2px di tengahnya; menyala amber saat
            hover/drag. Bisa juga digeser dengan tombol panah saat difokus. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ubah lebar panel"
          aria-valuenow={Math.round(splitPct)}
          aria-valuemin={SPLIT_MIN_PCT}
          aria-valuemax={SPLIT_MAX_PCT}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onMouseEnter={() => setDividerActive(true)}
          onMouseLeave={() => setDividerActive(false)}
          onFocus={() => setDividerActive(true)}
          onBlur={() => setDividerActive(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setSplitPct((p) => clampSplit(p - 2));
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setSplitPct((p) => clampSplit(p + 2));
            }
          }}
          style={{
            flex: `0 0 ${SPLIT_DIVIDER_W}px`,
            display: "flex",
            justifyContent: "center",
            cursor: "col-resize",
            userSelect: "none",
            touchAction: "none",
            outline: "none",
          }}
        >
          {/* Garis tipis indikator — amber saat hover/drag/fokus. */}
          <div
            aria-hidden="true"
            style={{
              width: 2,
              height: "100%",
              background: dragging || dividerActive ? "#FBBF24" : "#E2E8F0",
              transition: "background-color 0.15s ease",
            }}
          />
        </div>

        {/* ===== KOLOM KANAN — panel aksi eksekusi QA =====
            Latar tipis memisahkannya dari kolom info (batasnya kini divider
            interaktif). Judul & tombol status tetap di atas (tidak ikut
            scroll); isi form + tombol simpan berada di bawahnya. */}
        <div
          style={{
            // Lebar panel (bukan kontennya). Konten di dalam selalu 100%.
            flex: "0 0 auto",
            width: `${100 - splitPct}%`,
            minWidth: 420,
            maxWidth: "60%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            // Panel putih, sama seperti kolom kiri — pemisahnya hanya garis tipis.
            background: "#FFFFFF",
            borderLeft: "1px solid #EEF1F5",
            fontFamily: FONT_SANS,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              flexShrink: 0,
              padding: "20px 18px 14px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Eksekusi</span>
            <button
              type="button"
              className="btn-radius-9"
              onClick={onClose}
              aria-label="Tutup"
              style={{
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={18} color="#64748B" aria-hidden="true" />
            </button>
          </div>

          {/* Result selector — di ATAS, langsung di bawah header. Padding
              horizontal mengikuti body (p-6); jarak ke divider diatur oleh
              margin divider, bukan padding di sini. */}
          <div style={{ flexShrink: 0, padding: "0 24px" }}>
            <div
              role="radiogroup"
              aria-label="Hasil eksekusi"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 4,
                padding: 4,
                background: "#EEF1F5",
                borderRadius: 12,
              }}
            >
              {RESULT_OPTIONS.map((o) => {
                const active = status === o.value;
                const Icon = o.icon;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!editable}
                    title={active ? "Klik lagi untuk membatalkan (Untested)" : `Tandai ${o.label}`}
                    onClick={() => setStatus(active ? "NOT_RUN" : o.value)}
                    className="btn-radius-9"
                    style={{
                      height: 40,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      color: active ? o.color : "#475569",
                      background: active ? "#FFFFFF" : "transparent",
                      border: active ? `1px solid ${o.tint}` : "none",
                      boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.06)" : "none",
                      cursor: editable ? "pointer" : "not-allowed",
                      opacity: editable ? 1 : 0.6,
                      // Pilihan aktif bertransisi halus (tanpa ubah layout/DOM).
                      transition:
                        "background-color var(--dur-base, 200ms) var(--ease-in-out, ease-in-out), border-color var(--dur-base, 200ms) var(--ease-in-out, ease-in-out), color var(--dur-base, 200ms) var(--ease-in-out, ease-in-out), box-shadow var(--dur-base, 200ms) var(--ease-in-out, ease-in-out)",
                    }}
                  >
                    <Icon size={15} strokeWidth={2.2} aria-hidden="true" style={{ color: o.color }} />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Isi eksekusi — HANYA bagian ini yang scroll. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: "auto",
              // Padding standar panel (p-6: 24px) — ATAS sengaja 0 supaya jarak
              // tombol status → divider diatur `marginTop` divider (mt-4) tepat
              // 16px, bukan ditumpuk padding container.
              padding: "0 24px 24px",
              display: "flex",
              flexDirection: "column",
              // Jarak baku antar elemen form (mb-4 = 16px).
              gap: FORM_GAP,
            }}
          >
            {/* Divider di bawah kelompok tombol status — SELALU tampil pada
                SEMUA status (Pass/Fail/Blocked/Skipped), bukan hanya Blocked.
                `marginTop` = mt-4 (16px dari tombol); jarak ke field pertama di
                bawahnya datang dari `gap` body (mb-4). */}
            <div aria-hidden="true" style={{ ...FORM_DIVIDER, marginTop: "1rem" }} />

            {/* Field kondisional: SKIPPED wajib menyertakan alasan. */}
            {status === "SKIPPED" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label htmlFor="skip-reason" style={FORM_LABEL}>
                  Alasan Skipped <span style={{ color: "#B91C1C" }}>*</span>
                </label>
                <Select
                  id="skip-reason"
                  value={skippedReason}
                  onChange={(e) => setSkippedReason(e.target.value)}
                  disabled={!editable}
                  ariaLabel="Alasan Skipped"
                  style={{ height: 40, fontSize: 14, fontWeight: 500 }}
                >
                  <option value="">Pilih alasan…</option>
                  {SKIP_REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>

                {/* Keterangan wajib hanya saat alasannya "Lainnya". */}
                {skippedReason === SKIP_REASON_OTHER && (
                  <div style={{ display: "flex", flexDirection: "column", marginTop: FORM_GAP }}>
                    <label htmlFor="skip-reason-note" style={FORM_LABEL}>
                      Keterangan Alasan <span style={{ color: "#B91C1C" }}>*</span>
                    </label>
                    <ListTextarea
                      value={skippedReasonNote}
                      onChange={setSkippedReasonNote}
                      disabled={!editable}
                      rows={2}
                      ariaLabel="Keterangan Alasan"
                      placeholder="Masukkan alasan test case di-skip..."
                      style={{
                        padding: "10px 12px",
                        lineHeight: 1.5,
                        resize: "vertical",
                        border: "1px solid #DDE2E9",
                        borderRadius: 10,
                        fontSize: 14,
                        color: "#0F172A",
                        background: "#fff",
                        outline: "none",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Field kondisional: BLOCKED wajib menyertakan alasan. Disimpan di
                kolom `notes` (sama seperti catatan hasil PASS). */}
            {status === "BLOCKED" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={FORM_LABEL}>
                  Notes <span style={{ color: "#B91C1C" }}>*</span>
                </label>
                <ListTextarea
                  value={notes}
                  onChange={setNotes}
                  disabled={!editable}
                  rows={3}
                  required
                  ariaLabel="Notes"
                  placeholder="Masukkan alasan kenapa test case ini di-block (contoh: API server down, dependency fitur belum selesai, dll)"
                  style={{
                    padding: "10px 12px",
                    lineHeight: 1.5,
                    resize: "vertical",
                    border: "1px solid #DDE2E9",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "#0F172A",
                    background: "#fff",
                    outline: "none",
                  }}
                />
              </div>
            )}

            {/* Catatan subtle: bug lama di-Closed otomatis saat bug baru disimpan. */}
            {isFail && activeBug && bugMode === "new" && (
              <div style={{ fontSize: 12, fontWeight: 400, color: "#64748B" }}>
                Bug lama akan otomatis ditandai Closed saat bug baru disimpan.
              </div>
            )}

            {showBugForm ? (
              /* ===== State B — Fail terpilih, laporkan bug baru ===== */
              <>
                {activeBug && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={useCurrentBug}
                      disabled={!editable}
                      style={{
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: bugMode === "edit" ? 600 : 500,
                        color: bugMode === "edit" ? "#0F172A" : "#64748B",
                        textDecoration: bugMode === "edit" ? "underline" : "none",
                        cursor: "pointer",
                      }}
                    >
                      Edit Bug Aktif
                    </button>
                    <button
                      type="button"
                      onClick={startNewBug}
                      disabled={!editable}
                      style={{
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: bugMode === "new" ? 600 : 500,
                        color: bugMode === "new" ? "#0F172A" : "#64748B",
                        textDecoration: bugMode === "new" ? "underline" : "none",
                        cursor: "pointer",
                      }}
                    >
                      Laporkan Bug Baru
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label htmlFor="bug-title" style={FORM_LABEL}>
                    Bug Title <span style={{ color: "#B91C1C" }}>*</span>
                  </label>
                  <input
                    id="bug-title"
                    type="text"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    disabled={!editable}
                    placeholder="Ringkasan singkat isu/bug yang ditemukan…"
                    className="exec-field"
                    style={{
                      height: 40,
                      boxSizing: "border-box",
                      padding: "0 12px",
                      border: "1px solid #DDE2E9",
                      borderRadius: 10,
                      fontSize: 14,
                      color: "#0F172A",
                      background: "#fff",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label htmlFor="bug-severity" style={FORM_LABEL}>
                      Severity
                    </label>
                    <div style={{ position: "relative" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: sevColor(bugSeverity),
                        }}
                      />
                      <select
                        id="bug-severity"
                        value={bugSeverity}
                        onChange={(e) => setBugSeverity(e.target.value)}
                        disabled={!editable}
                        className="exec-field"
                        style={{
                          width: "100%",
                          height: 40,
                          boxSizing: "border-box",
                          appearance: "none",
                          padding: "0 32px 0 28px",
                          border: "1px solid #DDE2E9",
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#0F172A",
                          background: "#fff",
                          outline: "none",
                        }}
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#64748B",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label htmlFor="bug-env" style={FORM_LABEL}>
                      Environment{" "}
                      <span style={{ fontWeight: 400, color: "#64748B" }}>(dari Test Run)</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="bug-env"
                        type="text"
                        value={environment ?? "—"}
                        readOnly
                        disabled
                        title="Environment mengikuti Test Run terkait."
                        style={{
                          width: "100%",
                          height: 40,
                          boxSizing: "border-box",
                          padding: "0 32px 0 12px",
                          border: "1px solid #E3E7EE",
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#475569",
                          background: "#F8FAFC",
                          outline: "none",
                        }}
                      />
                      <Lock
                        size={14}
                        aria-label="Tidak bisa diubah"
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#94A3B8",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={FORM_LABEL}>
                    Bug Detail <span style={{ color: "#B91C1C" }}>*</span>
                  </label>
                  <ListTextarea
                    value={actualResult}
                    onChange={setActualResult}
                    disabled={!editable}
                    rows={5}
                    ariaLabel="Bug Detail"
                    placeholder="Jelaskan hasil aktual dan langkah reproduksi ditemukannya bug…"
                    style={{
                      height: 112,
                      padding: "10px 12px",
                      lineHeight: 1.5,
                      resize: "vertical",
                      border: "1px solid #DDE2E9",
                      borderRadius: 10,
                      fontSize: 14,
                      color: "#0F172A",
                      background: "#fff",
                      outline: "none",
                    }}
                  />
                </div>
              </>
            ) : (
              /* ===== State A — hasil sudah tercatat ===== */
              <>
                {/* Section Actual Result hanya relevan untuk hasil Fail/Blocked. */}
                {showActualResultBlock && (
                  <div
                    style={{
                      background: "#FFFBFB",
                      border: "1px solid #FBE1E1",
                      borderRadius: 12,
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>
                      Actual Result
                    </span>
                    <BulletText text={actualResult} />
                  </div>
                )}

                {/* Notes — hanya muncul saat status PASS (opsional). */}
                {status === "PASS" && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={FORM_LABEL}>Notes</span>
                    {editable ? (
                      <ListTextarea
                        value={notes}
                        onChange={setNotes}
                        rows={3}
                        ariaLabel="Notes"
                        placeholder="Tambahkan catatan eksekusi jika ada…"
                        style={{
                          padding: "10px 12px",
                          lineHeight: 1.5,
                          resize: "vertical",
                          border: "1px solid #DDE2E9",
                          borderRadius: 10,
                          fontSize: 14,
                          color: "#0F172A",
                          background: "#fff",
                          outline: "none",
                        }}
                      />
                    ) : (notes ?? "").trim() ? (
                      <p style={{ margin: 0, fontSize: 14, color: "#1E293B", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {notes}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, color: "#94A3B8" }}>Tidak ada catatan.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Evidence — tampil untuk Pass/Fail/Blocked, tersembunyi saat
                Skipped (dan saat belum ada status yang dipilih). Semua file baru
                ditahan di klien dulu (`deferred`) dan baru diunggah ke R2 saat
                Simpan; Batal membuangnya. Di Pass, evidence opsional. */}
            {showsEvidence && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    Evidence{" "}
                    <span style={{ fontWeight: 400, color: "#64748B" }}>
                      · {(item.attachments ?? []).length + pendingEvidence}
                    </span>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => evidenceRef.current?.pick()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#0F172A",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Plus size={14} aria-hidden="true" /> Tambah File
                    </button>
                  )}
                </div>
                <AttachmentsPanel
                  owner={{ testRunResultId: item.id }}
                  attachments={item.attachments ?? []}
                  canEdit={editable}
                  onChange={onAttachmentsChange}
                  onPendingChange={setPendingEvidence}
                  handleRef={evidenceRef}
                  deferred
                  compact
                  plain
                  hideTrigger
                />
              </div>
            )}

            {renderBugHistory()}
          </div>

          {/* Footer — selalu di dasar panel (bukan ikut scroll). */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              padding: "14px 24px",
              borderTop: "1px solid #EEF1F5",
              background: "#FFFFFF",
              flexWrap: "wrap",
            }}
          >
            {editable && msg && (
              <span style={{ marginRight: "auto", fontSize: 13, color: "#B91C1C" }}>{msg}</span>
            )}

            {canEdit &&
              (!editable ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="btn-radius-10"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 40,
                    padding: "0 16px",
                    border: "1px solid #FFC348",
                    background: "#FFC348",
                    color: "#0F172A",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  <Pencil size={16} aria-hidden="true" /> Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="btn-radius-10"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 14px",
                      border: "1px solid #DDE2E9",
                      background: "#fff",
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: saving ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || saveBlocked}
                    className="btn-radius-10"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 16px",
                      border: `1px solid ${saveBlocked ? "#FDE68A" : "#FFC348"}`,
                      background: saveBlocked ? "#FDE68A" : "#FFC348",
                      color: saveBlocked ? "rgba(217, 119, 6, 0.7)" : "#0F172A",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: saving ? "wait" : saveBlocked ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: saveBlocked ? 0.6 : 1,
                      pointerEvents: saveBlocked ? "none" : undefined,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                  >
                    {saving ? "Menyimpan..." : isFail && bugMode === "new" ? "Simpan Bug Baru" : "Simpan Eksekusi"}
                  </button>
                </>
              ))}
          </div>
        </div>
      </div>
      {/* Dialog konflik status: selama bug masih aktif, TC wajib Failed. */}
      {bugConflictOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Bug aktif pada test case ini"
          onClick={() => {
            if (!resolving) setBugConflictOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 250,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.45)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 24px 48px rgba(15, 23, 42, 0.25)",
              padding: "22px 24px",
              fontFamily: FONT_SANS,
            }}
          >
            <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
              Masih ada {itemActiveBugs.length} bug aktif
            </h4>
            <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: "21px", color: "#475569" }}>
              Status test case seharusnya <strong>Failed</strong> selama bug-nya masih Open / In
              Progress. Pilih cara menyelesaikannya sebelum status diubah:
            </p>
            {msg && (
              <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "#B91C1C" }}>
                {msg}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn-radius-10"
                onClick={() => void resolveBugConflict("close")}
                disabled={!!resolving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #FFC348",
                  background: "#FFC348",
                  color: "#0F172A",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: resolving ? "not-allowed" : "pointer",
                }}
              >
                {resolving === "close" ? (
                  <>
                    <Spinner size={14} /> Menutup bug…
                  </>
                ) : (
                  <>
                    <Check size={15} aria-hidden="true" /> Tutup bug &amp; simpan
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn-radius-10"
                onClick={() => void resolveBugConflict("detach")}
                disabled={!!resolving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #FCA5A5",
                  background: "#fff",
                  color: "#B91C1C",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: resolving ? "not-allowed" : "pointer",
                }}
              >
                {resolving === "detach" ? (
                  <>
                    <Spinner size={14} /> Melepas bug…
                  </>
                ) : (
                  <>
                    <Unlink size={15} aria-hidden="true" /> Lepas dari run &amp; simpan
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn-radius-10"
                onClick={() => setBugConflictOpen(false)}
                disabled={!!resolving}
                style={{
                  height: 36,
                  border: "none",
                  borderRadius: 10,
                  background: "transparent",
                  color: "#475569",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: resolving ? "not-allowed" : "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast modal ini — dipakai untuk umpan balik ubah status bug. */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>,
    document.body
  );
}
