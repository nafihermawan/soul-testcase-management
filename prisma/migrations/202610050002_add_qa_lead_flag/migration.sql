-- Flag "Lead QA": pembeda di dalam role QA untuk membuka halaman QA Performance
-- Analytics. Additive — default false, jadi tidak ada user lama yang otomatis
-- mendapat akses; Lead ditentukan lewat Settings.
ALTER TABLE "User" ADD COLUMN "isQaLead" BOOLEAN NOT NULL DEFAULT false;
