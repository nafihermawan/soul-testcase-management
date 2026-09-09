// Data contoh untuk visualisasi dashboard.
// Dihapus/divariabelkan saat model TestCase/TestRun/Bug sudah ada (Step 3-6).

export const mockExecution = {
  total: 1248,
  executed: 856,
  passed: 807,
  failed: 35,
  blocked: 8,
  notRun: 392,
  passRate: 94.2,
  weeklyNew: 32,
  weeklyPassRateDelta: 2.4,
};

export const mockBugs = [
  { id: "BUG-1042", title: "Pembayaran gagal saat promo diterapkan", severity: "Critical", status: "Open" },
  { id: "BUG-1041", title: "Notifikasi push tidak muncul di iOS 17", severity: "High", status: "In Progress" },
  { id: "BUG-1040", title: "Filter tanggal di laporan tidak konsisten", severity: "Medium", status: "Open" },
  { id: "BUG-1039", title: "Format angka ribuan salah di invoice", severity: "Low", status: "Resolved" },
  { id: "BUG-1038", title: "Crash saat buka detail transaksi", severity: "Critical", status: "In Progress" },
  { id: "BUG-1037", title: "Typo di email konfirmasi", severity: "Low", status: "Resolved" },
];

export const mockRuns = [
  { id: "RUN-091", name: "Regression Sprint 24", suite: "Payment", executedBy: "Nafi Hermawan", status: "In Progress", progress: 68, date: "18 Agu 2026" },
  { id: "RUN-090", name: "Smoke Test Release 2.4", suite: "Checkout", executedBy: "Dinda Ayu", status: "Completed", progress: 100, date: "17 Agu 2026" },
  { id: "RUN-089", name: "Sanity QA Mobile", suite: "Membership", executedBy: "Raka Putra", status: "Failed", progress: 42, date: "16 Agu 2026" },
  { id: "RUN-088", name: "Full Regression", suite: "HRIS", executedBy: "Sari Dewi", status: "Completed", progress: 100, date: "15 Agu 2026" },
];

// Suite contoh untuk grid hierarki (statis sampai TestCase ada)
export const mockSuites = [
  { name: "Dashboard", total: 186, executed: 152, passRate: 96.7 },
  { name: "Analytics", total: 142, executed: 98, passRate: 91.8 },
  { name: "Authentication", total: 210, executed: 174, passRate: 97.1 },
  { name: "Payments", total: 264, executed: 201, passRate: 90.5 },
  { name: "Membership", total: 190, executed: 121, passRate: 88.4 },
  { name: "HRIS", total: 256, executed: 110, passRate: 84.9 },
];
