"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatCase } from "@/lib/format";
import { useRefresh } from "@/lib/client/refresh-context";
import {
  AlertCircle,
  Check,
  ChevronDown,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  FolderInput,
  History,
  Loader2,
  Plus,
  Search,
  Table,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  createTestCase,
  deleteTestCase,
  importTestCases,
  quickUpdateTestCase,
  updateTestCase
} from "@/lib/actions/test-cases";
import {
  createSection,
  deleteSection as deleteSectionAction,
  moveSectionToSuite,
  moveTestCasesToTarget,
  renameSection as renameSectionAction,
  reorderSections,
} from "@/lib/actions/sections";
import { ConfirmDialog } from "@/components/ui/feedback";
import { MONO, SANS } from "@/components/reports/report-tokens";

import {
  PrimaryButton,
  SecondaryButton,
  smallPrimaryButtonStyle,
  toolbarButtonStyle,
} from "@/components/ui/button";
import { AddSectionModal } from "./add-section-modal";
import { ImportWizardModal } from "./import-wizard-modal";
import { MoveTargetModal, type MoveTarget } from "./move-target-modal";
import { SectionCard } from "./section-card";
import { TestCaseForm } from "./test-case-form";
import { TestCaseTable } from "./test-case-table";
import {
  IMPORT_BATCH_SIZE,
  TC_EXPORT_HEADER,
  exportMenuItem,
  type TestCase
} from "./test-cases-shared";

export function TestCasesManager({
  suiteId,
  suiteName,
  projectId,
  testCases,
  sections = [],
  canEdit = true,
  initialEditTcId = null,
  onCountChange,
}: {
  suiteId: string;
  suiteName: string;
  /** Project pemilik suite ini — membatasi pilihan Suite tujuan saat memindahkan. */
  projectId: string;
  testCases: TestCase[];
  sections?: { id: string; name: string; description: string | null }[];
  canEdit?: boolean;
  initialEditTcId?: string | null;
  /** Penyesuaian angka "Total Test" di header halaman saat TC keluar dari suite ini. */
  onCountChange?: (deltaTc: number) => void;
}) {
  const refresh = useRefresh();
  // Cermin lokal daftar test case: mutasi add/delete di-update in-place di
  // state ini (tanpa refresh satu halaman penuh), disinkronkan ulang dari
  // prop saat parent me-refetch (prop server otoritatif).
  const [localTestCases, setLocalTestCases] = useState<TestCase[]>(testCases);
  // Cermin lokal daftar Section: rename/pindah TC di-update in-place supaya
  // tidak memicu reload halaman (prop server tetap otoritatif saat berubah).
  const [localSections, setLocalSections] = useState(sections);
  useEffect(() => {
    setLocalSections(sections);
  }, [sections]);
  useEffect(() => {
    setLocalTestCases(testCases);
  }, [testCases]);
  // Anchor untuk toolbar di header halaman (diisi via useEffect setelah mount)
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("suite-header-actions");
    setHeaderAnchor(el);
  }, []);

  /** Pencarian TC di toolbar (tcId + judul) — filter di klien, tanpa refetch. */
  const [query, setQuery] = useState("");
  /** Dropdown Export: posisi menu dihitung `fixed` agar tidak terpotong header. */
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPos, setExportPos] = useState<{ top: number; right: number } | null>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Tutup menu Export saat klik di luar, Escape, scroll, atau resize.
  // Menu dirender via portal ke document.body, jadi pengecekan pakai data-attr.
  useEffect(() => {
    if (!exportOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (exportBtnRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest?.("[data-export-menu]")) return;
      setExportOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    const onScrollOrResize = () => setExportOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [exportOpen]);

  const openExportMenu = () => {
    const rect = exportBtnRef.current?.getBoundingClientRect();
    if (rect) setExportPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setExportOpen(true);
  };

  const [addingTc, setAddingTc] = useState(false);
  const [editingTcId, setEditingTcId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Deep-link ?edit=<tcId>: buka modal edit Test Case langsung saat mount.
  // Dicek dari PROP `testCases` (sumber otoritatif) — bukan cermin lokal — supaya
  // dependensinya lengkap: menambah `localTestCases` ke deps akan membuka ulang
  // modal ini setiap kali daftar lokal berubah (mis. setelah TC lain diedit).
  useEffect(() => {
    if (initialEditTcId && testCases.some((t) => t.id === initialEditTcId)) {
      setEditingTcId(initialEditTcId);
    }
  }, [initialEditTcId, testCases]);

  // --- Section state (persist ke DB via server actions) ---
  const [showAddSection, setShowAddSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");
  // Section yang sedang menerima TC baru (klik "+ Tambah Case" di header section)
  const [addingTcFor, setAddingTcFor] = useState<string | null>(null);
  // Accordion state per section (session-only, tidak persist)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Drag & drop pindah TC antar section
  const [draggingTcId, setDraggingTcId] = useState<string | null>(null);
  // Bulk drag: section tujuan saat drag sedang berlangsung
  const [bulkDropTarget, setBulkDropTarget] = useState<string | null>(null);
  // Bulk move sedang diproses
  const [bulkMoving, setBulkMoving] = useState(false);
  // Permintaan pindah (SATU modal untuk TC tunggal, bulk TC, dan Section).
  const [moveRequest, setMoveRequest] = useState<
    | { kind: "testcase"; ids: string[]; label: string }
    | { kind: "section"; sectionId: string; label: string }
    | null
  >(null);
  // Drag & drop urutan SECTION (state berbeda dari drag TC → tidak saling ganggu).
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [sectionDropId, setSectionDropId] = useState<string | null>(null);
  // Modal detail test case (klik TC ID / title)
  const [detailTc, setDetailTc] = useState<TestCase | null>(null);
  // Modal konfirmasi hapus test case
  const [deleteTcTarget, setDeleteTcTarget] = useState<TestCase | null>(null);
  // Modal konfirmasi hapus section
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Bulk selection test case
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set());
  // Modal konfirmasi hapus bulk
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // Jumlah TC yang dihapus via bulk (disimpan agar label konsisten saat success)
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  // Toast notification
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>(
    {
      show: false,
      message: "",
      type: "success",
    }
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Progress bulk import
  const [upload, setUpload] = useState<{
    open: boolean;
    status: "processing" | "success" | "error";
    total: number;
    processed: number;
    failedRows: number[];
  }>({ open: false, status: "processing", total: 0, processed: 0, failedRows: [] });

  // Wizard import: modal dibuka LEBIH DULU (Step 1 upload), file dipilih dari
  // dalam modal -> Step 2 (preview & mapping).
  const [importOpen, setImportOpen] = useState(false);
  // Nama file yang dipilih (diisi segera, termasuk saat parsing gagal) + pesan
  // error parsing — keduanya dipakai state 2 (file card).
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    step: 1 | 2;
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ show: true, message, type });
    toastTimer.current = setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  const editingTc = localTestCases.find((t) => t.id === editingTcId) ?? null;

  /** Buka/tutup section: default COLLAPSED saat halaman pertama kali dimuat. */
  const isOpen = (id: string) => openSections[id] ?? false;

  /**
   * Patch `sectionId` TC di state lokal — pengganti refresh() supaya tabel
   * tidak berkedip ke skeleton setelah memindahkan TC.
   */
  const patchTcSection = (ids: string[], sectionId: string | null) =>
    setLocalTestCases((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, sectionId } : t))
    );

  /**
   * Jalankan permintaan pindah yang sedang aktif (TC tunggal / bulk TC / Section).
   *
   * Kalau tujuannya SUITE LAIN, barisnya keluar dari halaman ini sehingga harus
   * DIBUANG dari state lokal (bukan cuma di-patch). Kalau masih di suite yang
   * sama, cukup `sectionId`-nya yang di-patch.
   */
  const applyMove = async (target: MoveTarget) => {
    const req = moveRequest;
    if (!req) return;
    setBulkMoving(true);
    try {
      if (req.kind === "section") {
        const res = await moveSectionToSuite(req.sectionId, target.suiteId);
        if (res.error) {
          showToast(res.error, "error");
          return;
        }
        const movedTcCount = localTestCases.filter((t) => t.sectionId === req.sectionId).length;
        setLocalSections((prev) => prev.filter((s) => s.id !== req.sectionId));
        setLocalTestCases((prev) => prev.filter((t) => t.sectionId !== req.sectionId));
        clearSelection();
        setMoveRequest(null);
        showToast(`Section "${req.label}" berhasil dipindahkan.`, "success");
        if (movedTcCount > 0) onCountChange?.(-movedTcCount);
        return;
      }

      const ids = req.ids;
      const res = await moveTestCasesToTarget(ids, target.suiteId, target.sectionId);
      if (res.error) {
        showToast(res.error, "error");
        return;
      }
      const destName = res.targetSectionName ?? "Tanpa Section";
      if (target.suiteId === suiteId) {
        patchTcSection(ids, target.sectionId);
      } else {
        // Keluar dari suite ini → hilangkan dari daftar (dan angka header ikut turun).
        setLocalTestCases((prev) => prev.filter((t) => !ids.includes(t.id)));
        onCountChange?.(-ids.length);
      }
      clearSelection();
      setMoveRequest(null);
      showToast(`${ids.length} Test Case berhasil dipindahkan ke ${destName}`, "success");
    } catch {
      showToast("Gagal memindahkan. Coba lagi", "error");
    } finally {
      setBulkMoving(false);
    }
  };

  /**
   * Drop header Section di atas header Section lain → susun ulang urutan.
   * Mengubah state lokal lebih dulu (instan) lalu menyimpan urutannya.
   */
  const handleDropSection = (targetSectionId: string) => {
    const draggedId = draggingSectionId;
    setSectionDropId(null);
    setDraggingSectionId(null);
    if (!draggedId) return;
    const from = localSections.findIndex((s) => s.id === draggedId);
    const to = localSections.findIndex((s) => s.id === targetSectionId);
    if (from === -1 || to === -1 || from === to) return;

    const next = [...localSections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalSections(next);
    void reorderSections(suiteId, next.map((s) => s.id));
  };

  /** Drop handler: pindahkan 1 TC (drag biasa) atau semua TC terpilih (bulk drag). */
  const handleDropTc = async (tcId: string, sectionId: string | null, sectionName: string) => {
    const isBulk = selectedTcIds.size > 0 && selectedTcIds.has(tcId);
    const targetIds = isBulk ? Array.from(selectedTcIds) : [tcId];
    setBulkMoving(true);
    try {
      // Drag selalu di dalam suite yang sama; pindah antar-suite lewat modal.
      const res = await moveTestCasesToTarget(targetIds, suiteId, sectionId);
      if (res.error) {
        showToast(res.error, "error");
        return;
      }
      if (isBulk) clearSelection();
      patchTcSection(targetIds, sectionId);
      showToast(
        `${targetIds.length} Test Case berhasil dipindahkan ke ${res.targetSectionName ?? sectionName}`,
        "success"
      );
    } catch {
      showToast("Gagal memindahkan test case. Coba lagi", "error");
    } finally {
      setBulkMoving(false);
    }
  };

  const addSection = async () => {
    const title = sectionTitle.trim();
    if (!title) return;
    const res = await createSection(suiteId, { name: title, description: sectionDesc });
    if (res.success) {
      setSectionTitle("");
      setSectionDesc("");
      setShowAddSection(false);
      // Section baru langsung ditempel ke state lokal — TANPA refresh halaman
      // (aksi server mengembalikan section-nya, jadi tidak perlu refetch).
      // Section baru dibuka supaya langsung terlihat setelah dibuat.
      const created = res.section;
      if (created) {
        setLocalSections((prev) => [...prev, created]);
        setOpenSections((prev) => ({ ...prev, [created.id]: true }));
      }
    }
  };

  const toggleSection = (id: string) => {
    // Default COLLAPSED (sama dengan isOpen) supaya klik pertama membuka.
    setOpenSections((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  const deleteSection = async (id: string) => {
    const res = await deleteSectionAction(id);
    if (res.success) {
      // Server melepas semua TC section ini ke "Tanpa Section" — samakan di
      // state lokal supaya tidak perlu refresh satu halaman.
      setLocalTestCases((prev) =>
        prev.map((tc) => (tc.sectionId === id ? { ...tc, sectionId: null } : tc))
      );
      setLocalSections((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const renameSection = async (id: string, title: string) => {
    const res = await renameSectionAction(id, title);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    // Update nama di state lokal — tidak perlu reload halaman.
    setLocalSections((prev) => prev.map((s) => (s.id === id ? { ...s, name: title } : s)));
  };

  // --- Bulk selection helpers ---
  const toggleTcSelection = (tcId: string) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  };

  const toggleAllInList = (tcList: TestCase[]) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      const allSelected = tcList.every((t) => next.has(t.id));
      if (allSelected) {
        tcList.forEach((t) => next.delete(t.id));
      } else {
        tcList.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedTcIds(new Set());

  const bulkDelete = async () => {
    for (const tcId of Array.from(selectedTcIds)) {
      const fd = new FormData();
      fd.set("id", tcId);
      await deleteTestCase(fd);
    }
    const count = selectedTcIds.size;
    clearSelection();
    refresh();
    showToast(`${count} Test Case dihapus!`, "success");
  };

  // Grouping TC per section (dari DB sectionId) + unassigned.
  // Saat pencarian aktif, yang dirender hanya TC yang cocok (tcId atau judul)
  // dan section yang tidak punya hasil tidak ikut ditampilkan.
  const q = query.trim().toLowerCase();
  const visibleTestCases = q
    ? localTestCases.filter((t) => `${t.tcId} ${t.title}`.toLowerCase().includes(q))
    : localTestCases;
  const grouped: {
    section: { id: string; name: string; description: string | null };
    tcs: TestCase[];
  }[] = localSections
    .map((s) => ({
      section: s,
      tcs: visibleTestCases.filter((t) => t.sectionId === s.id),
    }))
    .filter((g) => !q || g.tcs.length > 0);
  const unassigned = visibleTestCases.filter((t) => !t.sectionId);
  /** Pencarian tidak menemukan apa pun (padahal TC-nya ada). */
  const searchMissed = q !== "" && visibleTestCases.length === 0 && localTestCases.length > 0;

  const handleDeleteTC = async (t: TestCase) => {
    const fd = new FormData();
    fd.set("id", t.id);
    await deleteTestCase(fd);
    setLocalTestCases((prev) => prev.filter((tc) => tc.id !== t.id));
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      next.delete(t.id);
      return next;
    });
    showToast("Test Case dihapus.", "success");
  };

  /** Update prioritas/status cepat dari dropdown — update in-place, tanpa refresh penuh. */
  const handleQuickUpdate = async (
    t: TestCase,
    data: {
      priority?: TestCase["priority"];
      status?: TestCase["status"];
      type?: TestCase["type"];
    }
  ) => {
    const res = await quickUpdateTestCase(t.id, data);
    if (!res.success) {
      showToast(res.error ?? "Gagal mengubah test case.", "error");
      return;
    }
    setLocalTestCases((prev) => prev.map((tc) => (tc.id === t.id ? { ...tc, ...data } : tc)));
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    // SPESIFIKASI HEADER CSV EXPORT — urutan & penamaan diambil dari
    // TC_EXPORT_HEADER supaya presisi dan tidak bisa melenceng.
    const sectionNameOf = (sectionId: string | null) =>
      localSections.find((s) => s.id === sectionId)?.name ?? "";
    const rows = localTestCases.map((t) => {
      const byHeader: Record<(typeof TC_EXPORT_HEADER)[number], string> = {
        section: sectionNameOf(t.sectionId),
        title: t.title,
        tcid: t.tcId,
        // Type ditulis dalam bentuk tampilan (Positive/Negative) agar konsisten
        // dengan contoh di template dan mudah dibaca ulang saat impor.
        type: t.type === "POSITIVE" ? "Positive" : t.type === "NEGATIVE" ? "Negative" : "",
        scenario: t.scenario ?? "",
        precondition: t.precondition ?? "",
        steps: t.steps ?? "",
        testData: t.testData ?? "",
        expectedResult: t.expectedResult ?? "",
        priority: t.priority,
        status: t.status,
      };
      return Object.fromEntries(TC_EXPORT_HEADER.map((h) => [h, byHeader[h]]));
    });
    // Nama file diberi timestamp tanggal-jam lokal supaya tiap download unik —
    // mencegah file lama dengan nama sama tertukar saat mau di-upload ulang.
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const fileName = `test-cases-${suiteName.replace(/\s+/g, "-").toLowerCase()}-${stamp}`;
    if (format === "csv") {
      const Papa = (await import("papaparse")).default;
      const csv = Papa.unparse(rows);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    }
  };

  const handleDownloadTemplate = () => {
    // Template memakai header yang persis sama dengan hasil export
    // (TC_EXPORT_HEADER) supaya keduanya kompatibel dua arah.
    const header = [...TC_EXPORT_HEADER];
    const example = [
      "Appeal", // section (opsional)
      "Login berhasil dengan kredensial valid", // title
      "", // tcid (kosong = auto-generate)
      "Positive", // type (hanya "Positive" atau "Negative")
      "User membuka halaman login dan memasukkan email + password yang benar", // scenario
      "User memiliki akun aktif dan koneksi internet", // precondition
      "Buka halaman login\nMasukkan email valid\nKlik tombol Masuk", // steps
      "", // testData
      "User masuk ke dashboard utama", // expectedResult
      "HIGH", // priority
      "ACTIVE", // status
    ];
    // Escape nilai yang mengandung koma/quote/baris baru
    const escapeCsv = (v: string) => {
      if (/[",\n]/.test(v)) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const csv = [
      // Baris komentar (diawali '#') sebagai instruksi template — diabaikan
      // parser saat file-nya di-upload kembali.
      '# Catatan: kolom "type" hanya menerima nilai "Positive" atau "Negative" (biarkan kosong bila belum dipilih).',
      header.join(","),
      example.map(escapeCsv).join(","),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-test-cases.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Baca & parse file import. Dipakai dua jalur: `<input type="file">` (tombol
   * "Pilih File dari Komputer" di modal) dan drag & drop ke dropzone modal.
   */
  const parseImportFile = (file: File) => {
    // Tampilkan file yang dipilih segera (state 2), termasuk bila parsing gagal.
    setImportFileName(file.name);
    setImportFileError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        let rows: Record<string, string>[];
        if (isCsv) {
          // CSV: baca sebagai teks UTF-8 (readAsBinaryString merusak encoding non-ASCII)
          const text = reader.result as string;
          // Hapus BOM (\uFEFF) dari awal file agar header pertama tidak terkontaminasi
          const cleanText = text.replace(/^\uFEFF/, "");
          // Buang baris komentar (diawali '#') — mis. catatan dari file template.
          const dataText = cleanText
            .split(/\r?\n/)
            .filter((line) => !line.trimStart().startsWith("#"))
            .join("\n");
          const Papa = (await import("papaparse")).default;
          rows = Papa.parse<Record<string, string>>(dataText, {
            header: true,
            skipEmptyLines: true,
          }).data;
        } else {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(reader.result as string, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        }

        if (rows.length === 0) {
          setImportPreview(null);
          setImportFileError("File tidak berisi data.");
          showToast("File tidak berisi data.", "error");
          return;
        }

        // Simpan header asli + data mentah. Step 1: konfirmasi file -> Step 2: mapping.
        setImportPreview({ step: 1, fileName: file.name, headers: Object.keys(rows[0]), rows });
      } catch (err) {
        console.error(err);
        setImportPreview(null);
        setImportFileError("Gagal membaca file. Pastikan format sesuai template.");
        showToast("Gagal membaca file. Pastikan format sesuai template.", "error");
      }
    };
    if (file.name.toLowerCase().endsWith(".csv")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  /** onChange hidden file input (dipicu dari dalam modal upload). */
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input supaya file yang sama bisa dipilih lagi.
    e.target.value = "";
    if (file) parseImportFile(file);
  };

  /** Lepas file terpilih → kembali ke state 1 (modal tetap terbuka). */
  const removeImportFile = () => {
    setImportPreview(null);
    setImportFileName(null);
    setImportFileError(null);
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Toolbar aksi dirender di header halaman (via portal ke #suite-header-actions) */}
      {headerAnchor &&
        canEdit &&
        createPortal(
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            {/* Pencarian TC di suite ini (tcId + judul). */}
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <Search
                size={14}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 11,
                  color: "#94A3B8",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                className="suite-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari test case..."
                aria-label="Cari test case"
                style={{
                  width: 220,
                  height: 36,
                  boxSizing: "border-box",
                  padding: "0 10px 0 32px",
                  border: "1px solid #DDE2E9",
                  borderRadius: 9,
                  background: "#FFFFFF",
                  color: "#0F172A",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>

            {/* Export: Template + CSV digabung jadi satu dropdown. */}
            <SecondaryButton
              ref={exportBtnRef}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => (exportOpen ? setExportOpen(false) : openExportMenu())}
              style={{
                ...toolbarButtonStyle,
                padding: "0 10px 0 12px",
                color: "#334155",
                fontWeight: 500,
              }}
            >
              <Download size={14} /> Export <ChevronDown size={13} style={{ color: "#64748B" }} />
            </SecondaryButton>

            <SecondaryButton
              onClick={() => setImportOpen(true)}
              style={{
                ...toolbarButtonStyle,
                padding: "0 12px",
                color: "#334155",
                fontWeight: 500,
              }}
            >
              <Upload size={14} /> Import
            </SecondaryButton>

            {!showAddSection && (
              <PrimaryButton
                onClick={() => setShowAddSection(true)}
                style={{ ...toolbarButtonStyle, padding: "0 14px", fontWeight: 600 }}
              >
                <Plus size={14} strokeWidth={2.4} /> Tambah Section
              </PrimaryButton>
            )}

            {/* Menu Export — portal + `fixed` supaya tidak terpotong header. */}
            {exportOpen &&
              exportPos &&
              createPortal(
                <div
                  role="menu"
                  data-export-menu
                  style={{
                    position: "fixed",
                    top: exportPos.top,
                    right: exportPos.right,
                    minWidth: 200,
                    background: "#FFFFFF",
                    border: "1px solid #DDE2E9",
                    borderRadius: 10,
                    boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
                    padding: 4,
                    zIndex: 300,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="row-action-item"
                    style={exportMenuItem}
                    onClick={() => {
                      setExportOpen(false);
                      handleDownloadTemplate();
                    }}
                  >
                    <FileText size={15} /> Download Template
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="row-action-item"
                    style={exportMenuItem}
                    onClick={() => {
                      setExportOpen(false);
                      void handleExport("csv");
                    }}
                  >
                    <Table size={15} /> Export CSV
                  </button>
                </div>,
                document.body
              )}
          </div>,
          headerAnchor
        )}

      {/* Wrapper card dihapus — bagian ini kini menyatu dengan card header suite. */}
      <div style={{ padding: "1.25rem" }}>
          {addingTc && (
            <div style={{ padding: "0 0 1rem" }}>
              <TestCaseForm
                title="Tambah Test Case Baru"
                suiteName={suiteName}
                suiteId={suiteId}
                submitLabel="Simpan"
                onCancel={() => {
                  setAddingTc(false);
                  setAddingTcFor(null);
                }}
                onSubmit={async (fd) => {
                  if (addingTcFor) fd.set("sectionId", addingTcFor);
                  const res = await createTestCase(fd);
                  if (res.success) {
                    const created = res.testCase;
                    if (created) {
                      setLocalTestCases((prev) => [...prev, created]);
                      setOpenSections((prev) =>
                        created.sectionId ? { ...prev, [created.sectionId]: true } : prev
                      );
                    }
                    setAddingTc(false);
                    setAddingTcFor(null);
                  }
                  return res;
                }}
              />
            </div>
          )}

          {editingTc && (
            <div style={{ padding: "0 0 1rem" }}>
              <TestCaseForm
                key={editingTc.id}
                title="Edit Test Case"
                suiteName={suiteName}
                suiteId={suiteId}
                initial={editingTc}
                submitLabel="Simpan Perubahan"
                onCancel={() => setEditingTcId(null)}
                onSubmit={async (fd) => {
                  fd.set("id", editingTc.id);
                  const res = await updateTestCase(fd);
                  if (res.success && res.testCase) {
                    const updated = res.testCase;
                    setLocalTestCases((prev) => prev.map((tc) => (tc.id === updated.id ? updated : tc)));
                    setEditingTcId(null);
                  }
                  return res;
                }}
              />
            </div>
          )}

          {/* Section cards + unassigned */}
          {grouped.map(({ section, tcs }) => (
            <SectionCard
              key={section.id}
              section={{ ...section, open: isOpen(section.id) }}
              tcs={tcs}
              canEdit={canEdit}
              addingTc={addingTc}
              editingTcId={editingTcId}
              draggingTcId={draggingTcId}
              onToggle={() => toggleSection(section.id)}
              onDelete={() => setSectionDeleteTarget({ id: section.id, name: section.name })}
              onRename={(title) => void renameSection(section.id, title)}
              onAddCase={() => {
                setAddingTcFor(section.id);
                setAddingTc(true);
              }}
              onEdit={(t) => setEditingTcId(t.id)}
              onDeleteTc={(t) => setDeleteTcTarget(t)}
              onDropTc={(tcId) => void handleDropTc(tcId, section.id, section.name)}
              onMoveTc={(t) =>
                setMoveRequest({ kind: "testcase", ids: [t.id], label: t.tcId })
              }
              onMoveSection={() =>
                setMoveRequest({ kind: "section", sectionId: section.id, label: section.name })
              }
              sectionDragOver={sectionDropId === section.id && draggingSectionId !== section.id}
              draggingSectionId={draggingSectionId}
              onSectionDragStart={() => setDraggingSectionId(section.id)}
              onSectionDragEnd={() => {
                setDraggingSectionId(null);
                setSectionDropId(null);
              }}
              onSectionDragOver={() => setSectionDropId(section.id)}
              onSectionDrop={() => handleDropSection(section.id)}
              onDragTcStart={setDraggingTcId}
              onDragTcEnd={() => setDraggingTcId(null)}
              onOpenDetail={(t) => setDetailTc(t)}
              selectedTcIds={selectedTcIds}
              onToggleTc={toggleTcSelection}
              onToggleAll={(list) => toggleAllInList(list)}
              onQuickUpdate={handleQuickUpdate}
            />
          ))}

          {/* Unassigned TC (belum masuk section mana pun) */}
          {unassigned.length > 0 && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingTcId) setBulkDropTarget("__none__");
              }}
              onDragLeave={() => setBulkDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingTcId) {
                  void handleDropTc(draggingTcId, null, "Unassigned Test Cases");
                }
                setBulkDropTarget(null);
              }}
              style={{
                marginBottom: "1rem",
                background: bulkDropTarget === "__none__" ? "rgba(251, 191, 36, 0.05)" : "#fff",
                border:
                  bulkDropTarget === "__none__" ? "1px solid #FBBF24" : "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                transition: "background 0.15s ease, border-color 0.15s ease",
                boxShadow:
                  bulkDropTarget === "__none__" ? "0 0 0 2px rgba(251, 191, 36, 0.25)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  // Padding vertikal 10px: tombol "Tambah Case" varian kecil (32px).
                  padding: "10px 0.9rem",
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Unassigned Test Cases</span>
                {/* Counter plain text */}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: "#6B7280",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({unassigned.length} Test Case{unassigned.length === 1 ? "" : "s"})
                </span>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {canEdit && !addingTc && editingTcId === null && (
                    <PrimaryButton
                      style={smallPrimaryButtonStyle}
                      onClick={() => {
                        setAddingTcFor(null);
                        setAddingTc(true);
                      }}
                    >
                      <Plus size={12} strokeWidth={2.6} /> Tambah Case
                    </PrimaryButton>
                  )}
                </div>
              </div>
              <div style={{ padding: "0.75rem" }}>
                <TestCaseTable
                  testCases={unassigned}
                  onEdit={(t) => setEditingTcId(t.id)}
                  onDelete={(t) => setDeleteTcTarget(t)}
                  canEdit={canEdit}
                  onDragTcStart={setDraggingTcId}
                  onDragTcEnd={() => setDraggingTcId(null)}
                  onMoveTc={(t) => setMoveRequest({ kind: "testcase", ids: [t.id], label: t.tcId })}
                  onOpenDetail={(t) => setDetailTc(t)}
                  selectedTcIds={selectedTcIds}
                  onToggleTc={toggleTcSelection}
                  onToggleAll={toggleAllInList}
                  onQuickUpdate={handleQuickUpdate}
                />
              </div>
            </div>
          )}

          {/* Pencarian tidak menemukan apa pun (TC-nya ada, tapi tidak cocok) */}
          {searchMissed && (
            <div
              style={{
                padding: "24px 12px",
                textAlign: "center",
                color: "#94A3B8",
                fontSize: 13,
              }}
            >
              Tidak ada test case yang cocok dengan “{query.trim()}”.
            </div>
          )}

          {/* Empty state seluruh suite */}
          {localTestCases.length === 0 && localSections.length === 0 && (
            <TestCaseTable
              testCases={[]}
              onEdit={(t) => setEditingTcId(t.id)}
              onDelete={(t) => setDeleteTcTarget(t)}
              canEdit={canEdit}
              onQuickUpdate={handleQuickUpdate}
            />
          )}
      </div>

      {/* Modal: Tambah Section Baru */}
      {showAddSection && (
        <AddSectionModal
          onClose={() => setShowAddSection(false)}
          onSave={addSection}
          sectionTitle={sectionTitle}
          setSectionTitle={setSectionTitle}
          sectionDesc={sectionDesc}
          setSectionDesc={setSectionDesc}
        />
      )}

      {/* Modal: Pindah tujuan — satu modal untuk TC tunggal, bulk TC, dan Section */}
      {moveRequest && (
        <MoveTargetModal
          mode={moveRequest.kind}
          count={moveRequest.kind === "testcase" ? moveRequest.ids.length : 1}
          itemLabel={moveRequest.label}
          currentSuiteId={suiteId}
          projectId={projectId}
          onClose={() => setMoveRequest(null)}
          onConfirm={applyMove}
        />
      )}

      {/* Modal: Detail Test Case */}
      {detailTc && (
        <TestCaseDetailModal
          tc={detailTc}
          canEdit={canEdit}
          onClose={() => setDetailTc(null)}
          onEdit={() => {
            setEditingTcId(detailTc.id);
            setDetailTc(null);
          }}
        />
      )}

      {/* Modal: Konfirmasi Hapus Test Case */}
      {deleteTcTarget && (
        <DeleteTestCaseModal
          tcTitle={deleteTcTarget.title}
          onClose={() => setDeleteTcTarget(null)}
          onConfirm={() => handleDeleteTC(deleteTcTarget)}
        />
      )}

      {/* Modal: Wizard Import (Step 1: upload file, Step 2: preview & mapping) */}
      {importOpen && (
        <ImportWizardModal
          // Kunci berubah saat file/header/error berganti → modal di-mount ulang
          // agar `mapping` (state internal) diinisialisasi dari header file baru.
          key={`${importFileName ?? ""}|${importPreview?.headers.join(",") ?? ""}|${
            importFileError ?? ""
          }`}
          step={importPreview?.step ?? 1}
          fileName={importFileName ?? ""}
          headers={importPreview?.headers ?? []}
          rows={importPreview?.rows ?? []}
          error={importFileError}
          onClose={() => {
            setImportOpen(false);
            setImportPreview(null);
            setImportFileName(null);
            setImportFileError(null);
          }}
          onPickFile={() => fileRef.current?.click()}
          onDropFile={parseImportFile}
          onDownloadTemplate={handleDownloadTemplate}
          onRemoveFile={removeImportFile}
          onProceedToPreview={() =>
            setImportPreview((prev) => (prev ? { ...prev, step: 2 } : prev))
          }
          onStartImport={async (mapping) => {
            // Tutup preview, buka modal progress, eksekusi dengan mapping
            const sourceRows = importPreview?.rows ?? [];
            setImportPreview(null);
            setImportOpen(false);
            setImportFileName(null);
            setImportFileError(null);
            const mappedRows = sourceRows.map((r) => {
              const mapped: Record<string, string> = {};
              for (const [header, field] of Object.entries(mapping)) {
                if (field) mapped[field] = r[header] ?? "";
              }
              return mapped;
            });
            const validRows = mappedRows.filter((r) => (r.title ?? "").trim());
            if (validRows.length === 0) {
              showToast("Tidak ada baris valid (Title kosong).", "error");
              return;
            }
            setUpload({
              open: true,
              status: "processing",
              total: validRows.length,
              processed: 0,
              failedRows: [],
            });

            let created = 0;
            const failedRows: number[] = [];
            // Impor per batch: satu round-trip untuk beberapa baris sekaligus,
            // progres tetap terlihat setiap batch selesai.
            for (let start = 0; start < validRows.length; start += IMPORT_BATCH_SIZE) {
              const batch = validRows.slice(start, start + IMPORT_BATCH_SIZE);
              try {
                const res = await importTestCases(
                  suiteId,
                  batch.map((r) => ({
                    section: r.section ?? "",
                    tcId: r.tcId ?? "",
                    title: r.title ?? "",
                    type: r.type ?? "",
                    priority: r.priority ?? "MEDIUM",
                    scenario: r.scenario ?? "",
                    precondition: r.precondition ?? "",
                    expectedResult: r.expectedResult ?? "",
                    steps: r.steps ?? "",
                    testData: r.testData ?? "",
                    status: r.status ?? "DRAFT",
                  }))
                );
                if (res.error) {
                  for (let k = 0; k < batch.length; k++) failedRows.push(start + k + 1);
                } else {
                  created += res.created ?? 0;
                  for (const idx of res.failedIndexes ?? []) failedRows.push(start + idx + 1);
                }
              } catch {
                for (let k = 0; k < batch.length; k++) failedRows.push(start + k + 1);
              }
              setUpload((prev) => ({
                ...prev,
                processed: Math.min(start + batch.length, validRows.length),
              }));
            }

            refresh();
            if (created > 0) {
              setUpload((prev) => ({ ...prev, status: "success" }));
              showToast(`Berhasil mengimpor ${created} Test Case!`, "success");
            } else {
              setUpload((prev) => ({ ...prev, status: "error", failedRows }));
              showToast("Tidak ada test case yang berhasil diimpor.", "error");
            }
          }}
        />
      )}

      {/* Modal: Progress Bulk Import */}
      {upload.open && (
        <BulkUploadProgressModal
          upload={upload}
          onClose={() => setUpload((prev) => ({ ...prev, open: false }))}
        />
      )}

      {/* Modal: Bulk Delete confirm */}
      {bulkDeleteOpen && (
        <DeleteTestCaseModal
          tcTitle={`${bulkDeleteCount} test case terpilih`}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={() => bulkDelete()}
        />
      )}

      {/* Floating Action Bar */}
      {selectedTcIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 240,
            background: "#fff",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.18)",
            borderRadius: 12,
            padding: "0.6rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
            animation: "modalIn 0.18s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              borderRight: "1px solid var(--border)",
              paddingRight: "1rem",
            }}
          >
            <span
              style={{
                background: "#F59E0B",
                color: "#000",
                fontSize: "0.72rem",
                fontWeight: 700,
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selectedTcIds.size}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#1F2937", fontWeight: 600 }}>
              {bulkMoving ? "Memindahkan..." : "Test Case Terpilih"}
            </span>
            {bulkMoving && (
              <Loader2
                size={14}
                style={{ color: "#F59E0B", animation: "spin 0.8s linear infinite" }}
              />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() =>
                setMoveRequest({
                  kind: "testcase",
                  ids: Array.from(selectedTcIds),
                  label: `${selectedTcIds.size} test case terpilih`,
                })
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                background: "#fff",
                border: "1px solid #D1D5DB",
                borderRadius: 3,
                color: "#374151",
                fontSize: "0.72rem",
                fontWeight: 400,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <FolderInput size={14} style={{ color: "var(--text-muted)" }} />
              Pindah Section / Suite
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkDeleteCount(selectedTcIds.size);
                setBulkDeleteOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 3,
                color: "#DC2626",
                fontSize: "0.72rem",
                fontWeight: 400,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEE2E2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#FEF2F2")}
            >
              <Trash2 size={14} style={{ color: "#EF4444" }} />
              Hapus ({selectedTcIds.size})
            </button>
          </div>

          <button
            type="button"
            onClick={clearSelection}
            title="Batal Pilih"
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.2rem",
              display: "flex",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Confirm hapus section */}
      <ConfirmDialog
        open={sectionDeleteTarget !== null}
        title="Hapus Section?"
        message={
          <>
            Section <strong>{sectionDeleteTarget?.name}</strong> akan dihapus. Test case di dalamnya
            akan kembali ke &quot;Unassigned Test Cases&quot; (tidak ikut terhapus).
          </>
        }
        onConfirm={() => {
          if (sectionDeleteTarget) void deleteSection(sectionDeleteTarget.id);
          setSectionDeleteTarget(null);
        }}
        onCancel={() => setSectionDeleteTarget(null)}
      />

      {/* Toast notification */}
      {toast.show && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "#fff",
            border: toast.type === "success" ? "1px solid #A7F3D0" : "1px solid #FECACA",
            boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.2)",
            borderRadius: 8,
            padding: "0.7rem 1rem",
            animation: "modalIn 0.18s ease-out",
          }}
        >
          <CheckCircle2
            size={20}
            style={{ color: toast.type === "success" ? "#10B981" : "#EF4444", flexShrink: 0 }}
          />
          <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "#1F2937" }}>
            {toast.message}
          </div>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => setToast((prev) => ({ ...prev, show: false }))}
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.15rem",
              display: "flex",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function TestCaseDetailModal({
  tc,
  canEdit,
  onClose,
  onEdit,
}: {
  tc: TestCase;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
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

  // Tombol Copy Test Data: umpan balik ikon ("Tersalin") selama 1.5 detik.
  const [copied, setCopied] = useState(false);
  const copyTestData = async () => {
    try {
      await navigator.clipboard.writeText(tc.testData ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard bisa diblokir browser — abaikan.
    }
  };

  // Steps: pisahkan per baris kalau ada, untuk tampilan step-by-step
  const stepsList = (tc.steps ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);

  // Teks polos berwarna (tanpa pill/box) untuk priority & status.
  const priorityText: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color:
      tc.priority === "CRITICAL"
        ? "#DC2626"
        : tc.priority === "HIGH"
          ? "#D97706"
          : tc.priority === "MEDIUM"
            ? "#2563EB"
            : "#64748B",
  };

  const statusText: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: tc.status === "ACTIVE" ? "#059669" : tc.status === "DRAFT" ? "#D97706" : "#DC2626",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#6B7280",
    letterSpacing: "0.01em",
    margin: "0 0 0.4rem",
  };

  /** Label kecil di atas tiap nilai metadata. */
  const metaLabel: React.CSSProperties = {
    display: "block",
    color: "#9CA3AF",
    fontWeight: 500,
    fontSize: "0.72rem",
    marginBottom: "0.25rem",
  };

  /**
   * Pemisah vertikal antar kolom metadata: 1px, tinggi sebanding tinggi teks
   * (label + nilai ±32px), rata tengah terhadap blok teksnya.
   * Warnanya `--border-strong` (#D1D5DB = gray-300) — sengaja lebih gelap dari
   * `--border` supaya garisnya benar-benar terlihat di atas latar kartu.
   */
  const metaDivider: React.CSSProperties = {
    width: 1,
    height: 32,
    background: "var(--border-strong)",
    flexShrink: 0,
    alignSelf: "center",
  };

  /**
   * Kolom-kolom metadata header, disusun sebagai array supaya penambahan item
   * baru otomatis mendapat pemisah vertikal — tanpa menambah divider manual.
   */
  const metaItems: { label: string; value: React.ReactNode; valueStyle: React.CSSProperties }[] = [
    { label: "Priority", value: formatCase(tc.priority), valueStyle: priorityText },
    { label: "Status", value: formatCase(tc.status), valueStyle: statusText },
    {
      label: "Author",
      value: tc.createdBy?.name ?? "—",
      valueStyle: { fontWeight: 600, color: "#1F2937", fontSize: "0.82rem" },
    },
    {
      label: "Dibuat",
      value: tc.createdAt
        ? new Date(tc.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
      valueStyle: { fontWeight: 500, color: "#374151", fontSize: "0.82rem" },
    },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detail ${tc.tcId}`}
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
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — divider di-inset selebar padding modal (sejajar konten). */}
        <div style={{ padding: "1.25rem 1.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "0.75rem",
              paddingBottom: "0.85rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.72rem",
                  color: "#9CA3AF",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                }}
              >
                {tc.tcId}
              </span>
              <h2
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  margin: "0.3rem 0 0",
                  color: "#111827",
                  lineHeight: 1.35,
                }}
              >
                {tc.title}
              </h2>
            </div>
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
                color: "var(--text-muted)",
                borderRadius: 6,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1rem 1.5rem 1.25rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Metadata: kolom sama lebar, dipisah garis vertikal 1px (gray-300,
              self-center) yang rata tengah. Jarak 1rem di kiri-kanan tiap garis
              supaya judul & value tidak menempel ke pembatasnya. */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            {metaItems.map((item, index) => (
              <Fragment key={item.label}>
                {index > 0 && (
                  <div aria-hidden="true" style={{ ...metaDivider, margin: "0 1rem" }} />
                )}
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <span style={metaLabel}>{item.label}</span>
                  <span style={item.valueStyle}>{item.value}</span>
                </div>
              </Fragment>
            ))}
          </div>

          {/* Deskripsi / Skenario */}
          <div>
            <h4 style={sectionLabel}>Deskripsi / Skenario</h4>
            <p
              style={{
                margin: 0,
                fontSize: "0.88rem",
                color: "#374151",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {tc.scenario || (
                <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>Tidak ada deskripsi.</span>
              )}
            </p>
          </div>

          {/* Pre-conditions */}
          <div>
            <h4 style={sectionLabel}>Precondition</h4>
            {tc.precondition ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.2rem",
                  fontSize: 12,
                  fontWeight: 400,
                  color: "#334155",
                  lineHeight: 1.6,
                }}
              >
                {tc.precondition
                  .split("\n")
                  // Buang bullet manual ("•", "-", "*") supaya tidak dobel
                  // dengan marker <li> bawaan browser.
                  .map((line) =>
                    line
                      .trim()
                      .replace(/^[•\-*]\s*/, "")
                      .trim()
                  )
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}>
                Tidak ada pre-condition.
              </p>
            )}
          </div>

          {/* Test Data — teks mono polos + aksi Copy */}
          {tc.testData && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  marginBottom: "0.4rem",
                }}
              >
                <h4 style={{ ...sectionLabel, margin: 0 }}>Test Data</h4>
                <button
                  type="button"
                  onClick={() => void copyTestData()}
                  title={copied ? "Tersalin" : "Copy Test Data"}
                  aria-label="Copy Test Data"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: copied ? "#059669" : "#94A3B8",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!copied) e.currentTarget.style.color = "#475569";
                  }}
                  onMouseLeave={(e) => {
                    if (!copied) e.currentTarget.style.color = "#94A3B8";
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Tersalin" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 12,
                  fontWeight: 400,
                  color: "#334155",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {tc.testData}
              </pre>
            </div>
          )}

          {/* Expected Result (dedicated section) */}
          <div>
            <h4 style={sectionLabel}>Expected Result</h4>
            {tc.expectedResult ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: "#374151",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {tc.expectedResult}
              </p>
            ) : (
              <p style={{ margin: 0, color: "#9CA3AF", fontStyle: "italic", fontSize: "0.85rem" }}>
                Tidak ada expected result.
              </p>
            )}
          </div>

          {/* Test Steps */}
          <div>
            <h4 style={sectionLabel}>Test Steps</h4>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead
                  style={{
                    background: "#F9FAFB",
                    borderBottom: "1px solid var(--border)",
                    color: "#6B7280",
                    textAlign: "left",
                  }}
                >
                  <tr>
                    <th
                      style={{
                        padding: "0.5rem 0.6rem",
                        width: 44,
                        textAlign: "center",
                        fontWeight: 600,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      #
                    </th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Step Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stepsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          padding: "1.25rem",
                          color: "#9CA3AF",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        Step action tidak tersedia.
                      </td>
                    </tr>
                  ) : (
                    stepsList.map((step, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "center",
                            fontWeight: 600,
                            color: "#9CA3AF",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          {i + 1}
                        </td>
                        <td
                          style={{ padding: "0.5rem 0.75rem", color: "#374151", lineHeight: 1.55 }}
                        >
                          {step}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer — divider di-inset selebar padding modal, senada dengan header. */}
        <div style={{ padding: "0 1.5rem 0.9rem", background: "rgba(249, 250, 251, 0.5)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              paddingTop: "0.9rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <Link
              href={`/test-cases/${tc.id}?tab=runs`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                color: "#1D4ED8",
                fontSize: "0.8rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <History size={14} /> Lihat Run History
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.45rem 1.1rem",
                  border: "none",
                  borderRadius: 3,
                  background: "#F59E0B",
                  color: "#000000",
                  fontSize: "0.78rem",
                  fontWeight: 400,
                  cursor: "pointer",
                }}
              >
               Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DeleteTestCaseModal({
  tcTitle,
  onClose,
  onConfirm,
}: {
  tcTitle: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<"confirm" | "processing" | "success">("confirm");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer saat modal unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "confirm") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleConfirm = async () => {
    setPhase("processing");
    try {
      await onConfirm();
      setPhase("success");
      timerRef.current = setTimeout(() => {
        onClose();
      }, 900);
    } catch {
      // Gagal: kembali ke konfirmasi supaya user bisa coba lagi
      setPhase("confirm");
    }
  };

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Hapus Test Case"
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
      onClick={phase === "confirm" ? onClose : undefined}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 12,
          padding: "1.5rem",
          border: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          textAlign: "center",
          position: "relative",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (hanya saat konfirmasi) */}
        {phase === "confirm" && (
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "0.9rem",
              right: "0.9rem",
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: 6,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        )}

        {/* STATE 1: KONFIRMASI */}
        {phase === "confirm" && (
          <>
            {/* Warning icon badge */}
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FEE2E2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={22} />
            </div>

            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                margin: "0 0 0.5rem",
                color: "#111827",
              }}
            >
              Hapus Test Case?
            </h3>
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                margin: "0 0 1.5rem",
                lineHeight: 1.55,
              }}
            >
              Apakah Anda yakin ingin menghapus{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>&quot;{tcTitle}&quot;</span>?
              Tindakan ini tidak dapat dibatalkan.
            </p>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "0.5rem 0",
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#374151",
                  fontSize: "0.8rem",
                  fontWeight: 500,
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
                onClick={() => void handleConfirm()}
                style={{
                  flex: 1,
                  padding: "0.5rem 0",
                  border: "none",
                  borderRadius: 6,
                  background: "#DC2626",
                  color: "#fff",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#B91C1C")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#DC2626")}
              >
                Hapus
              </button>
            </div>
          </>
        )}

        {/* STATE 2: PROCESSING */}
        {phase === "processing" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FFFBEB",
                color: "#D97706",
                border: "1px solid #FDE68A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Menghapus Test Case...
            </h3>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                margin: "0",
                lineHeight: 1.5,
              }}
            >
              Mohon tunggu, sedang memproses penghapusan &quot;{tcTitle}&quot;.
            </p>
          </>
        )}

        {/* STATE 3: SUCCESS */}
        {phase === "success" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#D1FAE5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={24} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Berhasil Dihapus!
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0" }}>
              &quot;{tcTitle}&quot; telah dihapus.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}


function BulkUploadProgressModal({
  upload,
  onClose,
}: {
  upload: {
    open: boolean;
    status: "processing" | "success" | "error";
    total: number;
    processed: number;
    failedRows: number[];
  };
  onClose: () => void;
}) {
  const progress =
    upload.total > 0 ? Math.min(100, Math.round((upload.processed / upload.total) * 100)) : 0;
  const progressTitleId = "import-progress-title";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={progressTitleId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.45)",
        fontFamily: SANS,
      }}
      // Saat impor berjalan modal TIDAK bisa ditutup lewat overlay (maupun Esc —
      // tidak ada handler Esc di sini).
      onClick={upload.status === "processing" ? undefined : onClose}
    >
      <div
        style={{
          width: 440,
          maxWidth: "calc(100vw - 48px)",
          background: "#FFFFFF",
          borderRadius: 18,
          boxShadow: "0 24px 48px -12px rgba(15, 23, 42, 0.28)",
          padding: "32px 32px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* STATE 1: PROCESSING */}
        {upload.status === "processing" && (
          <>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "#FFF8E8",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Spinner 24px: track #FFF1D1, arc #F0A800 (lihat .import-spinner). */}
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                className="import-spinner"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" fill="none" stroke="#FFF1D1" strokeWidth={3} />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="#F0A800"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="14 56"
                />
              </svg>
            </span>

            <h3
              id={progressTitleId}
              style={{ fontSize: 17, fontWeight: 600, margin: 0, color: "#0F172A" }}
            >
              Uploading Test Case…
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>
              Processing Data (
              <span style={{ fontFamily: MONO, fontWeight: 600, color: "#334155" }}>
                {upload.processed}
              </span>
              /{upload.total})
            </p>

            <div
              style={{
                width: "100%",
                marginTop: 18,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Proses impor test case"
                style={{
                  width: "100%",
                  height: 8,
                  borderRadius: 999,
                  background: "#EEF1F5",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: "#FFC348",
                    height: "100%",
                    borderRadius: 999,
                    width: `${progress}%`,
                    transition: "width 0.3s ease-out",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "#64748B",
                }}
              >
                <span>Proses Impor</span>
                <span style={{ fontFamily: MONO, fontWeight: 600, color: "#334155" }}>
                  {progress}%
                </span>
              </div>
            </div>

            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#94A3B8" }}>
              Jangan tutup jendela ini sampai proses selesai.
            </p>
          </>
        )}

        {/* STATE 2: SUCCESS */}
        {upload.status === "success" && (
          <>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "#F0F9F3",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={24} color="#15803D" />
            </span>

            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: "#0F172A" }}>
              Impor Berhasil!
            </h3>
            <p style={{ margin: "4px 0 18px", fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Sebanyak{" "}
              <span style={{ fontFamily: MONO, fontWeight: 600, color: "#334155" }}>
                {upload.total - upload.failedRows.length}
              </span>{" "}
              Test Case telah berhasil ditambahkan ke dalam suite.
            </p>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                height: 40,
                boxSizing: "border-box",
                border: "1px solid #FFC348",
                borderRadius: 10,
                background: "#FFC348",
                color: "#0F172A",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
            >
              Selesai
            </button>
          </>
        )}

        {/* STATE 3: ERROR */}
        {upload.status === "error" && (
          <>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "#FEF2F2",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertCircle size={24} color="#B91C1C" />
            </span>

            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: "#0F172A" }}>
              Gagal Mengunggah
            </h3>
            <p style={{ margin: "4px 0 16px", fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Terjadi kesalahan saat membaca file. Pastikan format kolom sesuai dengan template.
            </p>

            {upload.failedRows.length > 0 && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: "0.6rem 0.8rem",
                  marginBottom: "1rem",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#B91C1C",
                    marginBottom: "0.3rem",
                  }}
                >
                  {upload.failedRows.length} baris gagal divalidasi
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  Baris: {upload.failedRows.join(", ")}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                height: 40,
                boxSizing: "border-box",
                border: "1px solid #DDE2E9",
                borderRadius: 10,
                background: "#FFFFFF",
                color: "#0F172A",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.15s ease, border-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FFF8E8";
                e.currentTarget.style.borderColor = "#FFC348";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FFFFFF";
                e.currentTarget.style.borderColor = "#DDE2E9";
              }}
            >
              Tutup &amp; Coba Lagi
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
