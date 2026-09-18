/**
 * Tipe payload JSON untuk route handler API + view client.
 * Semua tanggal dikirim sebagai ISO string (JSON-safe).
 * Bentuk tiap payload meniru props yang dipakai komponen client eksisting.
 */
import type { Role } from "@/lib/permissions";
import type { ExecutionCounts } from "@/lib/qa-metrics";

export type PlatformCode = "WEB" | "MOBILE" | "HARDWARE" | "API";

/* ---------- Attachment (evidence) ---------- */
export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** Presigned GET URL (kedaluwarsa ~1 jam); null bila presign gagal. */
  url: string | null;
  createdAt: string;
  uploadedBy: { name: string | null } | null;
};

/* ---------- /api/me ---------- */
export type Me = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
};

/* ---------- /api/projects (sidebar) ---------- */
export type SidebarProject = {
  id: string;
  name: string;
  code: string;
  platform: string | null;
};
export type SidebarProjectsPayload = SidebarProject[];

/* ---------- /api/dashboard ---------- */
export type DashboardRunItem = {
  id: string;
  name: string;
  project: string;
  projectId: string;
  platform: PlatformCode | null;
  /** TestRun.environment: DEV | STG | PRE-PROD | PROD */
  environment: string | null;
  status: string;
  executedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Suite yang tercakup di run ini (untuk filter Module). */
  suiteIds: string[];
  /** Distribusi hasil run ini sendiri (PASS/FAIL/BLOCKED/SKIPPED/NOT_RUN). */
  counts: ExecutionCounts;
};

export type DashboardBugItem = {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string | null;
  platform: PlatformCode | null;
  environment: string | null;
  /** Module = suite tempat test case bug berada. */
  suiteId: string | null;
  suiteName: string | null;
  createdAt: string;
};

export type DashboardSuiteCoverageItem = {
  id: string;
  name: string;
  code: string;
  projectId: string;
  platform: PlatformCode | null;
  docUrl: string | null;
  total: number;
  automated: number;
  /** Distribusi TC suite ini menurut hasil TERAKHIR pada run COMPLETED
   *  (latest per TC, tanpa double count). counts.executed = jumlah TC tested. */
  counts: ExecutionCounts;
};

export type DashboardPayload = {
  user: { name: string | null; email: string | null; image: string | null };
  runs: DashboardRunItem[];
  bugs: DashboardBugItem[];
  suiteCoverage: DashboardSuiteCoverageItem[];
};

/* ---------- /api/bugs ---------- */
export type BugStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

/**
 * Asal bug, diturunkan dari relasi yang sudah ada (bukan kolom baru):
 * punya rujukan TestCase = EXECUTION, tanpa rujukan TC = temuan ad-hoc.
 */
export type BugSourceType = "EXECUTION" | "GENERAL_FINDING";

export type BugRow = {
  id: string;
  title: string;
  description: string | null;
  status: BugStatus;
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  /** Diisi saat bug RESOLVED/CLOSED — dipakai sebagai data riwayat. */
  resolvedAt: string | null;
  /** `expectedResult` dipakai modal detail bug untuk section Expected Result. */
  testCase: { id: string; tcId: string; title: string; expectedResult: string | null } | null;
  /** Suite/modul tempat bug ditemukan (diisi untuk temuan ad-hoc). */
  suite: { id: string; name: string } | null;
  /** Project pemilik suite di atas — dasar agregasi jumlah bug per project. */
  project: { id: string; name: string } | null;
  /** Test Run tempat bug ditemukan (bug dari eksekusi); null untuk ad-hoc. */
  run: { id: string; name: string } | null;
  createdBy: { name: string | null } | null;
  /** Evidence yang menempel langsung ke bug ini. */
  attachments: AttachmentItem[];
  /** EXECUTION kalau bug terhubung ke sebuah TestCase. */
  sourceType: BugSourceType;
};

export type BugsPayload = { bugs: BugRow[]; /** Upload evidence butuh role QA. */ canAttach: boolean };

/** Field konten bug yang boleh diubah lewat Edit Bug (dipakai detail & edit modal). */
export type BugEditableFields = {
  title: string;
  description: string | null;
  severity: string | null;
  externalLink: string | null;
};

/* ---------- /api/suites ---------- */
export type SuiteOption = {
  id: string;
  name: string;
  code: string;
  projectName: string;
  /** Platform project pemilik suite (WEB/MOBILE/HARDWARE/API), null bila belum diisi. */
  platform: string | null;
};

export type SuitesPayload = { suites: SuiteOption[] };

/* ---------- /api/bugs/[id] ---------- */
export type BugDetailPayload = {
  bug: BugRow;
  /** Upload attachment butuh role QA. */
  canAttach: boolean;
  /** Ubah status bug butuh role DEVELOPER. */
  canUpdateStatus: boolean;
  /** Edit konten bug (judul/deskripsi/severity/link) butuh role DEVELOPER. */
  canEdit: boolean;
  /** Hapus bug butuh role QA. */
  canDelete: boolean;
};

/* ---------- /api/automation ---------- */
export type AutomationRowStatus =
  | "NOT_AUTOMATED"
  | "AUTOMATED"
  | "FAILING"
  | "UNSTABLE"
  | "STALE";

export type AutomationRow = {
  id: string;
  tcId: string;
  title: string;
  projectId: string | null;
  projectName: string;
  platform: PlatformCode | null;
  suiteId: string | null;
  suiteName: string;
  linkId: string | null;
  externalTestId: string | null;
  scriptPath: string | null;
  status: AutomationRowStatus;
  lastRunAt: string | null;
  lastResult: string | null;
};

export type AutomationProjectStat = {
  projectId: string;
  name: string;
  platform: PlatformCode | null;
  total: number;
  automated: number;
  failing: number;
  stale: number;
  unstable: number;
  notAutomated: number;
  coveragePct: number;
};

/** Ringkasan health automation untuk seluruh data terfilter (bukan per halaman). */
export type AutomationSummary = {
  total: number;
  automated: number;
  failing: number;
  stale: number;
  unstable: number;
  notAutomated: number;
  coveragePct: number;
};

/** Header grup per Suite untuk default view collapsed-by-suite. */
export type AutomationSuiteGroup = {
  suiteId: string;
  suiteName: string;
  projectId: string;
  projectName: string;
  platform: PlatformCode | null;
  total: number;
  automated: number;
  failing: number;
  stale: number;
  unstable: number;
  notAutomated: number;
};

export type AutomationPayload = {
  projects: { id: string; name: string; platform: PlatformCode | null }[];
  /** Agregat per project atas seluruh data terfilter (bukan per halaman). */
  projectStats: AutomationProjectStat[];
  /** Agregat global atas seluruh data terfilter (bukan per halaman). */
  summary: AutomationSummary;
  /** Statistik per Suite, mengikuti filter; dipakai untuk view collapsed. */
  suiteGroups: AutomationSuiteGroup[];
  /** Terisi HANYA saat request meminta baris (suiteId / pagination eksplisit). */
  rows: AutomationRow[];
  /** Total baris yang cocok dengan request baris tersebut (untuk pagination). */
  rowsTotal: number;
  page: number;
  perPage: number;
  canManage: boolean;
  canUpdateStatus: boolean;
};

/* ---------- /api/settings ---------- */
export type SettingsProject = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  platform: PlatformCode | null;
  docUrl: string | null;
  _count: { suites: number };
};

export type SettingsUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
};

export type SettingsPayload = { projects: SettingsProject[]; users: SettingsUser[] };

/* ---------- /api/projects/[id] ---------- */
export type ProjectSuiteNode = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  docUrl: string | null;
  totalTestCases: number;
  updatedAt: string;
  children: ProjectSuiteNode[];
};

export type ProjectTreePayload = {
  project: { id: string; name: string; code: string; platform: string | null };
  suites: ProjectSuiteNode[];
  canEdit: boolean;
};

/* ---------- /api/suites/[id] ---------- */
export type SuiteDetailTestCase = {
  id: string;
  tcId: string;
  title: string;
  scenario: string | null;
  precondition: string | null;
  steps: string | null;
  testData: string | null;
  expectedResult: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  sectionId: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
};

export type SuiteDetailPayload = {
  suite: {
    id: string;
    name: string;
    code: string;
    project: { id: string; name: string; code: string };
    parent: { id: string; name: string } | null;
    testCaseCount: number;
    description: string | null;
    docUrl: string | null;
  };
  sections: { id: string; name: string; description: string | null }[];
  testCases: SuiteDetailTestCase[];
  canEdit: boolean;
};

/* ---------- /api/test-cases/[id] ---------- */
export type TestCaseAutomationInfo = {
  id: string;
  externalTestId: string;
  scriptPath: string | null;
  status: "NOT_AUTOMATED" | "AUTOMATED" | "FAILING" | "UNSTABLE";
  lastRunAt: string | null;
  lastResult: string | null;
};

export type TestCaseBugItem = {
  id: string;
  title: string;
  description: string | null;
  status: BugStatus;
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
};

export type TestCaseActivityItem = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  user: { name: string | null } | null;
};

export type TestCaseRunHistoryItem = {
  id: string;
  status: string;
  actualResult: string | null;
  updatedAt: string;
  run: { id: string; name: string; createdAt: string; status: string };
};

export type TestCaseDetailPayload = {
  id: string;
  tcId: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  canEdit: boolean;
  scenario: string | null;
  precondition: string | null;
  steps: string | null;
  testData: string | null;
  expectedResult: string | null;
  createdAt: string;
  updatedAt: string;
  suite: {
    id: string;
    name: string;
    projectId: string;
    project: { id: string; name: string };
  } | null;
  createdBy: { name: string | null } | null;
  automation: TestCaseAutomationInfo | null;
  bugs: TestCaseBugItem[];
  activities: TestCaseActivityItem[];
  runResults: TestCaseRunHistoryItem[];
  attachments: AttachmentItem[];
};

/* ---------- /api/test-runs (active) ---------- */
export type ActiveRunRow = {
  id: string;
  runCode: string;
  name: string;
  projects: { id: string; name: string }[];
  suites: { id: string; name: string }[];
  sprint: string | null;
  status: string;
  pct: number;
  createdByName: string | null;
  /** Assignee tersimpan (penugasan manual); null = belum ditugaskan. */
  assignee: { id: string; name: string | null } | null;
  /**
   * QA yang benar-benar mengeksekusi run ini, diturunkan dari
   * TestRunResult.updatedById (bisa lebih dari satu orang). Dipakai sebagai
   * fallback tampilan saat run belum punya assignee. Kosong = belum dieksekusi.
   */
  executorNames: string[];
  createdAt: string;
};

/** Opsi project untuk filter — `platform` dipakai untuk cascading
 *  (daftar project menyempit mengikuti Platform yang dipilih). */
export type ProjectFilterOption = {
  id: string;
  name: string;
  platform: PlatformCode | null;
};

export type ActiveRunsPayload = {
  runs: ActiveRunRow[];
  canEdit: boolean;
  allProjects: ProjectFilterOption[];
  /** Kandidat assignee (user role QA) untuk dropdown di tabel. */
  assigneeOptions: { id: string; name: string | null }[];
};

/* ---------- /api/test-runs/history ---------- */
export type HistoryRunRow = {
  id: string;
  runCode: string;
  name: string;
  projects: { id: string; name: string }[];
  suites: { id: string; name: string }[];
  platforms: string | null;
  sprint: string | null;
  status: string;
  pct: number;
  qaName: string | null;
  createdAt: string;
};

export type HistoryPayload = {
  allProjects: ProjectFilterOption[];
  runs: HistoryRunRow[];
  total: number;
  page: number;
  perPage: number;
  activeCount: number;
  canDelete: boolean;
};

/* ---------- /api/test-runs/options (create form) ---------- */
export type RunOptionSuite = {
  id: string;
  name: string;
  code: string;
  path: string;
  projectId: string;
};

export type RunOptionSection = {
  id: string;
  name: string;
};

export type RunOptionTestCase = {
  id: string;
  tcId: string;
  title: string;
  suiteName: string;
  suiteId: string | null;
  projectId: string | null;
  sectionId: string | null;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
};

export type RunOptionsPayload = {
  /** `platform` dipakai untuk cascading pilihan Platform -> Project. */
  projects: { id: string; name: string; platform: PlatformCode | null }[];
  suites: RunOptionSuite[];
  testCases: RunOptionTestCase[];
  /** Section milik project, untuk mengelompokkan daftar TC. */
  sections: RunOptionSection[];
};

/* ---------- /api/test-runs/[id] ---------- */
export type RunResultBug = {
  id: string;
  title: string;
  severity: string | null;
  status: BugStatus;
  externalLink: string | null;
};

export type RunResultTestCase = {
  id: string;
  tcId: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  scenario: string | null;
  precondition: string | null;
  steps: string | null;
  expectedResult: string | null;
  createdAt: string;
  /** Section tempat TC berada (dipakai untuk header kelompok di halaman eksekusi). */
  section: { id: string; name: string } | null;
  suite: {
    id: string;
    name: string;
    projectId: string;
    project: { name: string };
  } | null;
  createdBy: { name: string | null } | null;
};

export type RunResultItem = {
  id: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";
  titleSnapshot: string;
  actualResult: string | null;
  notes: string | null;
  testCaseId: string;
  bugs: RunResultBug[];
  testCase: RunResultTestCase | null;
  /** Evidence yang di-upload pada hasil eksekusi ini. */
  attachments: AttachmentItem[];
};

export type RunDetailProjectGroup = {
  projectId: string;
  projectName: string;
  suites: string[];
  items: RunResultItem[];
};

export type RunDetailPayload = {
  runId: string;
  runName: string;
  isCompleted: boolean;
  canEdit: boolean;
  results: RunResultItem[];
  projects: RunDetailProjectGroup[];
  createdAt: string;
  completedAt: string | null;
  qaName: string | null;
  sprint: string | null;
  taskLink: string | null;
  activityType: string | null;
  platforms: string | null;
  environment: string | null;
  suites: { id: string; name: string }[];
};

/* ---------- /api/reports/weekly (Weekly Testing Report) ---------- */
export type WeeklyReportTask = {
  id: string;
  runCode: string;
  name: string;
  project: string;
  sprint: string | null;
  environment: string | null;
  activityType: string | null;
  platforms: string | null;
  taskLink: string | null;
  /** "berjalan" (PENDING/IN_PROGRESS/RE_OPEN) atau "selesai" (COMPLETED). */
  bucket: "running" | "done";
  status: string;
  completedAt: string | null;
  createdAt: string;
  counts: ExecutionCounts;
  /** executed / total dalam persen; null bila total 0. */
  progressPct: number | null;
  openBugs: number;
  criticalHighBugs: number;
};

export type WeeklyReportPayload = {
  /** Rentang tanggal laporan (ISO), inklusif. */
  period: { from: string; to: string };
  running: WeeklyReportTask[];
  done: WeeklyReportTask[];
  summary: {
    runningTasks: number;
    doneTasks: number;
    totalTC: number;
    executed: number;
    passed: number;
    failed: number;
    openBugs: number;
    /** null bila belum ada eksekusi. */
    passRate: number | null;
  };
};

/* ---------- /api/reports (Testing Inventory & Gap) ---------- */
export type ReportsCompositionItem = {
  key: string;
  label: string;
  count: number;
  /** null bila total 0 (jangan tampilkan 0%). */
  pct: number | null;
};

export type ReportsSuiteGapItem = {
  suiteId: string;
  name: string;
  projectId: string;
  projectName: string;
  platform: PlatformCode | null;
  total: number;
  /** TC yang pernah punya hasil eksekusi (definisi sama dengan Dashboard). */
  tested: number;
  /** TC yang belum pernah di-test. */
  untested: number;
};

export type ReportsSuiteWithoutTc = {
  suiteId: string;
  name: string;
  projectId: string;
  projectName: string;
};

export type ReportsOrphanTc = {
  id: string;
  tcId: string;
  title: string;
};

/** Ringkasan repository yang sudah difilter (dihitung ulang di client dari
 *  daftar suite + orphan, supaya responsif terhadap filter Platform/Project). */
export type ReportsProjectOption = {
  id: string;
  name: string;
  platform: PlatformCode | null;
};

export type ReportsPayload = {
  inventory: {
    totalTC: number;
    /** TC yang punya suite; sisanya orphan (lihat orphanTc). */
    inSuite: number;
    suites: number;
    projects: number;
    /** TC yang belum pernah di-test menurut definisi bersama. */
    untested: number;
    /** null bila total TC 0. */
    untestedPct: number | null;
  };
  priorityComposition: ReportsCompositionItem[];
  statusComposition: ReportsCompositionItem[];
  coverageGap: ReportsSuiteGapItem[];
  automation: {
    automated: number;
    /** null bila total TC 0. */
    pct: number | null;
  };
  suitesWithoutTc: ReportsSuiteWithoutTc[];
  orphanTc: ReportsOrphanTc[];
  /** Opsi filter Project (semua project, tidak terpengaruh filter). */
  projects: ReportsProjectOption[];
  /** true bila belum ada eksekusi sama sekali di sistem. */
  noExecutionYet: boolean;
};
