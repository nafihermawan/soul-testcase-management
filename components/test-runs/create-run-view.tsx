"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExpressRunForm, PLATFORM_ENUM_TO_LABEL } from "@/components/test-runs/express-run";
import { ErrorBlock, FormCardSkeleton, HeaderDetailSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import { useMe } from "@/lib/client/me-context";
import type { BugDetailPayload, RunOptionsPayload } from "@/types/api";

/**
 * Query param halaman Create Express Run (dibaca di server page lalu diteruskan,
 * sama seperti `ActiveRunsSearchParams` / `HistorySearchParams`). Sengaja TIDAK
 * memakai `useSearchParams()` di komponen klien: hook itu memaksa halaman ini
 * butuh Suspense boundary saat di-prerender, dan build produksi gagal tanpanya.
 */
export type CreateRunSearchParams = { bugId?: string };

export function CreateRunView({ searchParams }: { searchParams?: CreateRunSearchParams }) {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const role = me?.role;
  const blocked = !!me && role !== "QA";

  // Hanya QA yang dapat membuat Express Run.
  useEffect(() => {
    if (blocked) router.replace("/test-runs");
  }, [blocked, router]);

  // Payload langsung diminta tanpa menunggu role; server tetap menolak (403)
  // bila role tidak berhak, dan halaman mengalihkan user.
  const { data, error, loading, reload } = useApi<RunOptionsPayload>("/api/test-runs/options");

  // Referensi bug: tombol "Test" di Bugs Tracker mengarah ke
  // `/test-runs/create?bugId=…`. Datanya diambil ulang di sini (bukan dari query)
  // supaya nilainya otoritatif, lalu dipakai untuk mengisi (prefill) form.
  const bugId = searchParams?.bugId;
  const bugRef = useApi<BugDetailPayload>(bugId ? `/api/bugs/${bugId}` : null);
  const bug = bugRef.data?.bug ?? null;

  // Hierarki pengetesan bug: project-nya (fallback ke project pemilik suite-nya,
  // untuk baris lama yang projectId-nya kosong), lalu label Platform-nya.
  const bugSuiteId = bug?.suite?.id;
  const bugSuite = bugSuiteId ? data?.suites.find((s) => s.id === bugSuiteId) : undefined;
  const bugProjectId = bug?.project?.id ?? bugSuite?.projectId;
  const bugProject = bugProjectId ? data?.projects.find((p) => p.id === bugProjectId) : undefined;
  const bugPlatformLabel = bugProject?.platform
    ? PLATFORM_ENUM_TO_LABEL[bugProject.platform]
    : undefined;

  if (meLoading || !me || blocked) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <HeaderDetailSkeleton />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  // Form hanya boleh di-MOUNT setelah opsi run DAN detail bug selesai dimuat.
  // `ExpressRunForm` membaca `prefill` sekali di initial state, jadi kalau form
  // ter-mount sebelum bug tiba, semua field akan tetap kosong.
  if (loading || !data || (bugId && bugRef.loading)) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <HeaderDetailSkeleton />
        <FormCardSkeleton />
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily: "var(--font-sans)",
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        display: "flex",
        flexDirection: "column",
        background: "#F1F3F6",
      }}
    >
      {/* SATU card: Header → inset divider → Body → Footer. */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E3E7EE",
          borderRadius: 18,
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          fontFamily: '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ padding: "22px 22px 20px", flexShrink: 0 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "#0F172A",
              letterSpacing: "-0.02em",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Create Express Run
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#475569", margin: "6px 0 0" }}>
            Isi detail run dan pilih suite/test case yang ingin dieksekusi.
          </p>
        </div>

        {/* Inset divider */}
        <div aria-hidden="true" style={{ height: 1, background: "#E8ECF1", margin: "0 22px", flexShrink: 0 }} />

        <ExpressRunForm
          // Form membaca `prefill` hanya sekali di initial state, jadi re-init
          // saat referensi bug-nya berubah (mis. navigasi ke bug lain).
          key={bug ? `bug-${bug.id}` : "new"}
          projectId=""
          projects={data.projects}
          prefill={
            bug
              ? {
                  // Run Name: prefix `[Bug Test]` + judul bug (tetap bisa diedit).
                  name: `[Bug Test] ${bug.title}`,
                  // Flow re-test dari bug → Tipe Activity default "Bug Fix".
                  activityType: "Bug Fix",
                  environment: bug.environment ?? undefined,
                  // Salin referensi Task/Card Link bug (mis. Jira/ClickUp/Drive).
                  taskLink: bug.externalLink ?? undefined,
                  // Hierarki pengetesan ikut terisi: Platform → Project → Suite,
                  // sehingga kolom kanan langsung memuat TC suite tersebut.
                  platforms: bugPlatformLabel ? [bugPlatformLabel] : undefined,
                  projectIds: bugProjectId ? [bugProjectId] : undefined,
                  suiteId: bug.suite?.id ?? undefined,
                  sourceBugId: bug.id,
                }
              : undefined
          }
        />
      </div>
    </main>
  );
}
