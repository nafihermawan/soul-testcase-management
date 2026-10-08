-- Status 'RESOLVED' dihapus dari alur pemakaian: pilihan status bug kini
-- Open → In Progress → CLOSED (lihat dropdown Bugs Tracker).
--
-- Baris lama yang masih RESOLVED dipindahkan ke CLOSED supaya tidak ada status
-- yatim yang tak lagi bisa dipilih di UI. `resolvedAt` sengaja TIDAK diubah —
-- timestamp penyelesaiannya tetap tercatat sebagai data riwayat.
--
-- Catatan: nilai enum "RESOLVED" di tipe BugStatus dibiarkan (menghapus nilai
-- enum Postgres butuh recreate type); ia kini legacy dan tidak pernah ditulis.
UPDATE "Bug" SET "status" = 'CLOSED' WHERE "status" = 'RESOLVED';
