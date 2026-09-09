# Onboarding — Soul Test Case Management

Panduan singkat untuk User memakai aplikasi ini.

## 1. Login

- Buka aplikasi, klik **Masuk dengan Google**.
- Hanya email domain **`@soulparking.co.id`** yang bisa masuk.
- Akun pertama kali otomatis dibuat dengan role **Developer** — minta QA/admin mengubah role-mu di **Settings → User & Role** kalau perlu akses penuh.

## 2. Struktur Data

```
Project (produk/aplikasi) → Suite (bisa nested) → Test Case
```

- **Project**: aplikasi (mis. Mobile, Web Admin, Hardware).
- **Suite**: grup test case di dalam project, bisa punya sub-suite tanpa batas.
- **Test Case**: langkah pengujian dengan detail skenario, steps, test data, expected result.

## 3. Alur Kerja Harian

### Membuat Test Case
1. Buka project → suite tujuan → tombol **Tambah Test Case**.
2. Isi Title (wajib) + Detail Skenario (wajib), lengkapi field lain.
3. Simpan — TC ID dibuat otomatis dari kode hierarki.

### Menjalankan Test (Express Run)
1. Menu **Test Runs** → pilih Project, centang Suite/TC → **Jalankan Express Run**.
2. Di halaman run, set status tiap TC: **Pass / Fail / Blocked / Skipped**.
3. Kalau **Fail**, klik **Buat Bug** untuk langsung mencatat bug terhubung ke TC itu.
4. Setelah selesai, klik **Selesaikan Run**.

### Melacak Bug
- Bug tampil di tab **Bugs** pada halaman detail Test Case.
- Status bug bisa diubah (Open → In Progress → Resolved → Closed) oleh QA/Developer.
- Gunakan `@TC-ID` di deskripsi bug untuk otomatis me-link ke test case.

### Automation Link
- Tab **Automation** di detail TC untuk menautkan `externalTestId` + path script.
- Hasil eksekusi CI bisa di-push ke `POST /api/automation-results` untuk auto-update/auto-create.

## 4. Role & Akses

| Role | Akses |
|---|---|
| **QA** | Full: kelola project/suite, CRUD TC, eksekusi run, bug, automation, settings |
| **Developer** | Lihat TC/bug, update status bug, update status automation |
| **Product** | View-only (dashboard & reports) |

## 5. Tips

- **Dashboard** bisa difilter per project lewat dropdown "Tampilkan Semua".
- **Reports** menampilkan coverage otomasi per project & per suite.
- **Activity Log** di detail TC mencatat siapa mengubah apa (audit trail).
- Import/export TC via CSV/XLSX tersedia di halaman suite (khusus QA).
