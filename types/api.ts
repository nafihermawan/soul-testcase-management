/**
 * Tipe payload JSON untuk route handler API + view client.
 * Semua tanggal dikirim sebagai ISO string (JSON-safe).
 * Bentuk tiap payload meniru props yang dipakai komponen client eksisting.
 */
import type { Role } from "@/lib/permissions";
import type { ExecutionCounts } from "@/lib/qa-metrics";

export type PlatformCode = "WEB" | "MOBILE" | "HARDWARE" | "API";

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

export type BugRow = {
  id: string;
  title: string;
  description: string | null;
  status: BugStatus;
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  testCase: { id: string; tcId: string; title: string } | null;
  createdBy: { name: string | null } | null;
};

export type BugsPayload = { bugs: BugRow[] };

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

export type AutomationPayload = {
  projects: { id: string; name: string; platform: PlatformCode | null }[];
  suitesByProject: { projectId: string; suites: { id: string; name: string }[] }[];
  rows: AutomationRow[];
  projectStats: AutomationProjectStat[];
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
  createdAt: string;
};

export type ActiveRunsPayload = {
  runs: ActiveRunRow[];
  canEdit: boolean;
  allProjects: { id: string; name: string }[];
  total: number;
  page: number;
  perPage: number;
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
  allProjects: { id: string; name: string }[];
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

export type RunOptionTestCase = {
  id: string;
  tcId: string;
  title: string;
  suiteName: string;
  suiteId: string | null;
  projectId: string | null;
};

export type RunOptionsPayload = {
  projects: { id: string; name: string }[];
  suites: RunOptionSuite[];
  testCases: RunOptionTestCase[];
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

/* ---------- /api/reports ---------- */
export type ReportsPayload = {
  summary: { totalTC: number; executed: number; passRate: number };
  projects: { id: string; name: string; total: number; automated: number; coveragePct: number }[];
  suites: {
    suiteId: string;
    name: string;
    total: number;
    automated: number;
    coveragePct: number;
  }[];
  recentRuns: { id: string; name: string; projectName: string; status: string; createdAt: string }[];
};
