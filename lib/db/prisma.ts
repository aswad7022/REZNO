import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { createPrismaPostgresPool } from "./postgres-transport";

const globalForPrisma = globalThis as {
  postgresPool?: ReturnType<typeof createPrismaPostgresPool>;
  prisma?: PrismaClient;
};

export const postgresPool = globalForPrisma.postgresPool ?? createPrismaPostgresPool();

const adapter = new PrismaPg(postgresPool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.postgresPool = postgresPool;
  globalForPrisma.prisma = prisma;
}
