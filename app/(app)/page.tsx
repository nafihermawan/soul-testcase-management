import { Dashboard } from "@/components/dashboard/dashboard";

/**
 * Dashboard "QA Testing Overview".
 *
 * Komponen `Dashboard` mengambil sendiri data live dari `/api/dashboard`
 * (client-rendered) dan merevalidasi di background: saat tab kembali fokus,
 * setiap 45 detik, serta selalu sekali saat mount — jadi angka metrik tidak
 * pernah tertinggal dari kondisi database.
 */
export default function Home() {
  return <Dashboard />;
}
