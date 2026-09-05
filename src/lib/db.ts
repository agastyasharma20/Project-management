import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the process. Every data access in the application
 * goes through the service layer in src/lib/services — UI code never imports
 * this module directly, which is what keeps the SQLite → PostgreSQL migration
 * a configuration change rather than a refactor.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = PrismaClient;
