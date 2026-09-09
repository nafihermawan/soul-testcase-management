"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, RotateCcw, Search, X } from "lucide-react";
import { createTestRun } from "@/lib/actions/test-runs";

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
};

type Props = {
  projectId: string;
  projects: { id: string; name: string }[];
  suites: SuiteOption[];
  testCases: TCOption[];
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

export function ExpressRunForm({ projectId, projects, suites, testCases }: Props) {
  const router = useRouter();
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(projectId ? [projectId] : projects[0]?.id ? [projects[0].id] : [])
  );
  // Global selection (persisten lintas suite/project)
  const [selectedTCs, setSelectedTCs] = useState<Set<string>>(new Set());
  // Suite aktif yang sedang dilihat di kolom kiri
  const [activeSuiteId, setActiveSuiteId] = useState<string | null>(null);
  const [runName, setRunName] = useState("");
  const [activityType, setActivityType] = useState("");
  const [platforms, setPlatforms] = useState<Set<string>>(new Set());
  const [environment, setEnvironment] = useState("");
  const [sprint, setSprint] = useState("");
  const [taskLink, setTaskLink] = useState("");
  const [suiteQuery, setSuiteQuery] = useState("");
  const [tcQuery, setTcQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Semua suite dari seluruh project terpilih (unified)
  const availableSuites = useMemo(
    () => suites.filter((s) => selectedProjectIds.has(s.projectId)),
    [suites, selectedProjectIds]
  );

  const filteredSuites = useMemo(() => {
    const q = suiteQuery.trim().toLowerCase();
    if (!q) return availableSuites;
    return availableSuites.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.path.toLowerCase().includes(q)
    );
  }, [availableSuites, suiteQuery]);

  // TC dari suite yang sedang aktif (kolom kanan menampilkan suite ini saja)
  const visibleTCs = useMemo(
    () =>
      activeSuiteId
        ? testCases.filter((t) => t.suiteId === activeSuiteId)
        : [],
    [testCases, activeSuiteId]
  );

  const filteredTCs = useMemo(() => {
    const q = tcQuery.trim().toLowerCase();
    if (!q) return visibleTCs;
    return visibleTCs.filter(
      (t) => t.title.toLowerCase().includes(q) || t.tcId.toLowerCase().includes(q) || t.suiteName.toLowerCase().includes(q)
    );
  }, [visibleTCs, tcQuery]);

  // Jumlah suite dipilih = suite yang punya >=1 TC terpilih? Tidak; pakai active project.
  const allTCsSelected =
    filteredTCs.length > 0 && filteredTCs.every((t) => selectedTCs.has(t.id));

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

  const toggleAllTCs = () => {
    setSelectedTCs((prev) => {
      const next = new Set(prev);
      if (allTCsSelected) {
        filteredTCs.forEach((t) => next.delete(t.id));
      } else {
        filteredTCs.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const reset = () => {
    setSelectedProjectIds(
      new Set(projectId ? [projectId] : projects[0]?.id ? [projects[0].id] : [])
    );
    setActiveSuiteId(null);
    setSelectedTCs(new Set());
    setRunName("");
    setActivityType("");
    setPlatforms(new Set());
    setEnvironment("");
    setSprint("");
    setTaskLink("");
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
      const res = await createTestRun(
        Array.from(selectedProjectIds),
        runName,
        selectedSuiteIds,
        Array.from(selectedTCs),
        { sprint, taskLink, activityType, environment, platforms: Array.from(platforms) }
      );
      if (res.success && res.runId) {
        router.push(`/test-runs/${res.runId}`);
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

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {/* Body */}
      <div style={{ padding: "1.25rem" }}>
        {/* Form inputs: 3x2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Nama Run <span style={{ color: "#EF4444" }}>*</span>
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
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Pilih Tipe Activity</option>
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Environment <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Pilih Environment</option>
              {ENVIRONMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Platform <span style={{ color: "#EF4444" }}>*</span>
            </label>
            {/* Multi-select platform tags */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                padding: "0.35rem 0.4rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                minHeight: 38,
                background: "#fff",
                alignItems: "center",
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
                      gap: "0.25rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: checked ? "#FEF3C7" : "#F3F4F6",
                      color: checked ? "#92400E" : "#4B5563",
                      border: checked ? "1px solid #FCD34D" : "1px solid transparent",
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
              Project <span style={{ color: "#EF4444" }}>*</span>
            </label>
            {/* Multi-Select Tag Input */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.35rem",
                padding: "0.35rem 0.4rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                minHeight: 38,
                background: "#fff",
                alignItems: "center",
              }}
            >
              {Array.from(selectedProjectIds).map((pid) => (
                <span
                  key={pid}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    background: "#EFF6FF",
                    color: "#1D4ED8",
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
                      color: "#1D4ED8",
                      opacity: 0.7,
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleProject(e.target.value);
                }}
                style={{
                  flex: 1,
                  minWidth: 90,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <option value="">+ Tambah project</option>
                {projects
                  .filter((p) => !selectedProjectIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Selection area: Suites (unified + badge project) | Test Cases */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          {/* Suites column: klik suite untuk melihat TC-nya (single active) */}
          <div style={listBoxStyle}>
            <div style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>
                Suites
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {availableSuites.length} tersedia
              </span>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
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
              {selectedProjectIds.size === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                  Pilih project terlebih dahulu.
                </p>
              ) : filteredSuites.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                  Belum ada suite untuk project terpilih.
                </p>
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
                          color: "#1D4ED8",
                          background: "#EFF6FF",
                          padding: "0.05rem 0.4rem",
                          borderRadius: 999,
                          flexShrink: 0,
                        }}
                      >
                        {projectNameMap.get(s.projectId) ?? ""}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", flexShrink: 0, fontFamily: "var(--font-mono, monospace)" }}>
                        {s.code}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Test Cases column: menampilkan TC suite aktif, checkbox sync global */}
          <div style={listBoxStyle}>
            <div style={{ padding: "0.6rem 0.75rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>
                Test Cases
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: selectedTCs.size > 0 ? "var(--brand-600)" : "var(--text-muted)",
                  background: selectedTCs.size > 0 ? "var(--brand-50)" : "transparent",
                  padding: "0.1rem 0.5rem",
                  borderRadius: 999,
                }}
              >
                {selectedTCs.size} Test Case{selectedTCs.size === 1 ? "" : "s"} Selected
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                {activeSuiteId && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={allTCsSelected} onChange={toggleAllTCs} />
                    Select All
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTCs(new Set())}
                  style={{ border: "none", background: "none", color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
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
              {!activeSuiteId ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                  Pilih suite di kolom kiri untuk melihat test case.
                </p>
              ) : filteredTCs.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.5rem" }}>
                  Tidak ada test case di suite ini.
                </p>
              ) : (
                filteredTCs.map((t) => {
                  const checked = selectedTCs.has(t.id);
                  return (
                    <label
                      key={t.id}
                      style={itemStyle(checked)}
                      onMouseEnter={(e) => {
                        if (!checked) e.currentTarget.style.background = "var(--surface-muted)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = checked ? "rgba(255, 195, 72, 0.08)" : "transparent";
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleTC(t.id)} />
                      <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.72rem", color: "var(--brand-600)", fontWeight: 600, flexShrink: 0 }}>
                        {t.tcId}
                      </span>
                      <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                      </span>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          color: "#1D4ED8",
                          background: "#EFF6FF",
                          padding: "0.05rem 0.4rem",
                          borderRadius: 999,
                          flexShrink: 0,
                        }}
                      >
                        {t.projectId ? (projectNameMap.get(t.projectId) ?? "") : ""}
                      </span>
                    </label>
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
                  {selectedTCList.map((t) => (
                    <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.45rem 0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: "#1D4ED8",
                            background: "#EFF6FF",
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
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: "0.85rem", margin: "0.75rem 0 0" }}>{error}</p>
        )}
      </div>

      {/* Footer / action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          padding: "0.9rem 1.25rem",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-muted)",
        }}
      >
        {/* Summary counter (kiri) */}
        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {selectedCount} Test Case{selectedCount === 1 ? "" : "s"} Selected across{" "}
          {selectedProjectIds.size} Project{selectedProjectIds.size === 1 ? "" : "s"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "#fff",
              color: "var(--text-secondary)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
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
              gap: "0.4rem",
              padding: "0.55rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: "#FFB622",
              color: "#1F2937",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: pending || !isFormValid ? "not-allowed" : "pointer",
              opacity: !isFormValid ? 0.5 : 1,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (isFormValid && !pending) e.currentTarget.style.background = "#E0A01E";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#FFB622";
            }}
          >
            <Play size={15} /> {pending ? "Membuat Run..." : "Express Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
