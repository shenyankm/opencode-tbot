import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { PendingPermissionApproval } from "../../domain/permission/approval.entity.js";

export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const HISTORY_MAX_FILES = 2000;
export const HISTORY_MAX_BYTES = 32 * 1024 * 1024;
export const PERMISSION_HISTORY_MAX_RECORDS = 1000;

export function prunePermissionHistory(records: Record<string, PendingPermissionApproval>, now = Date.now()): void {
    const entries = Object.entries(records).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));
    for (const [index, [key, value]] of entries.entries()) {
        if (now - Date.parse(value.updatedAt) > HISTORY_MAX_AGE_MS || index >= PERMISSION_HISTORY_MAX_RECORDS) {
            delete records[key];
        }
    }
}

export async function pruneThinkingHistory(directory: string, now = Date.now()): Promise<number> {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
    });
    const files = await Promise.all(entries.filter((entry) => entry.isFile() && /^-?\d+\.\d+\.json$/u.test(entry.name))
        .map(async (entry) => ({ path: join(directory, entry.name), info: await stat(join(directory, entry.name)) })));
    files.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
    let bytes = 0;
    let removed = 0;
    for (const [index, file] of files.entries()) {
        bytes += file.info.size;
        if (now - file.info.mtimeMs > HISTORY_MAX_AGE_MS || index >= HISTORY_MAX_FILES || bytes > HISTORY_MAX_BYTES) {
            await unlink(file.path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
            removed++;
        }
    }
    return removed;
}
