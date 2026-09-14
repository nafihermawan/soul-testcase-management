import { config as loadEnv } from "dotenv";
import { createRequire } from "module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Ensure .env wins over any stale DATABASE_URL exported in the shell/IDE env.
loadEnv({ override: true });

const require = createRequire(import.meta.url);
const { Pool } = require("pg") as typeof import("pg");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: InstanceType<typeof Pool> | undefined;
};

/**
 * Batas koneksi pool per instance.
 *
 * Sejak DATABASE_URL menunjuk transaction pooler Supabase (port 6543), koneksi
 * client di-multiplex oleh Supavisor. Namun pooler menolak > 15 client
 * (`EMAXCONNSESSION ... pool_size: 15`), jadi `max` per instance harus kecil.
 *
 * Nilai 3 dipilih dari pengukuran (lihat docs/AUDIT-Performa-Navigasi.md §6):
 * batch 8 query /api/dashboard butuh 922ms pada max=1, 751ms pada max=2, dan
 * tidak membaik lagi di atas 3 (736ms). Jadi 3 adalah titik optimal — cukup
 * untuk query paralel, tanpa menghabiskan kuota client pooler.
 */
const POOL_MAX = 3;

function createPrismaClient() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/soul_testcase";
  // Supabase memakai sertifikat sendiri; aktifkan TLS tanpa verifikasi CA penuh.
  const isSupabase = /supabase\.co/.test(connectionString);
  const poolConfig: ConstructorParameters<typeof Pool>[0] = {
    connectionString,
    max: POOL_MAX,
    connectionTimeoutMillis: 15000,
    query_timeout: 25000,
    ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
  };
  const pool = new Pool({
    ...poolConfig,
    // paksa IPv4: di lingkungan serverless (Vercel) resolusi IPv6 bisa menggantung
    family: 4,
  } as ConstructorParameters<typeof Pool>[0] & { family: number });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

const { prisma, pool } = globalForPrisma.prisma
  ? { prisma: globalForPrisma.prisma, pool: globalForPrisma.pool }
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export { prisma, pool };
