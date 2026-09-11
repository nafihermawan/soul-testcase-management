-- Tambah dua status TestRun:
--   PENDING : run sudah dibuat, testing belum dimulai
--   RE_OPEN : pernah COMPLETED, dibuka lagi untuk retest/regresi
--
-- CATATAN: `ALTER TYPE ... ADD VALUE` tidak boleh memakai nilai barunya di
-- transaksi yang sama (aturan Postgres). Karena itu migration ini HANYA
-- menambah nilai — tidak ada UPDATE/backfill di sini. Bila perlu mengisi
-- data dengan nilai baru, buat migration terpisah.

ALTER TYPE "RunStatus" ADD VALUE 'PENDING';
ALTER TYPE "RunStatus" ADD VALUE 'RE_OPEN';
