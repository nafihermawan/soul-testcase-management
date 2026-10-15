"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardList, FolderOpen, Inbox, Play, RotateCcw, Search, X } from "lucide-react";
import { createTestRun, updateTestRun } from "@/lib/actions/test-runs";
import { getJSON, invalidateApiCache } from "@/lib/client/use-api";
import { Select } from "@/components/ui/select";
import { Toast, useToast } from "@/components/ui/feedback";
import { ENVIRONMENT_OPTIONS } from "@/lib/qa-metrics";
import type { PlatformCode, RunOptionsPayload } from "@/types/api";

type SuiteOption = {
  id: string;
  name: string;
  code: string;
  path: string;
  projectId: string;
};

type TCOption = {
  id: string;
  tcId: string;
  title: string;
  suiteName: string;
  suiteId: string | null;
  projectId: string | null;
  sectionId: string | null;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
};

/** Nilai awal form saat mode edit (diambil dari run yang sedang diubah). */
export type ExpressRunInitial = {
  name: string;
  activityType: string;
  environment: string;
  platforms: string[];
  sprint: string;
  taskLink: string;
  projectIds: string[];
  testCaseIds: string[];
};

type Props = {
  projectId: string;
  projects: { id: string; name: string; platform: PlatformCode | null }[];
  /** "create" (default) atau "edit". */
  mode?: "create" | "edit";
  /** Wajib saat mode edit. */
  runId?: string;
  /** Nilai awal — dipakai mode edit untuk pre-fill seluruh field. */
  initial?: ExpressRunInitial;
  /**
   * Prefill saat MEMBUAT run baru dari sebuah referensi (mis. tombol "Test" di
   * Bugs Tracker untuk re-test General Finding). Tidak dipakai saat mode edit.
   */
  prefill?: {
    name?: string;
    activityType?: string;
    environment?: string;
    /** Label Platform (mis. "Web") — mengisi checkbox Platform. */
    platforms?: string[];
    projectIds?: string[];
    /** Suite yang langsung dibuka di kolom kiri (TC-nya ikut termuat). */
    suiteId?: string;
    taskLink?: string;
    /** Bug asal — disimpan ke `TestRun.sourceBugId` supaya bisa auto-close. */
    sourceBugId?: string;
  };
  /**
   * Bila diberikan, dipanggil setelah simpan sukses dan MENGGANTIKAN navigasi
   * bawaan — dipakai saat form dirender di dalam modal.
   */
  onSaved?: (runId: string) => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  boxSizing: "border-box",
  padding: "0 12px",
  border: "1px solid #DDE2E9",
  borderRadius: 10,
  fontSize: 14,
  color: "#0F172A",
  background: "#fff",
  outline: "none",
};

/** Heading tiap langkah: nomor (tile 24×24) + judul. */
const stepHeading: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 15,
  fontWeight: 600,
  color: "#0F172A",
};

const stepTile = (variant: 1 | 2): React.CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 7,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 12,
  fontWeight: 600,
  background: variant === 1 ? "#FFC348" : "#F1F5F9",
  color: variant === 1 ? "#0F172A" : "#475569",
  flexShrink: 0,
});

const ACTIVITY_OPTIONS = [
  "Enhancement",
  "UI/UX Refinement",
  "Iteration",
  "Refactor",
  "Bug Fix",
  "Regression",
];

const PLATFORM_OPTIONS = ["Web", "Mobile", "Hardware", "API"];

/** Project.platform (enum) -> label Platform di form, untuk cascading.
 *  Diekspor supaya pemanggil (mis. prefill dari bug) memakai pemetaan yang sama. */
export const PLATFORM_ENUM_TO_LABEL: Record<string, string> = {
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

/** Field wajib Express Run — kunci pesan error inline per field. */
type FieldKey =
  | "runName"
  | "activityType"
  | "environment"
  | "sprint"
  | "taskLink"
  | "platforms"
  | "projects"
  | "testCases";

/** Urutan validasi mengikuti urutan visual field (atas → bawah) agar
 *  "scroll ke error pertama" konsisten dengan yang dilihat user. */
const FIELD_ORDER: FieldKey[] = [
  "runName",
  "activityType",
  "environment",
  "sprint",
  "taskLink",
  "platforms",
  "projects",
  "testCases",
];

/**
 * Selector kontrol utama tiap field, dipakai untuk memfokuskan input error
 * pertama. `Select` bukan `<select>` natif melainkan `<button>` ber-aria-haspopup.
 */
const FIELD_FOCUS_SELECTOR: Record<FieldKey, string> = {
  runName: "input:not([type='checkbox'])",
  activityType: "button[aria-haspopup='listbox']",
  environment: "button[aria-haspopup='listbox']",
  sprint: "input:not([type='checkbox'])",
  taskLink: "input:not([type='checkbox'])",
  platforms: "input[type='checkbox']",
  projects: "button[aria-haspopup='listbox']",
  testCases: "input[type='checkbox']",
};

/**
 * Pesan error inline di bawah field. Setara `text-red-500 text-xs mt-1`,
 * ditulis sebagai inline style karena proyek ini tidak memakai Tailwind.
 */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      style={{ color: "#B91C1C", fontSize: "0.75rem", margin: "0.25rem 0 0", lineHeight: 1.4 }}
    >
      {message}
    </p>
  );
}

/**
 * Empty state di dalam box daftar (Suites & Test Cases): ikon netral + teks,
 * dipusatkan horizontal DAN vertikal. `minHeight: "100%"` dipakai karena
 * container-nya (`listScrollStyle`) ber-`flex: 1` tanpa tinggi eksplisit —
 * tanpa itu `justifyContent: center` tidak punya ruang untuk memusatkan.
 */
function ListEmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "1rem 0.75rem",
        background: "#FCFCFD",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "#F1F5F9",
          color: "#94A3B8",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <p style={{ margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
        {text}
      </p>
    </div>
  );
}

/**
 * Skeleton baris daftar selama `options` project dimuat dari API.
 * Memakai `.skeleton-block` (animasi `skeletonPulse` di globals.css) supaya
 * bahasanya sama dengan skeleton halaman lain.
 */
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.35rem 0.25rem" }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton-block"
          style={{ height: 30, width: i % 3 === 2 ? "68%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function ExpressRunForm({
  projectId,
  projects,
  mode = "create",
  runId,
  initial,
  prefill,
  onSaved,
}: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";
  // Default KOSONG. Sebelumnya ada fallback ke `projects[0].id` yang membuat
  // project pertama ("Main Dashboard") otomatis terpilih begitu form dibuka.
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () =>
      new Set(
        initial?.projectIds?.length
          ? initial.projectIds
          : projectId
            ? [projectId]
            : prefill?.projectIds ?? []
      )
  );
  // Global selection (persisten lintas suite/project)
  const [selectedTCs, setSelectedTCs] = useState<Set<string>>(
    () => new Set(initial?.testCaseIds ?? [])
  );
  // Suite aktif yang sedang dilihat di kolom kiri. Diisi dari prefill (mis. dari
  // bug) supaya kolom kanan langsung memuat test case suite tersebut.
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(prefill?.suiteId ?? null);
  const [runName, setRunName] = useState(initial?.name ?? prefill?.name ?? "");
  const [activityType, setActivityType] = useState(
    initial?.activityType ?? prefill?.activityType ?? ""
  );
  const [platforms, setPlatforms] = useState<Set<string>>(
    new Set(initial?.platforms ?? prefill?.platforms ?? [])
  );
  const [environment, setEnvironment] = useState(initial?.environment ?? prefill?.environment ?? "");
  const [sprint, setSprint] = useState(initial?.sprint ?? "");
  const [taskLink, setTaskLink] = useState(initial?.taskLink ?? prefill?.taskLink ?? "");
  const [suiteQuery, setSuiteQuery] = useState("");
  const [tcQuery, setTcQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Pesan error per field, muncul setelah tombol Express Run diklik.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const formRef = useRef<HTMLDivElement>(null);
  const { toast, showToast, dismissToast } = useToast();

  /** Scroll ke field error pertama lalu fokuskan kontrol utamanya. */
  const focusField = (key: FieldKey) => {
    const wrapper = formRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`);
    if (!wrapper) return;
    wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    wrapper.querySelector<HTMLElement>(FIELD_FOCUS_SELECTOR[key])?.focus({ preventScroll: true });
  };

  /** Buang pesan error satu field begitu nilainya diubah (error usang). */
  const clearFieldError = (key: FieldKey) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // Suite & TC dimuat PER project yang dipilih, bukan seluruh repository
  // sekaligus (dulu ~78 KB untuk 331 TC — lihat audit performa navigasi §6).
  // Data project yang sudah pernah dimuat disimpan; tidak ada fetch ulang saat
  // project di-toggle mati-nyala.
  const [suites, setSuites] = useState<SuiteOption[]>([]);
  const [testCases, setTestCases] = useState<TCOption[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const loadedProjects = useRef<Set<string>>(new Set());
  const loadingProjects = useRef<Set<string>>(new Set());
  /**
   * `loadingProjects` sengaja berupa ref karena hanya untuk dedupe request —
   * perubahannya tidak memicu render, jadi tidak bisa dipakai UI. Flag di
   * bawah ini yang reaktif: dihitung dari jumlah request yang masih in-flight,
   * sehingga skeleton bertahan sampai request TERAKHIR selesai.
   */
  const [loadingOptions, setLoadingOptions] = useState(false);
  const inflightRef = useRef(0);

  useEffect(() => {
    for (const id of Array.from(selectedProjectIds)) {
      if (loadedProjects.current.has(id) || loadingProjects.current.has(id)) continue;
      loadingProjects.current.add(id);
      inflightRef.current += 1;
      setLoadingOptions(true);
      getJSON<RunOptionsPayload>(
        `/api/test-runs/options?projectId=${encodeURIComponent(id)}`
      )
        .then((data) => {
          loadedProjects.current.add(id);
          setSuites((prev) => [...prev.filter((s) => s.projectId !== id), ...data.suites]);
          setTestCases((prev) => [
            ...prev.filter((t) => t.projectId !== id),
            ...data.testCases,
          ]);
          setSections((prev) => {
            const known = new Set(prev.map((s) => s.id));
            const added = data.sections.filter((s) => !known.has(s.id));
            return added.length ? [...prev, ...added] : prev;
          });
        })
        .catch(() => {
          // Gagal memuat: biarkan kosong; user bisa toggle project untuk coba lagi.
        })
        .finally(() => {
          loadingProjects.current.delete(id);
          inflightRef.current -= 1;
          if (inflightRef.current === 0) setLoadingOptions(false);
        });
    }
  }, [selectedProjectIds]);

  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  /**
   * Cascading: Platform yang dicentang membatasi project yang boleh dipilih
   * (dan otomatis membatasi suite & TC, karena keduanya turunan project).
   * Tanpa platform terpilih, tidak ada project yang tersedia.
   */
  const matchesPlatform = useCallback(
    (p: { platform: PlatformCode | null }) =>
      platforms.size > 0 &&
      !!p.platform &&
      platforms.has(PLATFORM_ENUM_TO_LABEL[p.platform] ?? ""),
    [platforms]
  );

  const selectableProjects = useMemo(
    () => projects.filter(matchesPlatform),
    [projects, matchesPlatform]
  );

  /** Field Project terkunci sampai minimal satu Platform dicentang. */
  const hasSelectedPlatform = platforms.size > 0;

  /**
   * Auto-reset seleksi saat Platform berubah: buang project terpilih, suite
   * aktif, dan TC terpilih yang tidak lagi relevan dengan Platform.
   *
   * Dijaga lewat `prevPlatformKey` supaya HANYA berjalan ketika set Platform
   * benar-benar berubah — mematikan sebuah project secara manual tetap
   * mempertahankan pilihan TC yang sudah dibuat (perilaku lama).
   */
  // Diinisialisasi dengan Platform awal (mode edit) supaya auto-reset TIDAK
  // ikut berjalan saat form pertama dibuka — kalau tidak, project yang tidak
  // cocok dengan Platform tersimpan bisa terbuang tanpa sengaja.
  const prevPlatformKey = useRef<string | null>(
    initial ? [...initial.platforms].sort().join(",") : null
  );
  useEffect(() => {
    const key = Array.from(platforms).sort().join(",");
    if (prevPlatformKey.current === key) return;
    prevPlatformKey.current = key;

    const allowedProjects = new Set(projects.filter(matchesPlatform).map((p) => p.id));
    const allowedSuites = new Set(
      suites.filter((s) => allowedProjects.has(s.projectId)).map((s) => s.id)
    );
    const suiteOfTc = new Map(testCases.map((t) => [t.id, t.suiteId]));

    setSelectedProjectIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => allowedProjects.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setActiveSuiteId((prev) => (prev && !allowedSuites.has(prev) ? null : prev));
    setSelectedTCs((prev) => {
      const next = new Set(
        Array.from(prev).filter((id) => {
          const suiteId = suiteOfTc.get(id);
          return suiteId ? allowedSuites.has(suiteId) : true;
        })
      );
      return next.size === prev.size ? prev : next;
    });
  }, [platforms, projects, suites, testCases, matchesPlatform]);

  const toggleProject = (id: string) => {
    clearFieldError("projects");
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Platform tiap project — dipakai untuk memfilter Suite per Platform. */
  const platformByProject = useMemo(
    () => new Map(projects.map((p) => [p.id, p.platform])),
    [projects]
  );

  /**
   * Suite harus lolos DUA syarat: Platform yang dipilih DAN project yang
   * dipilih. Memfilter hanya dengan project tidak cukup — suite dari project
   * yang sudah tidak relevan dengan Platform bisa ikut muncul.
   */
  const availableSuites = useMemo(
    () =>
      suites.filter((s) => {
        const platform = platformByProject.get(s.projectId) ?? null;
        const isPlatformMatch =
          platforms.size === 0 ||
          (!!platform && platforms.has(PLATFORM_ENUM_TO_LABEL[platform] ?? ""));
        const isProjectMatch = selectedProjectIds.has(s.projectId);
        return isPlatformMatch && isProjectMatch;
      }),
    [suites, selectedProjectIds, platformByProject, platforms]
  );

  const filteredSuites = useMemo(() => {
    const q = suiteQuery.trim().toLowerCase();
    if (!q) return availableSuites;
    return availableSuites.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.path.toLowerCase().includes(q)
    );
  }, [availableSuites, suiteQuery]);

  // TC berstatus DEPRECATED sengaja disaring keluar dari daftar pilihan.
  const activeTestCases = useMemo(
    () => testCases.filter((tc) => tc.status !== "DEPRECATED"),
    [testCases]
  );

  // TC dari suite yang sedang aktif (kolom kanan menampilkan suite ini saja).
  // Suite aktif wajib masih ada di availableSuites, supaya TC dari suite yang
  // sudah tidak relevan dengan Platform tidak ikut tampil.
  const visibleTCs = useMemo(
    () =>
      activeSuiteId && availableSuites.some((s) => s.id === activeSuiteId)
        ? activeTestCases.filter((t) => t.suiteId === activeSuiteId)
        : [],
    [activeTestCases, activeSuiteId, availableSuites]
  );

  const filteredTCs = useMemo(() => {
    const q = tcQuery.trim().toLowerCase();
    if (!q) return visibleTCs;
    return visibleTCs.filter(
      (t) => t.title.toLowerCase().includes(q) || t.tcId.toLowerCase().includes(q) || t.suiteName.toLowerCase().includes(q)
    );
  }, [visibleTCs, tcQuery]);

  // Kelompokkan TC per Section supaya hierarkinya terlihat (bukan daftar rata).
  const tcSectionGroups = useMemo(() => {
    const nameById = new Map(sections.map((s) => [s.id, s.name]));
    const groups = new Map<string, { key: string; name: string; items: TCOption[] }>();
    for (const t of filteredTCs) {
      const key = t.sectionId ?? "__none__";
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          name: t.sectionId ? nameById.get(t.sectionId) ?? "Section" : "Tanpa Section",
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push(t);
    }
    return Array.from(groups.values());
  }, [filteredTCs, sections]);

  // Section mana yang sedang di-collapse (default: semua terbuka).
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(new Set());

  const toggleSectionGroup = (key: string) =>
    setCollapsedSectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Validasi form wajib
  const isUrlValid = (v: string) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  // Klik suite di kolom kiri -> set aktif (TIDAK reset pilihan global)
  const selectSuite = (id: string) => {
    setActiveSuiteId(id);
    setTcQuery("");
  };

  const toggleTC = (id: string) => {
    clearFieldError("testCases");
    setSelectedTCs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Select All per section: pilih/lepas semua TC di dalam satu section. */
  const toggleSectionTCs = (items: TCOption[]) => {
    clearFieldError("testCases");
    setSelectedTCs((prev) => {
      const next = new Set(prev);
      const allOn = items.length > 0 && items.every((t) => next.has(t.id));
      if (allOn) items.forEach((t) => next.delete(t.id));
      else items.forEach((t) => next.add(t.id));
      return next;
    });
  };

  const reset = () => {
    setSelectedProjectIds(
      new Set(
        initial?.projectIds?.length
          ? initial.projectIds
          : projectId
            ? [projectId]
            : projects[0]?.id
              ? [projects[0].id]
              : []
      )
    );
    setActiveSuiteId(null);
    setSelectedTCs(new Set(initial?.testCaseIds ?? []));
    setRunName(initial?.name ?? "");
    setActivityType(initial?.activityType ?? "");
    setPlatforms(new Set(initial?.platforms ?? []));
    setEnvironment(initial?.environment ?? "");
    setSprint(initial?.sprint ?? "");
    setTaskLink(initial?.taskLink ?? "");
    setSuiteQuery("");
    setTcQuery("");
    setError(null);
    setFieldErrors({});
  };

  const handleRun = async () => {
    setError(null);
    // Validasi seluruh field mandatory sekaligus, lalu tampilkan error inline
    // per field. Tombol memang selalu aktif — penyaringan terjadi di sini.
    const errs: Partial<Record<FieldKey, string>> = {};
    if (runName.trim().length < 3) errs.runName = "Nama Run minimal 3 karakter.";
    if (!activityType) errs.activityType = "Tipe Activity wajib dipilih.";
    if (!environment) errs.environment = "Environment wajib dipilih.";
    if (!sprint.trim()) errs.sprint = "Sprint wajib diisi.";
    if (!isUrlValid(taskLink.trim()))
      errs.taskLink = "Task / Card Link harus berupa URL valid (http/https).";
    if (platforms.size === 0) errs.platforms = "Pilih minimal satu Platform.";
    if (selectedProjectIds.size === 0) errs.projects = "Pilih minimal satu project.";
    if (selectedTCs.size === 0) errs.testCases = "Pilih minimal satu test case.";

    const firstInvalid = FIELD_ORDER.find((key) => errs[key]);
    if (firstInvalid) {
      setFieldErrors(errs);
      focusField(firstInvalid);
      showToast("Mohon lengkapi seluruh field yang wajib diisi.", "error");
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      // Suite unik yang dimiliki TC terpilih
      const selectedSuiteIds = Array.from(
        new Set(
          selectedTCList
            .map((t) => t.suiteId)
            .filter((s): s is string => !!s)
        )
      );
      const payload = { sprint, taskLink, activityType, environment, platforms: Array.from(platforms) };
      const res =
        isEdit && runId
          ? await updateTestRun(
              runId,
              Array.from(selectedProjectIds),
              runName,
              selectedSuiteIds,
              Array.from(selectedTCs),
              payload
            )
          : await createTestRun(
              Array.from(selectedProjectIds),
              runName,
              selectedSuiteIds,
              Array.from(selectedTCs),
              // `sourceBugId` hanya untuk create (edit tidak mengubah asal run).
              { ...payload, sourceBugId: prefill?.sourceBugId }
            );
      if (res.success && res.runId) {
        // Dirender di dalam modal: serahkan ke pemanggil, jangan navigasi.
        if (onSaved) {
          onSaved(res.runId);
          return;
        }
        if (isEdit) {
          // Selesai mengedit: halaman Active Runs harus menampilkan data terbaru,
          // jadi buang cache client dulu (bukan mengandalkan TTL).
          invalidateApiCache();
          router.push("/test-runs");
        } else {
          router.push(`/test-runs/${res.runId}`);
        }
      } else {
        setError(res.error ?? "Gagal membuat run.");
        setPending(false);
      }
    } catch (e) {
      // Server action gagal (transport / action id basi). Pesan aslinya
      // ditampilkan saat dev supaya tidak cuma "Terjadi kesalahan".
      console.error("Create Express Run Error:", e);
      setError(
        process.env.NODE_ENV === "production"
          ? "Terjadi kesalahan. Coba lagi."
          : `Terjadi kesalahan: ${e instanceof Error ? e.message : String(e)}`
      );
      setPending(false);
    }
  };

  const listBoxStyle: React.CSSProperties = {
    border: "1px solid #E3E7EE",
    borderRadius: 14,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const listScrollStyle: React.CSSProperties = {
    height: 240,
    overflowY: "auto",
    padding: "0.35rem",
    borderTop: "1px solid #EEF1F5",
    background: "#FFFFFF",
  };

  const itemStyle = (checked: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.4rem 0.55rem",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: "0.84rem",
    background: checked ? "rgba(255, 195, 72, 0.08)" : "transparent",
    transition: "background 0.15s ease",
  });

  const selectedCount = selectedTCs.size;

  // Detail TC terpilih untuk preview (urutan sesuai data asli)
  const selectedTCList = useMemo(
    () => testCases.filter((t) => selectedTCs.has(t.id)),
    [testCases, selectedTCs]
  );

  // Preview juga dikelompokkan per Section, konsisten dengan panel kanan.
  const previewSectionGroups = useMemo(() => {
    const nameById = new Map(sections.map((s) => [s.id, s.name]));
    const groups = new Map<string, { key: string; name: string; items: TCOption[] }>();
    for (const t of selectedTCList) {
      const key = t.sectionId ?? "__none__";
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          name: t.sectionId ? nameById.get(t.sectionId) ?? "Section" : "Tanpa Section",
          items: [],
        };
        groups.set(key, g);
      }
      g.items.push(t);
    }
    return Array.from(groups.values());
  }, [selectedTCList, sections]);

  /** Jumlah project BERBEDA di antara TC terpilih (ringkasan footer). */
  const selectedProjectCount = useMemo(
    () => new Set(selectedTCList.map((t) => t.projectId).filter((x): x is string => !!x)).size,
    [selectedTCList]
  );

  return (
    <div ref={formRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "24px 22px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* Step 1 — Detail Run */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={stepHeading}>
          <span style={stepTile(1)} aria-hidden="true">1</span>
          Detail Run
        </div>
        {/* Form inputs: Run Name full width, sisanya 2 kolom */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            columnGap: 20,
            rowGap: 16,
          }}
        >
          <div
            data-field="runName"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
              gridColumn: "1 / -1",
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Run Name<span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <input
              value={runName}
              onChange={(e) => {
                setRunName(e.target.value);
                clearFieldError("runName");
              }}
              placeholder="Samakan dengan Task Title Clickup"
              style={inputStyle}
            />
            <FieldError message={fieldErrors.runName} />
          </div>
          <div
            data-field="activityType"
            style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Tipe Activity <span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <Select
              value={activityType}
              ariaLabel="Tipe activity"
              style={{
                height: 40,
                borderRadius: 10,
                border: "1px solid #DDE2E9",
                fontSize: 14,
                color: activityType ? "#0F172A" : "#94A3B8",
                fontWeight: activityType ? 500 : 400,
              }}
              onChange={(e) => {
                setActivityType(e.target.value);
                clearFieldError("activityType");
              }}
            >
              <option value="">Pilih Tipe Activity</option>
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.activityType} />
          </div>
          <div
            data-field="environment"
            style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Environment <span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <Select
              value={environment}
              ariaLabel="Environment"
              style={{
                height: 40,
                borderRadius: 10,
                border: "1px solid #DDE2E9",
                fontSize: 14,
                color: environment ? "#0F172A" : "#94A3B8",
                fontWeight: environment ? 500 : 400,
              }}
              onChange={(e) => {
                setEnvironment(e.target.value);
                clearFieldError("environment");
              }}
            >
              <option value="">Pilih Environment</option>
              {ENVIRONMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.environment} />
          </div>
          <div
            data-field="sprint"
            style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Sprint <span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <input
              value={sprint}
              onChange={(e) => {
                setSprint(e.target.value);
                clearFieldError("sprint");
              }}
              placeholder="mis. 06"
              style={inputStyle}
            />
            <FieldError message={fieldErrors.sprint} />
          </div>
          <div
            data-field="taskLink"
            style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Task / Card Link <span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <input
              type="url"
              value={taskLink}
              onChange={(e) => {
                setTaskLink(e.target.value);
                clearFieldError("taskLink");
              }}
              placeholder="mis. https://app.clickup.com/..."
              style={inputStyle}
            />
            <FieldError message={fieldErrors.taskLink} />
          </div>
          <div
            data-field="platforms"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  padding: 0,
                  marginBottom: 6,
                }}
              >
                Platform <span style={{ color: "#B91C1C" }}>*</span>
              </legend>
              <div
                style={{
                  height: 40,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  columnGap: 24,
                  rowGap: 8,
                }}
              >
                {PLATFORM_OPTIONS.map((opt) => {
                  const checked = platforms.has(opt);
                  return (
                    <label
                      key={opt}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14,
                        color: "#334155",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          clearFieldError("platforms");
                          setPlatforms((prev) => {
                            const next = new Set(prev);
                            if (next.has(opt)) next.delete(opt);
                            else next.add(opt);
                            return next;
                          });
                        }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <FieldError message={fieldErrors.platforms} />
          </div>
          <div
            data-field="projects"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
              Project <span style={{ color: "#B91C1C" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  minHeight: 40,
                  boxSizing: "border-box",
                  padding: "4px 34px 4px 6px",
                  border: `1px solid ${hasSelectedPlatform ? "#DDE2E9" : "#E3E7EE"}`,
                  borderRadius: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6,
                  background: hasSelectedPlatform ? "#fff" : "#F8FAFC",
                  cursor: hasSelectedPlatform ? "text" : "not-allowed",
                }}
              >
                {!hasSelectedPlatform ? (
                  <span style={{ padding: "0 6px", fontSize: 14, color: "#94A3B8" }}>
                    Pilih Platform terlebih dahulu
                  </span>
                ) : (
                  <>
                    {Array.from(selectedProjectIds).map((pid) => (
                      <span
                        key={pid}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                          height: 30,
                          boxSizing: "border-box",
                          padding: "0 4px 0 10px",
                          border: "1px solid #E3E7EE",
                          borderRadius: 7,
                          background: "#F8FAFC",
                          fontSize: 13,
                          fontWeight: 500,
                          color: "#0F172A",
                        }}
                      >
                        {projectNameMap.get(pid)}
                        <button
                          type="button"
                          aria-label={`Hapus ${projectNameMap.get(pid)}`}
                          onClick={() => toggleProject(pid)}
                          style={{
                            width: 22,
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            color: "#64748B",
                          }}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    <Select
                      value=""
                      ariaLabel="Tambah project"
                      chevronColor="transparent"
                      style={{
                        flex: 1,
                        minWidth: 120,
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        height: 30,
                        boxShadow: "none",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#475569",
                      }}
                      onChange={(e) => {
                        if (e.target.value) toggleProject(e.target.value);
                      }}
                    >
                      <option value="">+ Tambah project</option>
                      {selectableProjects
                        .filter((p) => !selectedProjectIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  </>
                )}
              </div>
              <ChevronDown
                size={14}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: hasSelectedPlatform ? "#64748B" : "#CBD5E1",
                  pointerEvents: "none",
                }}
              />
            </div>
            <FieldError message={fieldErrors.projects} />
          </div>
        </div>

        </div>

        {/* Inset divider antara Step 1 dan Step 2 (~26px atas/bawah). */}
        <div
          aria-hidden="true"
          style={{ height: 1, background: "#EEF1F5", margin: "-6px 0" }}
        />

        {/* Step 2 — Pilih Suite & Test Case */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={stepHeading}>
          <span style={stepTile(selectedProjectIds.size > 0 ? 1 : 2)} aria-hidden="true">2</span>
          Pilih Suite &amp; Test Case
        </div>
        {/* Selection area: Suites (unified + badge project) | Test Cases */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
          {/* Suites column: klik suite untuk melihat TC-nya (single active) */}
          <div style={listBoxStyle}>
            <div style={{ padding: "0.6rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>
                Suites
              </div>
            </div>
            <div style={{ padding: "0.5rem 0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", border: "1px solid var(--border-strong)", borderRadius: 7, padding: "0.3rem 0.55rem" }}>
                <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <input
                  value={suiteQuery}
                  onChange={(e) => setSuiteQuery(e.target.value)}
                  placeholder="Cari suite…"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "0.82rem", minWidth: 0, background: "transparent" }}
                />
              </div>
            </div>
            <div style={listScrollStyle}>
              {loadingOptions ? (
                <ListSkeleton rows={5} />
              ) : selectedProjectIds.size === 0 ? (
                <ListEmptyState
                  icon={<FolderOpen size={26} strokeWidth={1.5} />}
                  text="Pilih project terlebih dahulu."
                />
              ) : filteredSuites.length === 0 ? (
                <ListEmptyState
                  icon={<Inbox size={26} strokeWidth={1.5} />}
                  text="Belum ada suite untuk project terpilih."
                />
              ) : (
                filteredSuites.map((s) => {
                  const active = s.id === activeSuiteId;
                  return (
                    <label
                      key={s.id}
                      style={itemStyle(active)}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.background = "var(--surface-muted)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = active ? "rgba(255, 195, 72, 0.08)" : "transparent";
                      }}
                    >
                      <input
                        type="radio"
                        name="active-suite"
                        checked={active}
                        onChange={() => selectSuite(s.id)}
                        style={{ margin: 0, cursor: "pointer" }}
                      />
                      <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </span>
                      {/* Nama project — teks polos (bukan pill). */}
                      <span
                        style={{
                          fontSize: 12,
                          color: "#64748B",
                          flexShrink: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 140,
                        }}
                      >
                        {projectNameMap.get(s.projectId) ?? ""}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Test Cases column: menampilkan TC suite aktif, checkbox sync global */}
          <div data-field="testCases" style={listBoxStyle}>
            <div style={{ padding: "0.6rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>
                Test Cases
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    clearFieldError("testCases");
                    setSelectedTCs(new Set());
                  }}
                  style={{ border: "none", background: "none", color: "#B91C1C", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", padding: 0, transition: "color 0.12s ease" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#DC2626")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#B91C1C")}
                >
                  Clear
                </button>
              </div>
            </div>
            {fieldErrors.testCases && (
              <div style={{ padding: "0 0.75rem 0.35rem" }}>
                <FieldError message={fieldErrors.testCases} />
              </div>
            )}
            <div style={{ padding: "0.5rem 0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", border: "1px solid var(--border-strong)", borderRadius: 7, padding: "0.3rem 0.55rem" }}>
                <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <input
                  value={tcQuery}
                  onChange={(e) => setTcQuery(e.target.value)}
                  placeholder="Cari test case…"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "0.82rem", minWidth: 0, background: "transparent" }}
                />
              </div>
            </div>
            <div style={listScrollStyle}>
              {loadingOptions ? (
                <ListSkeleton rows={5} />
              ) : !activeSuiteId ? (
                <ListEmptyState
                  icon={<ClipboardList size={26} strokeWidth={1.5} />}
                  text="Pilih suite di kolom kiri untuk melihat test case."
                />
              ) : filteredTCs.length === 0 ? (
                <ListEmptyState
                  icon={<Inbox size={26} strokeWidth={1.5} />}
                  text="Tidak ada test case di suite ini."
                />
              ) : (
                tcSectionGroups.map((g) => {
                  const selectedInSection = g.items.filter((t) => selectedTCs.has(t.id)).length;
                  const allOn = g.items.length > 0 && selectedInSection === g.items.length;
                  const open = !collapsedSectionKeys.has(g.key);
                  return (
                    <div key={g.key}>
                      {/* Header Section: Select All + folder + nama, klik = expand/collapse */}
                      <div
                        onClick={() => toggleSectionGroup(g.key)}
                        style={{
                          minHeight: 40,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "0 10px",
                          marginTop: 2,
                          background: "#F8FAFC",
                          borderRadius: 9,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedInSection > 0 && !allOn;
                          }}
                          onChange={() => toggleSectionTCs(g.items)}
                          onClick={(e) => e.stopPropagation()}
                          title={`Pilih semua test case di section ${g.name}`}
                          aria-label={`Pilih semua test case di section ${g.name}`}
                          aria-checked={allOn ? true : selectedInSection > 0 ? "mixed" : false}
                        />
                        <FolderOpen size={14} aria-hidden="true" style={{ color: "#64748B", flexShrink: 0 }} />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#334155",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.name}
                        </span>
                        <span style={{ fontSize: 12, color: "#64748B", flexShrink: 0 }}>
                          <span
                            style={{
                              fontFamily: '"Geist Mono", ui-monospace, monospace',
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            {selectedInSection}
                          </span>
                          /{g.items.length}
                        </span>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Tutup" : "Buka"} section ${g.name}`}
                          title={open ? "Tutup section" : "Buka section"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSectionGroup(g.key);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <ChevronDown
                            size={14}
                            aria-hidden="true"
                            style={{
                              color: "#64748B",
                              transform: open ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                            }}
                          />
                        </button>
                      </div>
                      {open &&
                        g.items.map((t) => {
                          const checked = selectedTCs.has(t.id);
                          return (
                            <label
                              key={t.id}
                              style={{ ...itemStyle(checked), paddingLeft: 12 }}
                              onMouseEnter={(e) => {
                                if (!checked) e.currentTarget.style.background = "var(--surface-muted)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = checked ? "rgba(255, 195, 72, 0.08)" : "transparent";
                              }}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleTC(t.id)} />
                              <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.title}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Selected Test Cases Preview */}
        <div style={{ marginTop: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 13,
              fontWeight: 600,
              color: "#475569",
              marginBottom: 10,
            }}
          >
            Selected Test Cases Preview
            <span style={{ fontWeight: 400, color: "#64748B" }}>
              {" · "}
              <span
                style={{
                  fontFamily: '"Geist Mono", ui-monospace, monospace',
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {selectedTCList.length}
              </span>
            </span>
          </div>
          {selectedTCList.length === 0 ? (
            <p
              style={{
                padding: "1.25rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                border: "1px dashed var(--border-strong)",
                borderRadius: 8,
              }}
            >
              Belum ada Test Case yang dipilih.
            </p>
          ) : (
            <div style={{ border: "1px solid #E3E7EE", borderRadius: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ color: "#64748B", textAlign: "left", background: "#F8FAFC", borderBottom: "1px solid #EEF1F5" }}>
                    <th style={{ padding: "10px 12px 10px 16px", fontWeight: 500, fontSize: 12, width: 200 }}>Project</th>
                    <th style={{ padding: "10px 12px", fontWeight: 500, fontSize: 12, width: 220 }}>Suite</th>
                    <th style={{ padding: "10px 12px", fontWeight: 500, fontSize: 12 }}>Test Case</th>
                    <th style={{ padding: "10px 12px", fontWeight: 500, fontSize: 12, width: 56, textAlign: "right" }}>
                      <span
                        style={{
                          position: "absolute",
                          width: 1,
                          height: 1,
                          overflow: "hidden",
                          clip: "rect(0 0 0 0)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Hapus
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewSectionGroups.map((g) => (
                    <Fragment key={g.key}>
                      {/* Baris header Section di dalam tabel preview */}
                      <tr>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 16px",
                              background: "#FCFCFD",
                              borderBottom: "1px solid #EEF1F5",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            <FolderOpen size={13} aria-hidden="true" style={{ color: "#64748B", flexShrink: 0 }} />
                            {g.name}
                            <span style={{ fontWeight: 400, color: "#64748B" }}>
                              · {g.items.length} test case
                            </span>
                          </div>
                        </td>
                      </tr>
                      {g.items.map((t) => (
                    <tr key={t.id} style={{ height: 48, borderBottom: "1px solid #F1F4F8" }}>
                      <td style={{ paddingLeft: 16, paddingRight: 12, fontSize: 14, color: "#475569" }}>
                        {t.projectId ? (projectNameMap.get(t.projectId) ?? "—") : "—"}
                      </td>
                      <td
                        style={{
                          padding: "0 12px",
                          fontSize: 14,
                          color: "#475569",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.suiteName || "—"}
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          <span
                            style={{
                              width: 128,
                              flexShrink: 0,
                              fontFamily: '"Geist Mono", ui-monospace, monospace',
                              fontSize: 12,
                              fontWeight: 400,
                              color: "#64748B",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.tcId}
                          </span>
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
                            {t.title}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "0 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          aria-label={`Hapus ${t.tcId} dari pilihan`}
                          title="Hapus dari pilihan"
                          onClick={() => toggleTC(t.id)}
                          style={{
                            width: 32,
                            height: 32,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            borderRadius: 8,
                            color: "#94A3B8",
                            cursor: "pointer",
                            transition: "background-color 0.15s ease, color 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#FEF2F2";
                            e.currentTarget.style.color = "#B91C1C";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "#94A3B8";
                          }}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: "0.85rem", margin: "0.75rem 0 0" }}>{error}</p>
        )}
      </div>

      {/* Footer / action bar — sticky di dasar area scroll supaya tombol selalu
          terlihat tanpa perlu scroll (termasuk saat form dipakai di dalam modal). */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          padding: "14px 22px",
          borderTop: "1px solid #EEF1F5",
          background: "#FAFBFC",
          flexWrap: "wrap",
        }}
      >
        {/* Summary counter (kiri) */}
        <span style={{ fontSize: 14, color: "#475569" }}>
          <span style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', fontWeight: 600, color: "#0F172A" }}>
            {selectedCount}
          </span>{" "}
          Test Case{selectedCount === 1 ? "" : "s"} Selected across{" "}
          <span style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', fontWeight: 600, color: "#0F172A" }}>
            {selectedProjectCount}
          </span>{" "}
          Project{selectedProjectCount === 1 ? "" : "s"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 40,
              boxSizing: "border-box",
              padding: "0 12px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: "#475569",
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1,
              cursor: pending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
          >
            <RotateCcw size={15} /> Reset
          </button>
          <a
            href="/test-runs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              padding: "0 16px",
              borderRadius: 10,
              border: "1px solid #DDE2E9",
              background: "#FFFFFF",
              color: "#0F172A",
              fontWeight: 500,
              fontSize: 14,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "background-color 0.15s, border-color 0.15s",
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
            Batal
          </a>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 40,
              boxSizing: "border-box",
              padding: "0 18px",
              borderRadius: 10,
              border: "1px solid #FFC348",
              background: "#FFC348",
              color: "#0F172A",
              fontWeight: 600,
              fontSize: 14,
              lineHeight: 1,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.7 : 1,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#FFC348";
            }}
          >
            <Play size={15} />{" "}
            {pending
              ? isEdit
                ? "Menyimpan..."
                : "Membuat Run..."
              : isEdit
                ? "Simpan Perubahan"
                : "Express Run"}
          </button>
        </div>
      </div>
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
