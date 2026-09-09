# Soul Test Case Management

Internal tool QA untuk mengelola test case, test run/execution, automation links, dan bugs — SoulParking.

## Fitur

- **Test case & suite hierarchy** — project → suite (bisa bersarang) → section → test case, dengan import/export CSV & XLSX.
- **Test Run / Execution** — buat run (Express Run), eksekusi per test case (Pass/Fail/Blocked/Skipped), complete run, riwayat + laporan.
- **Report & PDF** — halaman report khusus cetak (print-optimized) plus tombol *Download PDF* (jsPDF + html2canvas).
- **Automation** — link external test ID, status automation (auto/FAILING/UNSTABLE/STALE), sinkronisasi hasil CI via webhook `POST /api/automation-results`.
- **Bugs** — create/update status, tautan ke test case & hasil run; bug selesai otomatis menandai hasil FAIL terkait menjadi PASS.
- **Role-based access** — `QA` (full/superuser), `DEVELOPER`, `PRODUCT` (view). Semua data client-rendered lewat REST API (`app/api/**`); mutasi via server actions dengan pemeriksaan role di server.

## Stack

Next.js 14 (App Router, client-side rendering), React 18, Prisma 7 + PostgreSQL, NextAuth (Google OAuth), lucide-react, jsPDF/html2canvas.

## Menjalankan Lokal

```bash
cp .env.example .env   # isi DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET
npm install
npx prisma generate
npx prisma migrate deploy   # atau npx prisma db push untuk database baru
npm run dev
```

Buka http://localhost:3000 dan login dengan email `@soulparking.co.id`.

## Deploy di Vercel

1. Import repository di Vercel (framework Next.js terdeteksi otomatis).
2. Set Environment Variables: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
3. `postinstall` menjalankan `prisma generate` otomatis saat build.
4. Tambahkan redirect URI OAuth: `https://<domain>/api/auth/callback/google`.

Dokumentasi detail: [`docs/ONBOARDING.md`](docs/ONBOARDING.md).
