import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeNotificationFeed } from "../src/overlay/write-notification-feed.js";

test("writes { notifications: [...] } and leaves no temp file behind on success", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-feed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "notifications.json");
  const entries = [{ id: "n1", message: "hi", severity: "info", deliveredAt: 0 }];

  await writeNotificationFeed(destination, entries);

  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), { notifications: entries });
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), false);
});

test("creates the destination directory if it does not exist yet", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-feed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "nested", "notifications.json");

  await writeNotificationFeed(destination, []);
  assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), { notifications: [] });
});

test("a rename failure cleans up the temp file and propagates the error, leaving no partial write", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "notification-feed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "notifications.json");

  const realFs = await import("node:fs/promises");
  const fileSystem = {
    mkdir: realFs.mkdir,
    open: realFs.open,
    rm: realFs.rm,
    rename: async () => { throw new Error("simulated rename failure"); },
  };

  await assert.rejects(() => writeNotificationFeed(destination, [], { fileSystem }), /simulated rename failure/);
  await assert.rejects(() => readFile(destination, "utf8"), { code: "ENOENT" });
  assert.equal((await readdir(directory)).some((name) => name.endsWith(".tmp")), false);
});

test("rejects a non-string destination or non-array entries", async () => {
  await assert.rejects(() => writeNotificationFeed(null, []), TypeError);
  await assert.rejects(() => writeNotificationFeed("", []), TypeError);
  await assert.rejects(() => writeNotificationFeed("/tmp/x.json", "not-an-array"), TypeError);
});
