import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const nodeFileSystem = Object.freeze({ mkdir, open, rename, rm });

export async function writeJsonAtomically(destination, value, options = {}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    throw new TypeError("JSON destination must be a non-empty path");
  }

  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const target = resolve(destination);
  const directory = dirname(target);
  const temporary = join(directory, `.${basename(target)}.${randomUUID()}.tmp`);
  let handle;

  await fileSystem.mkdir(directory, { recursive: true });
  try {
    handle = await fileSystem.open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
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
