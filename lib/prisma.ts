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

function createPrismaClient() {
  let connectionString =
    process.env.DATABASE_URL ?? "postgresql://localhost:5432/soul_testcase";
  // Supabase (pooler/direct) mewajibkan SSL; pastikan selalu aktif bila belum ada.
  if (/supabase\.co/.test(connectionString) && !/sslmode=/.test(connectionString)) {
    connectionString += connectionString.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }
  const poolConfig: ConstructorParameters<typeof Pool>[0] = {
    connectionString,
    connectionTimeoutMillis: 15000,
    query_timeout: 25000,
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
