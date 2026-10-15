import { Dashboard } from "@/components/dashboard/dashboard";

/**
 * Dashboard "QA Testing Overview".
 *
 * Untuk saat ini dirender dari data contoh di dalam komponen (array `SUITES`,
 * `RUNS`, `BUGS`) sesuai spesifikasi desain; strukturnya sudah dipisah rapi agar
 * bisa disambungkan ke API data asli nanti.
 */
export default function Home() {
  return <Dashboard />;
}
