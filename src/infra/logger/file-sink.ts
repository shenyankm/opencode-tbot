import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { FileLogSinkOptions, LogSink } from "./index.js";

export function createJsonlFileSink(options: FileLogSinkOptions): LogSink {
    const maxFiles = options.maxFiles ?? 30;
    const maxTotalBytes = options.maxTotalBytes ?? 314_572_800;
    const runtimeSegment = options.runtimeId.replace(/[^a-zA-Z0-9._-]+/gu, "_");
    const timestampSegment = new Date().toISOString().replace(/:/gu, "-");
    const filePath = join(
        options.dir,
        `${timestampSegment}.${process.pid}.${runtimeSegment}.jsonl`,
    );
    let initialized = false;
    let writeCount = 0;

    const initialize = async () => {
        if (initialized) {
            return;
        }

        await mkdir(options.dir, { recursive: true });
        await cleanupLogDirectory(options.dir, maxFiles, maxTotalBytes);
        initialized = true;
    };

    return {
        async write(event) {
            await initialize();
            await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
            writeCount += 1;

            if (writeCount === 1 || writeCount % 100 === 0) {
                await cleanupLogDirectory(options.dir, maxFiles, maxTotalBytes);
            }
        },
    };
}

async function cleanupLogDirectory(
    directory: string,
    maxFiles: number,
    maxTotalBytes: number,
): Promise<void> {
    let entries: Array<{ path: string; size: number; time: number }> = [];

    try {
        const names = await readdir(directory);

        entries = await Promise.all(
            names
                .filter((name) => name.endsWith(".jsonl"))
                .map(async (name) => {
                    const entryPath = join(directory, name);
                    const entryStat = await stat(entryPath);

                    return {
                        path: entryPath,
                        size: entryStat.size,
                        time: entryStat.mtimeMs,
                    };
                }),
        );
    } catch {
        return;
    }

    entries.sort((left, right) => right.time - left.time);

    let totalBytes = 0;
    const retained: Array<{ path: string; size: number; time: number }> = [];
    const deleted: Array<{ path: string; size: number; time: number }> = [];

    for (const entry of entries) {
        const canKeepByCount = retained.length < maxFiles;
        const canKeepBySize = retained.length === 0 || totalBytes + entry.size <= maxTotalBytes;

        if (canKeepByCount && canKeepBySize) {
            retained.push(entry);
            totalBytes += entry.size;
            continue;
        }

        deleted.push(entry);
    }

    await Promise.allSettled(
        deleted.map(async (entry) => {
            await unlink(entry.path);
        }),
    );
}

