"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, requestMeta } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/services/audit";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details you entered." };
  }

  const meta = await requestMeta();
  // Two limits: per-account (credential stuffing) and per-IP (spray attacks).
  const perAccount = rateLimit(`login:${parsed.data.email}`, 8, 10 * 60_000);
  const perIp = rateLimit(`login-ip:${meta.ip ?? "unknown"}`, 30, 10 * 60_000);
  if (!perAccount.allowed || !perIp.allowed) {
    return {
      error: `Too many sign-in attempts. Try again in ${Math.max(
        perAccount.retryAfterSeconds,
        perIp.retryAfterSeconds,
      )} seconds.`,
    };
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, isActive: true },
  });

  // Same message and comparable timing whether the account exists or not.
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) return { error: "Email or password is incorrect." };
  if (!user.isActive) return { error: "This account has been disabled. Contact your department office." };

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit(null, {
    action: "USER_SIGNED_IN",
    entity: "User",
    entityId: user.id,
    summary: `Signed in from ${meta.ip ?? "unknown IP"}`,
  });

  redirect("/dashboard");
}
