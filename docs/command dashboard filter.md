# AI Command — Dashboard Filter Bar

## Konteks

Halaman Dashboard saat ini menampilkan Total Test Cases, Automation Coverage,
Pass Rate, Open Bugs, Coverage Matrix per Suite, Execution Summary, Recent
Test Runs, dan Recent Bugs — tapi belum ada filter global yang konsisten
diterapkan ke semua card (dropdown "Tampilkan Semua" yang ada sekarang belum
jelas cakupannya).

## Task

Implementasikan filter bar global di halaman Dashboard yang menggantikan/
melengkapi dropdown "Tampilkan Semua" yang sudah ada, dengan atribut filter
berikut:

1. **Project** — multi-select, berdasarkan model `Project`.
2. **Environment** — multi-select (Web/Mobile/Hardware), berdasarkan field
   `environment` di model `Project`.
3. **Suite** — opsional, filter ke level Suite tertentu (misal cuma level 1),
   dependent pada Project yang dipilih.
4. **Date range** — untuk data TestRun & Bug. Sediakan preset: 7 hari
   terakhir, 30 hari terakhir, custom range (date picker).
5. **TC Status** — sesuai enum status TestCase yang ada di schema (mis.
   Active/Draft/Deprecated).
6. **Automation status** — Automated / Manual-only / Stale / Flaky,
   berdasarkan `AutomationLink` dan hasil deteksi stale/flaky (kalau sudah
   diimplementasikan; kalau belum, siapkan filter-nya dulu dan tandai
   sebagai TODO sampai deteksi stale/flaky selesai).
7. **Priority/Severity** — untuk Bug (Critical/High/Medium/Low) dan TestCase
   (Priority), multi-select.

## Requirement teknis

- Semua card di Dashboard (Total Test Cases, Automation Coverage, Pass Rate,
  Open Bugs, Coverage Matrix per Suite, Execution Summary, Recent Test Runs,
  Recent Bugs) HARUS ikut ter-filter oleh filter bar ini — tidak boleh ada
  card yang lolos dari filter yang sedang aktif.
- Filter Project dan Environment bisa aktif bersamaan (tidak mutually
  exclusive) — keduanya saling melengkapi, bukan menggantikan.
- Simpan state filter di URL query params (mis. `?project=hris,spn-finder&env=mobile&range=30d`)
  supaya filter state bisa di-share via link antar anggota tim.
- Default state saat pertama buka Dashboard: gunakan Project yang terakhir
  diakses user (per-user preference, simpan di local state/DB), dengan
  tombol eksplisit untuk reset ke "Semua Project".
- Query filter dieksekusi di server (server component/server action), bukan
  filter di client setelah data lengkap di-fetch — supaya tetap ringan untuk
  jumlah TC yang besar.

## Yang TIDAK perlu dikerjakan sekarang

- Saved filter presets per user (bisa jadi fase lanjutan).
- Filter berdasarkan User/assignee (belum dibahas, jangan diasumsikan).