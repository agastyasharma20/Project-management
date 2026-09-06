import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    await expect(verifyPassword("Correct-Horse-1", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    await expect(verifyPassword("wrong-password-1", hash)).resolves.toBe(false);
  });

  it("never stores the plaintext password in the hash", async () => {
    const plain = "Correct-Horse-1";
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
    expect(hash.startsWith("$2")).toBe(true); // bcrypt identifier
  });

  it("verifyPassword fails closed on a malformed hash instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });
});

describe("passwordProblems", () => {
  it("accepts a password with a letter, a number and 8+ characters", () => {
    expect(passwordProblems("Piemr2026")).toEqual([]);
  });

  it("flags short passwords", () => {
    expect(passwordProblems("ab1")).toContain("at least 8 characters");
  });

  it("flags passwords with no letters", () => {
    expect(passwordProblems("12345678")).toContain("a letter");
  });

  it("flags passwords with no numbers", () => {
    expect(passwordProblems("abcdefgh")).toContain("a number");
  });

  it("can report multiple problems at once", () => {
    expect(passwordProblems("ab")).toEqual(
      expect.arrayContaining(["at least 8 characters", "a number"]),
    );
  });
});
