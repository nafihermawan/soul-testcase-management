"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Pencil, Plus } from "lucide-react";
import { TestCaseForm } from "@/components/hierarchy/test-case-form";
import type { TestCase } from "@/components/hierarchy/test-cases-shared";
import { updateTestCase } from "@/lib/actions/test-cases";
import { AutomationTab } from "@/components/test-cases/automation-tab";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { TestCasePageHeader } from "@/components/test-cases/detail-header";
import { BugsTab } from "@/components/test-cases/bugs-tab";
import { Tabs } from "@/components/test-cases/tabs";
import { TestDataBlock } from "@/components/test-cases/test-data-block";
import { TestStepsList } from "@/components/test-cases/test-steps-list";
import { runStatusLabel } from "@/components/test-runs/test-run-status-badge";
import { ErrorBlock, NotFoundBlock, SuiteSkeleton } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import type { TestCaseDetailPayload } from "@/types/api";

/** Warna "dot + teks" (tanpa pill) untuk hasil eksekusi per run. */
const RESULT_TONE: Record<string, { label: string; dot: string; text: string }> = {
  PASS: { label: "Passed", dot: "#16A34A", text: "#15803D" },
  FAIL: { label: "Failed", dot: "#DC2626", text: "#B91C1C" },
  SKIPPED: { label: "Skipped", dot: "#A855F7", text: "#7E22CE" },
  BLOCKED: { label: "Blocked", dot: "#D97706", text: "#B45309" },
  NOT_RUN: { label: "Not Run", dot: "#94A3B8", text: "#64748B" },
};

/** Grid kolom tabel Run History (dipakai header & setiap baris). */
const RUN_HISTORY_COLS = "minmax(220px, 1.2fr) 120px minmax(300px, 2fr) 170px";

/** Ambang panjang Actual Result untuk memunculkan tombol "Lihat selengkapnya". */
const ACTUAL_RESULT_CLAMP_CHARS = 110;

type RunHistoryItem = TestCaseDetailPayload["runResults"][number];

/** Satu item ringkasan hasil (Passed / Failed / Skipped). */
function SummaryItem({
  dot,
  textColor,
  label,
  count,
}: {
  dot: string;
  textColor: string;
  label: string;
  count: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }}
      />
      <span style={{ fontSize: 14, color: "#475569" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>{count}</span>
    </span>
  );
}

/** Baris tabel Run History — state local untuk expand Actual Result. */
function RunHistoryRow({ run, first }: { run: RunHistoryItem; first: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const tone = RESULT_TONE[run.status] ?? RESULT_TONE.NOT_RUN;
  const text = run.actualResult ?? "";
  const isLong = text.length > ACTUAL_RESULT_CLAMP_CHARS;
  const clamped = isLong && !expanded;

  const textStyle: React.CSSProperties = { fontSize: 14, lineHeight: "22px", color: "#334155" };
  if (clamped) {
    textStyle.display = "-webkit-box";
    textStyle.WebkitLineClamp = 2;
    textStyle.WebkitBoxOrient = "vertical";
    textStyle.overflow = "hidden";
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: RUN_HISTORY_COLS,
        gap: 20,
        padding: "16px 24px",
        alignItems: "start",
        borderTop: first ? "none" : "1px solid #EEF0F3",
      }}
    >
      {/* Run: nama (link) + status run di bawahnya */}
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/test-runs/${run.run.id}`}
          className="tc-link-blue"
          style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}
        >
          {run.run.name}
        </Link>
        {/* Status run (mis. "Run completed"); label lama tetap dipakai agar tidak
            salah untuk run yang belum selesai. */}
        <div style={{ marginTop: 4, fontSize: 13, color: "#64748B" }}>
          Run {runStatusLabel(run.run.status).toLowerCase()}
        </div>
      </div>

      {/* Hasil: dot + teks, tanpa pill */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: "50%", background: tone.dot, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, lineHeight: "22px", fontWeight: 600, color: tone.text }}>
          {tone.label}
        </span>
      </div>

      {/* Actual Result: clamp 2 baris + toggle untuk teks panjang */}
      <div style={{ minWidth: 0 }}>
        {text.trim() ? (
          <>
            <div style={textStyle}>{text}</div>
            {isLong && (
              <button
                type="button"
                className="tc-expand-btn"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                style={{ marginTop: 6 }}
              >
                {expanded ? "Sembunyikan" : "Lihat selengkapnya"}
              </button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 14, lineHeight: "22px", color: "#334155" }}>—</span>
        )}
      </div>

      {/* Waktu Eksekusi */}
      <div style={{ fontSize: 14, lineHeight: "22px", color: "#334155" }}>
        {formatDateTime(run.updatedAt)}
      </div>
    </div>
  );
}

/** Label bagian pada card Detail (mis. "DESKRIPSI", "TEST STEPS"). */
const sectionLabelStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 8,
  fontSize: 12,
  fontWeight: 600,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

/** Satu bagian card Detail: padding 20px 0 + garis pemisah antar-bagian. */
function Section({ last, children }: { last?: boolean; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: "20px 0",
        borderBottom: last ? "none" : "1px solid #EEF0F3",
      }}
    >
      {children}
    </section>
  );
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ---------- Tab Activity: pengelompokan per tanggal + timeline ---------- */

type ActivityItem = TestCaseDetailPayload["activities"][number];

/** Kunci kelompok tanggal (waktu lokal) agar entri hari yang sama menyatu. */
function activityDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Label tanggal kelompok, mis. "29 Okt 2026" (uppercase ditangani CSS). */
function activityDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Jam saja (tanggal sudah jadi label kelompok), mis. "15.26". */
function activityTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kalimat aktivitas tanpa ID test case; dua varian: buat/impor vs update. */
function activitySentence(a: ActivityItem): string {
  if (a.action === "CREATED") {
    return a.detail?.toLowerCase().includes("impor")
      ? "mengimpor test case ini"
      : "membuat test case ini";
  }
  return "memperbarui detail test case";
}

/** Satu entri timeline aktivitas. */
function ActivityRow({ a, last }: { a: ActivityItem; last: boolean }) {
  const isCreate = a.action === "CREATED";
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr auto",
        columnGap: 14,
      }}
    >
      {/* Kolom ikon + garis penghubung ke entri berikutnya */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isCreate ? "#DCFCE7" : "#F1F5F9",
            color: isCreate ? "#15803D" : "#475569",
            flexShrink: 0,
          }}
        >
          {isCreate ? <Plus size={14} /> : <Pencil size={13} />}
        </span>
        {/* Entri terakhir dalam kelompok tidak diberi garis. */}
        {!last && (
          <span
            aria-hidden="true"
            style={{
              width: 2,
              flex: 1,
              minHeight: 14,
              margin: "4px 0",
              borderRadius: 1,
              background: "#E2E8F0",
            }}
          />
        )}
      </div>

      {/* Kolom teks: nama pelaku ditebalkan di depan */}
      <div style={{ padding: "3px 0 18px", fontSize: 15, lineHeight: "22px", color: "#334155" }}>
        <strong style={{ fontWeight: 600, color: "#0F172A" }}>{a.user?.name ?? "Unknown"}</strong>{" "}
        {activitySentence(a)}
      </div>

      {/* Kolom jam */}
      <div
        style={{
          paddingTop: 3,
          fontSize: 14,
          lineHeight: "22px",
          color: "#475569",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {activityTime(a.createdAt)}
      </div>
    </li>
  );
}

/** Tombol ikon salin ID test case (32×32). */
function CopyIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="tc-idcopy btn-radius-8"
      aria-label="Salin ID test case"
    >
      {copied ? <Check size={15} color="#15803D" /> : <Copy size={15} />}
    </button>
  );
}

/** Satu baris card Informasi: label (dt) kiri, nilai (dd) kanan. */
function InfoRow({
  label,
  last,
  tight,
  children,
}: {
  label: string;
  last?: boolean;
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: tight ? "9px 0" : "14px 0",
        borderBottom: last ? "none" : "1px solid #EEF0F3",
        fontSize: 14,
      }}
    >
      <dt style={{ color: "#64748B", flexShrink: 0 }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontWeight: 500,
          color: "#0F172A",
          textAlign: "right",
          minWidth: 0,
          wordBreak: "break-word",
        }}
      >
        {children}
      </dd>
    </div>
  );
}

/** Urutan kunci tab — dipakai untuk memvalidasi `?tab=` dan default "detail". */
const TAB_KEYS = ["detail", "automation", "runs", "bugs", "activity", "attachments"];

export function TestCaseDetailView({
  testCaseId,
  initialTab,
  initialEdit = null,
}: {
  testCaseId: string;
  initialTab?: string;
  /** Deep-link `?edit=<tcId>`: buka modal edit langsung saat mount. */
  initialEdit?: string | null;
}) {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<TestCaseDetailPayload>(
    `/api/test-cases/${testCaseId}`
  );
  // Tab aktif diangkat ke sini karena tombol Edit di header hanya tampil saat
  // tab "Detail" aktif (Tabs melaporkan perubahannya lewat onChange).
  const [activeTab, setActiveTab] = useState<string>(() =>
    initialTab && TAB_KEYS.includes(initialTab) ? initialTab : "detail"
  );
  // Modal edit dikelola di halaman INI (local state) supaya menyimpan/menutup
  // tidak pernah memindahkan user keluar dari halaman detail.
  const [editOpen, setEditOpen] = useState<boolean>(Boolean(initialEdit));
  useEffect(() => {
    if (initialEdit) setEditOpen(true);
  }, [initialEdit]);

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Test case tidak ditemukan" />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <SuiteSkeleton />
      </main>
    );
  }

  const tc = data;
  if (!tc.suite) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Test case tidak ditemukan" message="Test case tidak terhubung ke suite mana pun." />
      </main>
    );
  }

  /** Buka modal edit di halaman ini (URL disinkronkan `?edit=` untuk deep-link). */
  const openEdit = () => {
    setEditOpen(true);
    const params = new URLSearchParams(window.location.search);
    params.set("edit", tc.id);
    router.replace(`/test-cases/${tc.id}?${params.toString()}`, { scroll: false });
  };

  /** Tutup modal: tetap di halaman ini, hanya hapus query `edit` dari URL. */
  const closeEdit = () => {
    setEditOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (params.has("edit")) {
      params.delete("edit");
      const qs = params.toString();
      router.replace(`/test-cases/${tc.id}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  };

  // Nilai awal form edit — bentuk `TestCase` (dipakai bersama TestCaseForm).
  const editInitial: TestCase = {
    id: tc.id,
    tcId: tc.tcId,
    title: tc.title,
    scenario: tc.scenario,
    precondition: tc.precondition,
    steps: tc.steps,
    testData: tc.testData,
    expectedResult: tc.expectedResult,
    priority: tc.priority,
    status: tc.status,
    type: tc.type,
    sectionId: tc.sectionId,
    createdAt: tc.createdAt,
    createdBy: tc.createdBy,
  };

  const stepsList = (tc.steps ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);

  const stepExpectedResults = (tc.expectedResult ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);
  // Expected Result per langkah hanya bila jumlahnya sepadan dengan jumlah langkah.
  const showPerStep = stepsList.length > 0 && stepExpectedResults.length === stepsList.length;
  // Bagian "Expected Result" global ditampilkan hanya saat hasil belum terpetakan
  // per langkah (logika lama dipertahankan).
  const showExpectedSection = !showPerStep;

  const tabDetail = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 340px",
        gap: 20,
        alignItems: "start",
      }}
    >
      {/* ===== Card Detail (kiri) ===== */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: "8px 28px",
        }}
      >
        {/* Deskripsi / Skenario */}
        <Section>
          <h2 style={sectionLabelStyle}>Deskripsi</h2>
          {tc.scenario?.trim() ? (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: "24px",
                color: "#0F172A",
                whiteSpace: "pre-wrap",
              }}
            >
              {tc.scenario}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>
              Tidak ada deskripsi skenario.
            </p>
          )}
        </Section>

        {/* Preconditions */}
        <Section>
          <h2 style={sectionLabelStyle}>Preconditions</h2>
          {tc.precondition?.trim() ? (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: "24px",
                color: "#0F172A",
                whiteSpace: "pre-wrap",
              }}
            >
              {tc.precondition}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>Tidak ada precondition.</p>
          )}
        </Section>

        {/* Test Steps — daftar bernomor; expected (bila ada) di bawah tiap langkah */}
        <Section>
          <h2 style={{ ...sectionLabelStyle, marginBottom: 12 }}>
            Test Steps <span style={{ color: "#94A3B8" }}>· {stepsList.length}</span>
          </h2>
          {stepsList.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                border: "1px dashed #CBD5E1",
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <span style={{ fontSize: 14, color: "#64748B" }}>Belum ada langkah pengujian.</span>
              {tc.canEdit && (
                <button type="button" className="tc-add-step" onClick={openEdit}>
                  + Tambah langkah
                </button>
              )}
            </div>
          ) : (
            <TestStepsList steps={stepsList} expectedResults={stepExpectedResults} />
          )}
        </Section>

        {/* Test Data */}
        <Section last={!showExpectedSection}>
          <TestDataBlock data={tc.testData} />
        </Section>

        {/* Expected Result (global, bila tidak terpetakan per langkah) */}
        {showExpectedSection && (
          <Section last>
            <h2 style={sectionLabelStyle}>Expected Result</h2>
            {tc.expectedResult?.trim() ? (
              <div
                style={{
                  borderLeft: "3px solid #16A34A",
                  paddingLeft: 14,
                  fontSize: 15,
                  lineHeight: "24px",
                  color: "#0F172A",
                  whiteSpace: "pre-wrap",
                }}
              >
                {tc.expectedResult}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>
                Tidak ada expected result.
              </p>
            )}
          </Section>
        )}
      </div>

      {/* ===== Card Informasi (kanan) ===== */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: "8px 24px",
        }}
      >
        <div
          style={{
            padding: "16px 0 12px",
            borderBottom: "1px solid #EEF0F3",
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#64748B",
          }}
        >
          Informasi
        </div>

        <dl style={{ margin: 0 }}>
          <InfoRow label="ID" tight>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 500, color: "#0F172A" }}>
                {tc.tcId}
              </span>
              <CopyIdButton value={tc.tcId} />
            </span>
          </InfoRow>
          <InfoRow label="Project">
            <Link href={`/projects/${tc.suite.project.id}`} className="tc-link-blue">
              {tc.suite.project.name}
            </Link>
          </InfoRow>
          <InfoRow label="Suite">
            <Link href={`/suites/${tc.suite.id}`} className="tc-link-blue">
              {tc.suite.name}
            </Link>
          </InfoRow>
          <InfoRow label="Author">{tc.createdBy?.name ?? "—"}</InfoRow>
          <InfoRow label="Dibuat">{formatDate(tc.createdAt)}</InfoRow>
          <InfoRow label="Terakhir diubah" last>
            {formatDateTime(tc.updatedAt)}
          </InfoRow>
        </dl>
      </div>
    </div>
  );

  // Ringkasan hasil run untuk test case ini (bahan baris ringkasan di atas tabel).
  const runSummary = {
    passed: tc.runResults.filter((r) => r.status === "PASS").length,
    failed: tc.runResults.filter((r) => r.status === "FAIL").length,
    skipped: tc.runResults.filter((r) => r.status === "SKIPPED").length,
  };

  const tabRunHistory = (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Baris ringkasan hasil — hanya bila sudah ada riwayat run. */}
      {tc.runResults.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "16px 24px",
            borderBottom: "1px solid #EEF0F3",
            flexWrap: "wrap",
          }}
        >
          <SummaryItem dot="#16A34A" textColor="#15803D" label="Passed" count={runSummary.passed} />
          <SummaryItem dot="#DC2626" textColor="#B91C1C" label="Failed" count={runSummary.failed} />
          <SummaryItem dot="#A855F7" textColor="#7E22CE" label="Skipped" count={runSummary.skipped} />
        </div>
      )}

      {tc.runResults.length === 0 ? (
        /* Empty state: belum ada riwayat run. */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
            Belum pernah dieksekusi
          </div>
          <div style={{ fontSize: 14, color: "#64748B" }}>
            Riwayat akan muncul setelah test case ini dijalankan dalam sebuah run.
          </div>
        </div>
      ) : (
        /* Tabel dibungkus area scroll mendatar; min-width 860px. */
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 860 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: RUN_HISTORY_COLS,
                gap: 20,
                height: 44,
                alignItems: "center",
                padding: "0 24px",
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF0F3",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#64748B",
              }}
            >
              <span>Run</span>
              <span>Hasil</span>
              <span>Actual Result</span>
              <span>Waktu Eksekusi</span>
            </div>
            {/* Urutan runResults sudah dari run terbaru ke terlama (API: updatedAt desc). */}
            {tc.runResults.map((r, i) => (
              <RunHistoryRow key={r.id} run={r} first={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Kelompokkan aktivitas per tanggal; urutan dari API sudah terbaru dulu,
  // dan Map menjaga urutan penyisipan sehingga kelompok terbaru tetap di atas.
  const activityGroupMap = new Map<string, { key: string; label: string; items: ActivityItem[] }>();
  for (const a of tc.activities) {
    const key = activityDayKey(a.createdAt);
    let g = activityGroupMap.get(key);
    if (!g) {
      g = { key, label: activityDayLabel(a.createdAt), items: [] };
      activityGroupMap.set(key, g);
    }
    g.items.push(a);
  }
  const activityGroups = Array.from(activityGroupMap.values());

  const tabActivity = (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        padding: "4px 28px 12px",
      }}
    >
      {tc.activities.length === 0 ? (
        /* Empty state: belum ada aktivitas. */
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            fontSize: 15,
            fontWeight: 600,
            color: "#0F172A",
          }}
        >
          Belum ada aktivitas
        </div>
      ) : (
        activityGroups.map((g, gi) => (
          <section
            key={g.key}
            style={{
              padding: "20px 0 4px",
              // Kelompok kedua dan seterusnya diberi garis pemisah.
              borderTop: gi === 0 ? "none" : "1px solid #EEF0F3",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#64748B",
                marginBottom: 14,
              }}
            >
              {g.label}
            </div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.items.map((a, i) => (
                <ActivityRow key={a.id} a={a} last={i === g.items.length - 1} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );

  const tabAttachments = (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        padding: "1.5rem",
      }}
    >
      <AttachmentsPanel
        owner={{ testCaseId: tc.id }}
        attachments={tc.attachments ?? []}
        canEdit={tc.canEdit}
      />
    </div>
  );

  return (
    <main className="tc-detail-root">
      <RefreshContext.Provider value={reload}>
        <div
          style={{
            // Tanpa batas lebar: selalu mengisi lebar layar (tidak ada area abu
            // kosong di kiri/kanan saat layar lebar / di-zoom out).
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Card header: breadcrumb + judul/meta + aksi Edit (hanya tab Detail) */}
          <TestCasePageHeader
            title={tc.title}
            status={tc.status}
            priority={tc.priority}
            project={tc.suite.project}
            suite={tc.suite}
            canEdit={tc.canEdit}
            showEdit={activeTab === "detail"}
            onEdit={openEdit}
          />

          {/* Tab bar → konten */}
          <Tabs
            initialKey={activeTab}
            onChange={setActiveTab}
            tabs={[
              { key: "detail", label: "Detail", content: tabDetail },
              {
                key: "automation",
                label: "Automation",
                content: (
                  <AutomationTab
                    testCaseId={tc.id}
                    automation={
                      tc.automation
                        ? {
                            id: tc.automation.id,
                            externalTestId: tc.automation.externalTestId,
                            scriptPath: tc.automation.scriptPath,
                            status: tc.automation.status,
                            lastRunAt: tc.automation.lastRunAt,
                            lastResult: tc.automation.lastResult,
                          }
                        : null
                    }
                  />
                ),
              },
              { key: "runs", label: "Run History", content: tabRunHistory },
              {
                key: "bugs",
                label: "Bugs",
                badge: tc.bugs.length,
                content: <BugsTab bugs={tc.bugs} />,
              },
              { key: "activity", label: "Activity", content: tabActivity },
              {
                key: "attachments",
                label: "Attachments",
                badge: tc.attachments.length,
                content: tabAttachments,
              },
            ]}
          />
        </div>

        {/* Modal edit Test Case — dikelola di halaman ini; menyimpan/menutup
            tetap berada di halaman detail (tidak ada redirect). */}
        {editOpen && (
          <TestCaseForm
            key={editInitial.id}
            title="Edit Test Case"
            suiteName={tc.suite.name}
            suiteId={tc.suite.id}
            initial={editInitial}
            submitLabel="Simpan Perubahan"
            onCancel={closeEdit}
            onSubmit={async (fd) => {
              fd.set("id", tc.id);
              const res = await updateTestCase(fd);
              // Sukses: form memanggil onCancel (closeEdit) → tetap di halaman
              // ini. Refetch payload detail agar UI langsung terbarui.
              if (res.success) reload();
              return res;
            }}
          />
        )}
      </RefreshContext.Provider>
    </main>
  );
}
