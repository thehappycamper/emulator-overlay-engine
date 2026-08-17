// Atomic JSON writer for the notification feed file the browser polls
// (P04-T003). Mirrors the write-temp-then-rename pattern already used by
// adapters/pokemon-emerald-us-rev0/atomic-json-file.js and
// adapters/gen3-mgba/atomic-json-file.js - a small local copy, consistent
// with this project's existing per-package convention, rather than a new
// shared dependency between the overlay platform layer and a game adapter.
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const nodeFileSystem = Object.freeze({ mkdir, open, rename, rm });

// Writes `{ "notifications": entries }` to `destination` atomically (a
// reader polling `destination` never observes a partially-written file).
export async function writeNotificationFeed(destination, entries, options = {}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    throw new TypeError("Notification feed destination must be a non-empty path");
  }
  if (!Array.isArray(entries)) {
    throw new TypeError("Notification feed entries must be an array");
  }

  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const target = resolve(destination);
  const directory = dirname(target);
  const temporary = join(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  let handle;

  await fileSystem.mkdir(directory, { recursive: true });
  try {
    handle = await fileSystem.open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify({ notifications: entries })}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fileSystem.rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fileSystem.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }

  return target;
}
