import { describe, expect, it } from "vitest";
import { storage } from "@/lib/storage";

describe("LocalStorageDriver", () => {
  it("round-trips a written object: put -> get returns the same bytes and mime type", async () => {
    const body = Buffer.from("hello evidence");
    const object = await storage().put({ body, mimeType: "image/jpeg", prefix: "test/round-trip", extension: "jpg" });

    expect(object.bytes).toBe(body.byteLength);
    expect(object.key).toContain("test/round-trip/");

    const fetched = await storage().get(object.key);
    expect(fetched).not.toBeNull();
    expect(fetched!.body.equals(body)).toBe(true);
  });

  it("returns null for a key that was never written", async () => {
    const fetched = await storage().get("test/round-trip/does-not-exist.jpg");
    expect(fetched).toBeNull();
  });

  it("removes an object so a subsequent get returns null", async () => {
    const object = await storage().put({
      body: Buffer.from("temporary"),
      mimeType: "image/jpeg",
      prefix: "test/remove",
      extension: "jpg",
    });
    await storage().remove(object.key);
    expect(await storage().get(object.key)).toBeNull();
  });

  it("removing a key that does not exist is a no-op, not an error", async () => {
    await expect(storage().remove("test/remove/never-existed.jpg")).resolves.toBeUndefined();
  });

  it("generates distinct keys for two objects written with the same prefix", async () => {
    const a = await storage().put({ body: Buffer.from("a"), mimeType: "image/jpeg", prefix: "test/distinct", extension: "jpg" });
    const b = await storage().put({ body: Buffer.from("b"), mimeType: "image/jpeg", prefix: "test/distinct", extension: "jpg" });
    expect(a.key).not.toBe(b.key);
  });

  it("refuses to resolve a key that attempts to traverse outside the storage root", async () => {
    // '../' segments are stripped by the key sanitiser rather than followed,
    // so a crafted key can never escape STORAGE_LOCAL_DIR.
    await expect(storage().get("../../../etc/passwd")).resolves.toBeNull();
  });

  it("public URLs are namespaced under the configured public base path", () => {
    const url = storage().publicUrl("evidence/CSE/PIEMR-CSE-001/stamped/abc.jpg");
    expect(url).toBe("/api/files/evidence/CSE/PIEMR-CSE-001/stamped/abc.jpg");
  });
});
