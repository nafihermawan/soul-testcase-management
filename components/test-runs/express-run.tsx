"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardList, FolderOpen, Inbox, Play, RotateCcw, Search, X } from "lucide-react";
import { createTestRun, updateTestRun } from "@/lib/actions/test-runs";
import { getJSON, invalidateApiCache } from "@/lib/client/use-api";
import { Select } from "@/components/ui/select";
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
   * Bila diberikan, dipanggil setelah simpan sukses dan MENGGANTIKAN navigasi
   * bawaan — dipakai saat form dirender di dalam modal.
   */
  onSaved?: (runId: string) => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: "0.875rem",
  background: "#fff",
};

const ACTIVITY_OPTIONS = [
  "Enhancement",
  "UI/UX Refinement",
  "Iteration",
  "Refactor",
  "Bug Fix",
  "Regression",
];

const ENVIRONMENT_OPTIONS = ["DEV", "STG", "PRE-PROD", "PROD"];

const PLATFORM_OPTIONS = ["Web", "Mobile", "Hardware", "API"];

/** Project.platform (enum) -> label Platform di form, untuk cascading. */
const PLATFORM_ENUM_TO_LABEL: Record<string, string> = {
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

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
        gap: "0.5rem",
        padding: "1rem 0.75rem",
        textAlign: "center",
      }}
    >
      <span style={{ color: "#CBD5E1", display: "inline-flex" }} aria-hidden="true">
        {icon}
      </span>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
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
            : []
      )
  );
  // Global selection (persisten lintas suite/project)
  const [selectedTCs, setSelectedTCs] = useState<Set<string>>(
    () => new Set(initial?.testCaseIds ?? [])
  );
  // Suite aktif yang sedang dilihat di kolom kiri
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [runName, setRunName] = useState(initial?.name ?? "");
  const [activityType, setActivityType] = useState(initial?.activityType ?? "");
  const [platforms, setPlatforms] = useState<Set<string>>(new Set(initial?.platforms ?? []));
  const [environment, setEnvironment] = useState(initial?.environment ?? "");
  const [sprint, setSprint] = useState(initial?.sprint ?? "");
  const [taskLink, setTaskLink] = useState(initial?.taskLink ?? "");
  const [suiteQuery, setSuiteQuery] = useState("");
  const [tcQuery, setTcQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
  const isFormValid =
    runName.trim().length >= 3 &&
    !!activityType &&
    platforms.size > 0 &&
    !!environment &&
    sprint.trim().length > 0 &&
    isUrlValid(taskLink.trim()) &&
    selectedProjectIds.size > 0 &&
    selectedTCs.size > 0;

  // Klik suite di kolom kiri -> set aktif (TIDAK reset pilihan global)
  const selectSuite = (id: string) => {
    setActiveSuiteId(id);
    setTcQuery("");
  };

  const toggleTC = (id: string) => {
    setSelectedTCs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Select All per section: pilih/lepas semua TC di dalam satu section. */
  const toggleSectionTCs = (items: TCOption[]) => {
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
  };

  const handleRun = async () => {
    setError(null);
    if (runName.trim().length < 3) {
      setError("Nama Run minimal 3 karakter.");
      return;
    }
    if (!activityType) {
      setError("Tipe Activity wajib dipilih.");
      return;
    }
    if (platforms.size === 0) {
      setError("Pilih minimal satu Platform.");
      return;
    }
    if (!environment) {
      setError("Environment wajib dipilih.");
      return;
    }
    if (!sprint.trim()) {
      setError("Sprint wajib diisi.");
      return;
    }
    if (!isUrlValid(taskLink.trim())) {
      setError("Task / Card Link harus berupa URL valid (http/https).");
      return;
    }
    if (selectedProjectIds.size === 0) {
      setError("Pilih minimal satu project.");
      return;
    }
    if (selectedTCs.size === 0) {
      setError("Pilih minimal satu test case.");
      return;
    }
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
              payload
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
      console.error(e);
      setError("Terjadi kesalahan.");
      setPending(false);
    }
  };

  const listBoxStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: 260,
  };

  const listScrollStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "0.35rem",
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

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {/* Body */}
      <div style={{ padding: "1.25rem" }}>
        {/* Form inputs: 4 baris — Run Name full width, sisanya 2 kolom */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
              gridColumn: "1 / -1",
            }}
          >
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Run Name<span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="mis. Enhancement Membership"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Tipe Activity <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <Select
              value={activityType}
              ariaLabel="Tipe activity"
              onChange={(e) => setActivityType(e.target.value)}
            >
              <option value="">Pilih Tipe Activity</option>
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Environment <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <Select
              value={environment}
              ariaLabel="Environment"
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="">Pilih Environment</option>
              {ENVIRONMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Sprint <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              value={sprint}
              onChange={(e) => setSprint(e.target.value)}
              placeholder="mis. Sprint 16"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Task / Card Link <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="url"
              value={taskLink}
              onChange={(e) => setTaskLink(e.target.value)}
              placeholder="mis. https://app.clickup.com/..."
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Platform <span style={{ color: "#EF4444" }}>*</span>
            </label>
            {/* Checkbox inline — tanpa box pembungkus & tanpa pill, karena
                Platform mendukung multi-selection. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "1.25rem",
                minHeight: 38,
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
                      gap: "0.4rem",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPlatforms((prev) => {
                          const next = new Set(prev);
                          if (next.has(opt)) next.delete(opt);
                          else next.add(opt);
                          return next;
                        })
                      }
                      style={{ margin: 0, cursor: "pointer" }}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Project <span style={{ color: "#EF4444" }}>*</span>
            </label>
            {/* Multi-Select Tag Input — terkunci sampai Platform dipilih,
                karena daftar project memang bergantung pada Platform. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                padding: "0.35rem 0.4rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                minHeight: 38,
                background: hasSelectedPlatform ? "#fff" : "#F8FAFC",
                alignItems: "center",
                opacity: hasSelectedPlatform ? 1 : 0.7,
              }}
            >
              {/* Saat disabled tidak ada badge sama sekali — hanya placeholder. */}
              {hasSelectedPlatform &&
                Array.from(selectedProjectIds).map((pid) => (
                <span
                  key={pid}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    background: "#FCD34D",
                    color: "#0F172A",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "0.2rem 0.45rem",
                    borderRadius: 999,
                  }}
                >
                  {projectNameMap.get(pid)}
                  <button
                    type="button"
                    aria-label={`Hapus ${projectNameMap.get(pid)}`}
                    onClick={() => toggleProject(pid)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      display: "inline-flex",
                      cursor: "pointer",
                      color: "#334155",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#000000")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#334155")}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <Select
                value=""
                ariaLabel="Tambah project"
                disabled={!hasSelectedPlatform}
                style={{
                  flex: 1,
                  minWidth: 90,
                  border: "none",
                  background: "transparent",
                }}
                onChange={(e) => {
                  if (e.target.value) toggleProject(e.target.value);
                }}
              >
                <option value="">
                  {hasSelectedPlatform ? "+ Tambah project" : "Pilih Platform terlebih dahulu"}
                </option>
                {selectableProjects
                  .filter((p) => !selectedProjectIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Selection area: Suites (unified + badge project) | Test Cases */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
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
                      {/* Badge project context */}
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          color: "#0F172A",
                          background: "#FCD34D",
                          padding: "0.05rem 0.4rem",
                          borderRadius: 999,
                          flexShrink: 0,
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
          <div style={listBoxStyle}>
            <div style={{ padding: "0.6rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>
                Test Cases
              </div>
            </div>
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
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          marginTop: 8,
                          marginBottom: 4,
                          background: "rgba(241, 245, 249, 0.7)",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#475569",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
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
                          style={{ cursor: "pointer", flexShrink: 0, margin: 0 }}
                        />
                        <FolderOpen size={12} style={{ flexShrink: 0 }} />
                        <span>{g.name}</span>
                        {selectedInSection > 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#B45309",
                              background: "rgba(255, 195, 72, 0.35)",
                              border: "1px solid #FFC348",
                              borderRadius: 999,
                              padding: "0.05rem 0.4rem",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              textTransform: "none",
                              letterSpacing: 0,
                            }}
                          >
                            {selectedInSection}/{g.items.length} Selected
                          </span>
                        )}
                        {/* Chevron di pojok kanan: rotasi halus saat open/close */}
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
                            marginLeft: "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            color: "#64748B",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <ChevronDown
                            size={14}
                            aria-hidden="true"
                            style={{
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: "0.6rem" }}>
            Selected Test Cases Preview
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
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ color: "#6B7280", textAlign: "left", background: "#F9FAFB", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, width: 180 }}>Project</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, width: 180 }}>Suite</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Test Case</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, width: 60, textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {previewSectionGroups.map((g) => (
                    <Fragment key={g.key}>
                      {/* Baris header Section di dalam tabel preview */}
                      <tr>
                        <td colSpan={4} style={{ padding: "4px 8px 0" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 8px",
                              background: "rgba(241, 245, 249, 0.7)",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#475569",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            <FolderOpen size={12} style={{ flexShrink: 0 }} />
                            {g.name}
                          </div>
                        </td>
                      </tr>
                      {g.items.map((t) => (
                    <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.45rem 0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: "#0F172A",
                            background: "#FCD34D",
                            padding: "0.1rem 0.45rem",
                            borderRadius: 999,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.projectId ? (projectNameMap.get(t.projectId) ?? "—") : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "0.45rem 0.75rem", color: "#374151" }}>{t.suiteName || "—"}</td>
                      <td style={{ padding: "0.45rem 0.75rem" }}>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.72rem", color: "#1D4ED8", fontWeight: 600 }}>
                          {t.tcId}
                        </span>
                        <span style={{ color: "#374151", marginLeft: "0.4rem" }}>{t.title}</span>
                      </td>
                      <td style={{ padding: "0.45rem 0.75rem", textAlign: "center" }}>
                        <button
                          type="button"
                          aria-label={`Hapus ${t.tcId}`}
                          onClick={() => toggleTC(t.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#9CA3AF",
                            cursor: "pointer",
                            padding: "0.2rem",
                            display: "inline-flex",
                          }}
                          title="Hapus dari pilihan"
                        >
                          <X size={14} />
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
          padding: "0.9rem 1.25rem",
          borderTop: "1px solid var(--border)",
          background: "rgba(248, 250, 252, 0.9)",
          backdropFilter: "blur(6px)",
          flexWrap: "wrap",
        }}
      >
        {/* Summary counter (kiri) */}
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {selectedCount} Test Case{selectedCount === 1 ? "" : "s"} Selected across{" "}
          {selectedProjectIds.size} Project{selectedProjectIds.size === 1 ? "" : "s"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              minWidth: 170,
              padding: "0 16px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              background: "#fff",
              color: "#334155",
              fontWeight: 600,
              fontSize: 12,
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F1F5F9";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={pending || !isFormValid}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 40,
              minWidth: 170,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#FFC348",
              color: "#0F172A",
              fontWeight: 600,
              fontSize: 12,
              cursor: pending || !isFormValid ? "not-allowed" : "pointer",
              opacity: !isFormValid ? 0.5 : 1,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (isFormValid && !pending) e.currentTarget.style.background = "#F0B53D";
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
    </div>
  );
}
