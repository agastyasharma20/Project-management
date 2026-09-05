import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Minimum strength enforced at every write path that sets a password. */
export function passwordProblems(plain: string): string[] {
  const problems: string[] = [];
  if (plain.length < 8) problems.push("at least 8 characters");
  if (!/[A-Za-z]/.test(plain)) problems.push("a letter");
  if (!/[0-9]/.test(plain)) problems.push("a number");
  return problems;
}
