import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadDb, sha256File, writeHash } from "../etl/db-file.ts";

const BYTES = Buffer.from("SQLite format 3\0 pretend database");
const HEX = createHash("sha256").update(BYTES).digest("hex");
const serve = (body: Buffer, status = 200) => (async () => new Response(new Uint8Array(body), { status })) as unknown as typeof fetch;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "circa-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the database file", () => {
  it("writes the hash etl:load commits", async () => {
    const db = join(dir, "circa.db");
    writeFileSync(db, BYTES);
    expect(await writeHash(db, join(dir, "hash"))).toBe(HEX);
    expect(readFileSync(join(dir, "hash"), "utf8")).toBe(`${HEX}\n`);
    expect(await sha256File(db)).toBe(HEX);
  });

  it("downloads a file whose hash matches", async () => {
    const dest = join(dir, "data", "circa.db");
    await downloadDb("https://example.test/db", dest, HEX, serve(BYTES));
    expect(readFileSync(dest)).toEqual(BYTES);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it("refuses a file whose hash does not match, and leaves nothing behind", async () => {
    const dest = join(dir, "circa.db");
    await expect(downloadDb("https://example.test/db", dest, "0".repeat(64), serve(BYTES))).rejects.toThrow(/does not match/);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it("fails on an HTTP error", async () => {
    await expect(downloadDb("https://example.test/db", join(dir, "circa.db"), HEX, serve(Buffer.from("nope"), 404))).rejects.toThrow(/HTTP 404/);
  });
});
