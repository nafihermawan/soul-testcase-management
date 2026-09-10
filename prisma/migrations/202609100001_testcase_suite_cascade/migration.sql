-- Hapus suite => test case di dalamnya IKUT TERHAPUS.
--
-- Sebelumnya FK ini memakai ON DELETE SET NULL, sehingga test case tertinggal
-- sebagai "tanpa suite" — tidak muncul di halaman suite mana pun dan
-- diam-diam tak terlihat, padahal dialog konfirmasi UI menyatakan test case
-- akan dihapus permanen. Migration ini menyelaraskan perilaku DB dengan
-- peringatan tersebut.

ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_suiteId_fkey";

ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_suiteId_fkey"
  FOREIGN KEY ("suiteId") REFERENCES "Suite"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
