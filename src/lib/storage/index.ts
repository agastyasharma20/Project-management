import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Storage abstraction. The database only ever holds an opaque *key* plus
 * metadata; nothing in the application constructs a filesystem path itself.
 * Swapping LOCAL for S3/Cloudinary/Supabase means implementing this interface
 * and switching STORAGE_DRIVER — no schema or call-site changes.
 */
export interface StoredObject {
  key: string;
  bytes: number;
  mimeType: string;
}

export interface StorageDriver {
  put(input: { body: Buffer; mimeType: string; prefix: string; extension: string }): Promise<StoredObject>;
  get(key: string): Promise<{ body: Buffer; mimeType: string } | null>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

function safeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "");
}

class LocalStorageDriver implements StorageDriver {
  private root = path.resolve(process.cwd(), env().STORAGE_LOCAL_DIR);

  private resolve(key: string): string {
    const parts = key.split("/").map(safeKeySegment).filter(Boolean);
    const full = path.resolve(this.root, ...parts);
    // Defence in depth: never escape the storage root, whatever the key says.
    if (!full.startsWith(this.root)) throw new Error("Invalid storage key");
    return full;
  }

  async put(input: { body: Buffer; mimeType: string; prefix: string; extension: string }): Promise<StoredObject> {
    const name = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${safeKeySegment(input.extension)}`;
    const key = `${input.prefix.split("/").map(safeKeySegment).filter(Boolean).join("/")}/${name}`;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.body);
    return { key, bytes: input.body.byteLength, mimeType: input.mimeType };
  }

  async get(key: string): Promise<{ body: Buffer; mimeType: string } | null> {
    try {
      const full = this.resolve(key);
      await stat(full);
      const body = await readFile(full);
      const ext = path.extname(full).slice(1).toLowerCase();
      const mimeType =
        Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
      return { body, mimeType };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      /* already gone */
    }
  }

  publicUrl(key: string): string {
    return `${env().STORAGE_PUBLIC_BASE}/${key}`;
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  switch (env().STORAGE_DRIVER) {
    case "LOCAL":
      driver = new LocalStorageDriver();
      return driver;
    case "S3":
      throw new Error(
        "STORAGE_DRIVER=S3 is a declared extension point but no S3 driver is configured in this build.",
      );
  }
}

export function extensionFor(mimeType: string): string {
  return MIME_EXT[mimeType] ?? "bin";
}

export function checksum(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
