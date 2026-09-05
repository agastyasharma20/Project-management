import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  STORAGE_DRIVER: z.enum(["LOCAL", "S3"]).default("LOCAL"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  STORAGE_PUBLIC_BASE: z.string().default("/api/files"),
  SEED_PASSWORD: z.string().default("Piemr@2026"),
});

let cached: z.infer<typeof schema> | null = null;

/** Parsed, validated server environment. Never import this from client code. */
export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
